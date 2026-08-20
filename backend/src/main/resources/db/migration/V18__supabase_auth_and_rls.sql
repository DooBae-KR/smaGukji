-- 인증·권한을 Spring 세션에서 «Supabase Auth + RLS» 로 옮긴다.
--
-- 왜 옮기나
--   Render 무료 인스턴스는 15분 유휴 후 잠들고 깨는 데 수십 초가 걸린다.
--   인사팀 화면이 거기 묶여 있으면 첫 화면인 로그인부터 멈춘다.
--   Supabase 는 항상 켜져 있으므로 «데이터 평면» 을 이쪽으로 내리고,
--   Render 에는 «계산 평면»(덱 추천 시뮬레이션, 시트 파싱)만 남긴다.
--
-- ⚠️ 이 파일은 보안 경계 그 자체다. 프론트에 anon 키가 나가는 순간
--    public 스키마의 모든 테이블이 PostgREST 로 노출되므로, 여기서 막지 못한 것은
--    인터넷에 그대로 열린다. 정책이 없는 테이블은 «기본 거부» 라 안전하지만,
--    RLS 가 꺼진 테이블은 완전히 열린다. 그래서 아래에서 전부 확인한다.
--
-- 보존해야 할 기존 불변식 (Java 에 있던 것)
--   1. 역할 3단계 ADMIN / OFFICER / MEMBER
--   2. 인사 탭은 ADMIN·OFFICER 만. MEMBER 는 완전 차단
--   3. OFFICER 는 «자기 동맹만». ADMIN 은 전 동맹
--   4. 회원가입 시 그 동맹의 첫 가입자는 OFFICER, 이후는 MEMBER. ADMIN 은 가입으로 못 만듦
--   5. 계정 역할 변경은 ADMIN 만
--   6. 주의(CAUTION) 마커를 켤 때는 사유가 반드시 있어야 함
--   7. 기록자(created_by/updated_by)는 클라이언트가 정하지 못함
--   8. 비활성 계정은 아무것도 못 함
--   9. 동맹을 임의로 만들어 남의 데이터에 끼어들 수 없음

-- ---------------------------------------------------------------
-- 0. 마이그레이션 이력 테이블은 여기서 닫지 않는다
--
-- flyway_schema_history 는 RLS 가 꺼진 채 anon 에 열려 있어 닫아야 하지만,
-- 그 일을 «마이그레이션 안에서» 하면 안 된다.
-- Flyway 는 마이그레이션이 도는 동안 별도 커넥션으로 이력 테이블에 락을 걸어둔다.
-- 같은 트랜잭션에서 그 테이블을 ALTER 하면 자기 락을 기다리다 멈춘다
-- (실제로 SQLSTATE 57014 statement timeout 으로 실패했다).
--
-- 그래서 SchemaHardening 이 기동 완료 후, 락이 풀린 뒤에 처리한다.
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- 1. 프로필 — auth.users 와 우리 도메인(동맹·역할)을 잇는다
--
-- auth.users 는 Supabase 소유라 손대지 않는다. 역할과 동맹은 여기에 둔다.
-- login_id 는 화면 표시용이며, 진짜 신원은 auth.users 가 가진다.
-- (로그인은 «아이디»로 하지만 Supabase 는 이메일 기반이라
--  프론트가 <아이디>@도메인 형태로 합성해서 넘긴다. 로컬파트가 곧 login_id 다)
-- ---------------------------------------------------------------
create table app_profile (
    user_id      uuid        primary key references auth.users (id) on delete cascade,
    alliance_id  uuid        references alliance (id) on delete set null,
    role         text        not null,
    login_id     text        not null,
    display_name text        not null,
    cid          text,
    active       boolean     not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint uq_app_profile_login unique (login_id),
    constraint ck_app_profile_role check (role in ('ADMIN', 'OFFICER', 'MEMBER'))
);

create index idx_app_profile_alliance on app_profile (alliance_id, role);
create index idx_app_profile_cid on app_profile (alliance_id, cid);

create trigger trg_app_profile_updated_at
    before update on app_profile
    for each row execute function set_updated_at();

alter table app_profile enable row level security;

comment on table app_profile is 'auth.users 에 동맹·역할을 붙인다. 이 앱 전용이며 게임 계정이 아니다';
comment on column app_profile.login_id is '화면 표시용 아이디. 합성 이메일의 로컬파트와 같다';

-- ---------------------------------------------------------------
-- 2. 헬퍼 — 정책에서 쓰는 «현재 사용자» 판별
--
-- 반드시 security definer 여야 한다. 정책 안에서 app_profile 을 그냥 select 하면
-- 그 select 에 다시 app_profile 정책이 걸려 무한 재귀가 난다.
-- definer 는 소유자(postgres) 권한으로 돌아 RLS 를 우회하므로 재귀가 끊긴다.
--
-- search_path = '' 로 두어 검색 경로 조작으로 다른 테이블을 가리키게 만드는 공격을 막는다.
-- 그래서 아래 모든 참조는 스키마까지 적는다.
-- ---------------------------------------------------------------
create or replace function app_me()
returns app_profile
language sql
stable
security definer
set search_path = ''
as $$
    select p.* from public.app_profile p
     where p.user_id = auth.uid() and p.active
$$;

comment on function app_me() is '현재 로그인한 사용자의 프로필. 비활성 계정은 아무 행도 돌려주지 않는다';

create or replace function app_role()
returns text language sql stable security definer set search_path = '' as $$
    select (public.app_me()).role
$$;

create or replace function app_login_id()
returns text language sql stable security definer set search_path = '' as $$
    select (public.app_me()).login_id
$$;

create or replace function app_alliance_id()
returns uuid language sql stable security definer set search_path = '' as $$
    select (public.app_me()).alliance_id
$$;

create or replace function app_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.app_role() = 'ADMIN', false)
$$;

-- 인사 탭 사용 자격. MEMBER 는 시뮬레이션만 쓰므로 여기서 걸러진다.
create or replace function app_can_manage_hr()
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce(public.app_role() in ('ADMIN', 'OFFICER'), false)
$$;

-- 이 동맹의 인사 데이터를 다룰 수 있나.
--
-- 이 함수가 동맹 간 격리의 전부다. 예전에 A동맹 계정으로 로그인한 뒤 파라미터만
-- B동맹으로 바꿔 남의 명부를 읽는 버그가 있었다. 이제는 파라미터가 아니라
-- «로그인한 사람의 프로필» 이 유일한 권위 값이다.
create or replace function app_can_access_alliance(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select case
        when not public.app_can_manage_hr() then false
        when public.app_is_admin()          then true   -- 관리자는 시스템 전체 역할
        else target is not null and target = public.app_alliance_id()
    end
$$;

comment on function app_can_access_alliance(uuid) is
    '동맹 간 격리의 단일 지점. 간부진은 자기 동맹만, 관리자는 전체';

-- ---------------------------------------------------------------
-- 3. 권한 초기화
--
-- RLS 는 «걸러내기»일 뿐 GRANT 를 대신하지 않는다. 둘 다 있어야 읽힌다.
-- 반대로 GRANT 만 있고 정책이 없으면 «기본 거부» 라 아무것도 안 읽힌다.
-- 여기서 전부 회수한 뒤 필요한 것만 다시 준다.
--
-- anon 은 아무 테이블도 필요 없다. 로그인은 PostgREST 가 아니라 GoTrue 가 처리한다.
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ---------------------------------------------------------------
-- 4. 정책
--
-- 원칙: 읽기는 정책으로, 쓰기는 되도록 RPC 로.
-- 규칙이 «한 테이블 안»에서 끝나면 정책으로 충분하지만,
-- «주의를 켜려면 사유가 있어야 한다» 처럼 두 테이블에 걸치는 규칙은
-- 정책으로 표현할 수 없다. 그런 건 아래 6번의 security definer 함수로만 열어둔다.
-- ---------------------------------------------------------------

-- 프로필: 본인 것과, 관리자는 전부.
create policy app_profile_select on app_profile
    for select to authenticated
    using (user_id = auth.uid() or app_is_admin());

grant select on app_profile to authenticated;

-- 동맹: 자기 동맹, 관리자는 전부. 만들기·고치기는 RPC 로만.
create policy alliance_select on alliance
    for select to authenticated
    using (app_is_admin() or id = app_alliance_id());

grant select on alliance to authenticated;

-- 주차 스냅샷: 읽기 전용. 적재는 xlsx 파싱이 필요해 Render 가 맡는다.
create policy member_week_select on member_week
    for select to authenticated
    using (app_can_access_alliance(alliance_id));

grant select on member_week to authenticated;

-- 마커: 읽기만 연다. 켜고 끄는 것은 app_toggle_marker() 로만 한다.
-- 직접 쓰기를 열어두면 «주의는 사유 필수» 규칙을 건너뛰고 마커만 켤 수 있다.
create policy member_marker_select on member_marker
    for select to authenticated
    using (app_can_access_alliance(alliance_id));

grant select on member_marker to authenticated;

-- 주의 사유: 읽기·쓰기 모두 정책으로 충분하다(한 테이블 안에서 끝난다).
-- 기록자는 아래 트리거가 강제하므로 클라이언트가 남의 이름으로 적을 수 없다.
create policy caution_select on caution_note
    for select to authenticated
    using (app_can_access_alliance(alliance_id));

create policy caution_insert on caution_note
    for insert to authenticated
    with check (app_can_access_alliance(alliance_id));

create policy caution_update on caution_note
    for update to authenticated
    using (app_can_access_alliance(alliance_id))
    with check (app_can_access_alliance(alliance_id));

create policy caution_delete on caution_note
    for delete to authenticated
    using (app_can_access_alliance(alliance_id));

grant select, insert, update, delete on caution_note to authenticated;

-- ---------------------------------------------------------------
-- 공용 참조 데이터 — 로그인한 사람이면 누구나 읽는다.
-- 쓰기는 열지 않는다. 시트 동기화와 시뮬레이션은 Render 가 postgres 로 처리한다.
-- (postgres 는 테이블 소유자라 RLS 를 우회한다)
-- ---------------------------------------------------------------
create policy general_select     on general     for select to authenticated using (true);
create policy tactic_select      on tactic      for select to authenticated using (true);
create policy asset_image_select on asset_image for select to authenticated using (true);
create policy menu_item_select   on menu_item   for select to authenticated using (true);
create policy agent_team_select  on agent_team  for select to authenticated using (true);
create policy agent_staff_select on agent_staff for select to authenticated using (true);
create policy agent_thought_select on agent_thought for select to authenticated using (true);
create policy team_select        on team        for select to authenticated using (true);
create policy team_slot_select   on team_slot   for select to authenticated using (true);
create policy team_slot_tactic_select on team_slot_tactic for select to authenticated using (true);

grant select on general, tactic, asset_image, menu_item,
                agent_team, agent_staff, agent_thought,
                team, team_slot, team_slot_tactic
           to authenticated;

-- app_user / app_account / app_session 은 일부러 정책을 만들지 않는다.
-- 예전 Spring 세션 방식이 쓰던 테이블이라, 이전이 끝나면 지운다.
-- 그때까지는 «기본 거부» 로 두어 anon·authenticated 어느 쪽에서도 보이지 않게 한다.

-- ---------------------------------------------------------------
-- 5. 기록자 강제
--
-- created_by 를 클라이언트가 정하게 두면 남의 이름으로 주의를 남길 수 있다.
-- 로그인한 사람이면 JWT 에서 뽑은 값으로 덮어쓴다.
-- Render(postgres) 가 넣을 때는 app_login_id() 가 비므로 넘어온 값을 그대로 둔다.
-- ---------------------------------------------------------------
create or replace function app_force_caution_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.created_by := coalesce(public.app_login_id(), new.created_by);

    -- 해제 시각도 클라이언트가 정하지 못하게 한다.
    if tg_op = 'UPDATE' then
        if new.resolved and not old.resolved then
            new.resolved_at := now();
        elsif not new.resolved then
            new.resolved_at := null;
        else
            new.resolved_at := old.resolved_at;
        end if;
        new.created_by := old.created_by;   -- 작성자는 나중에 바뀌지 않는다
        new.alliance_id := old.alliance_id; -- 동맹을 옮겨 남의 동맹으로 넘기지 못하게
        new.cid := old.cid;
    end if;
    return new;
end
$$;

create trigger trg_caution_author
    before insert or update on caution_note
    for each row execute function app_force_caution_author();

-- ---------------------------------------------------------------
-- 6. RPC — 정책으로 표현할 수 없는 규칙
--
-- 정책은 «이 행을 봐도 되나» 만 판단한다. 여러 테이블에 걸친 규칙이나
-- «누가 어떤 값을 정하는가» 는 표현할 수 없다. 그런 것만 여기 둔다.
-- 전부 security definer 이므로 첫 줄에서 반드시 권한을 직접 확인한다.
-- ---------------------------------------------------------------

/*
 * 회원가입 마무리. Supabase 로 계정을 만든 «직후» 프론트가 호출한다.
 *
 * 역할을 인자로 받지 않는 것이 핵심이다. 받으면 누구나 자기를 관리자라고 주장할 수 있다.
 * login_id 도 JWT 의 이메일에서 뽑는다. 클라이언트가 남의 아이디를 적을 수 없다.
 *
 * 역할 결정
 *   동맹을 «새로 만든» 사람  → OFFICER(간부진)
 *   이미 있는 동맹에 «합류»  → MEMBER(동맹원)
 *
 * 기존 Java 는 «그 동맹의 첫 가입자» 를 간부진으로 삼았는데, 그러면 이미 명부가
 * 올라가 있는 동맹에 남이 먼저 가입해 인사 데이터를 통째로 가져갈 수 있다.
 * 지금은 인터넷에 열려 있으므로 «만든 사람» 으로 좁힌다.
 * 합류한 사람의 승격은 관리자가 app_set_role() 로 한다.
 */
create or replace function app_register(
    p_server text,
    p_alliance_name text,
    p_display_name text,
    p_cid text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_uid      uuid := auth.uid();
    v_email    text := auth.jwt() ->> 'email';
    v_login    text;
    v_alliance uuid;
    v_created  boolean := false;
    v_role     text;
begin
    if v_uid is null then
        raise exception '로그인 상태가 아닙니다.' using errcode = '28000';
    end if;
    if exists (select 1 from public.app_profile p where p.user_id = v_uid) then
        raise exception '이미 등록을 마친 계정입니다.' using errcode = '23505';
    end if;

    v_login := split_part(coalesce(v_email, ''), '@', 1);
    if btrim(v_login) = '' then
        raise exception '계정 아이디를 확인할 수 없습니다.' using errcode = '22023';
    end if;
    if btrim(coalesce(p_server, '')) = '' or btrim(coalesce(p_alliance_name, '')) = '' then
        raise exception '서버와 동맹 이름은 필수입니다.' using errcode = '22023';
    end if;
    if btrim(coalesce(p_display_name, '')) = '' then
        raise exception '표시 이름은 필수입니다.' using errcode = '22023';
    end if;

    -- for update 로 같은 동맹에 동시에 가입할 때의 경쟁을 막는다.
    -- 이게 없으면 둘 다 «내가 만든 사람» 으로 판단할 수 있다.
    select a.id into v_alliance
      from public.alliance a
     where a.server = btrim(p_server) and a.name = btrim(p_alliance_name)
       for update;

    if v_alliance is null then
        insert into public.alliance (server, name)
        values (btrim(p_server), btrim(p_alliance_name))
        returning id into v_alliance;
        v_created := true;
    end if;

    v_role := case when v_created then 'OFFICER' else 'MEMBER' end;

    insert into public.app_profile (user_id, alliance_id, role, login_id, display_name, cid)
    values (v_uid, v_alliance, v_role, v_login, btrim(p_display_name),
            nullif(btrim(coalesce(p_cid, '')), ''));

    return json_build_object(
        'loginId', v_login,
        'role', v_role,
        'allianceId', v_alliance,
        'allianceCreated', v_created,
        'note', case when v_created then null
                     else '기존 동맹에 합류했습니다. 인사 권한은 관리자가 부여합니다.' end);
end
$fn$;

/*
 * 마커 켜기/끄기.
 *
 * member_marker 에 직접 쓰기를 열지 않은 이유가 이것이다.
 * «주의를 켤 때는 사유가 반드시 있어야 한다» 는 규칙이 두 테이블에 걸쳐 있어
 * 정책만으로는 강제할 수 없다. 직접 쓰기가 열려 있으면 사유 없이 마커만 켤 수 있다.
 */
create or replace function app_toggle_marker(
    p_alliance_id uuid,
    p_cid text,
    p_marker_type text,
    p_enabled boolean,
    p_reason text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_actor text := public.app_login_id();
    v_type  text := upper(btrim(coalesce(p_marker_type, '')));
    v_row   public.member_marker;
begin
    if not public.app_can_access_alliance(p_alliance_id) then
        raise exception '본인 소속 동맹만 관리할 수 있습니다.' using errcode = '42501';
    end if;
    if v_type not in ('CAUTION', 'GILJAK', 'ACTIVE') then
        raise exception '알 수 없는 마커 종류입니다.' using errcode = '22023';
    end if;
    if btrim(coalesce(p_cid, '')) = '' then
        raise exception 'cid 는 필수입니다.' using errcode = '22023';
    end if;
    if v_type = 'CAUTION' and p_enabled and btrim(coalesce(p_reason, '')) = '' then
        raise exception '주의를 켤 때는 사유가 필요합니다.' using errcode = '22023';
    end if;

    insert into public.member_marker (alliance_id, cid, marker_type, enabled, updated_by)
    values (p_alliance_id, btrim(p_cid), v_type, p_enabled, v_actor)
    on conflict (alliance_id, cid, marker_type)
    do update set enabled = excluded.enabled, updated_by = excluded.updated_by
    returning * into v_row;

    -- 주의를 켰다면 사유를 함께 남긴다. 이 둘은 한 트랜잭션이어야 한다.
    if v_type = 'CAUTION' and p_enabled then
        insert into public.caution_note (alliance_id, cid, reason, created_by)
        values (p_alliance_id, btrim(p_cid), btrim(p_reason), v_actor);
    end if;

    return json_build_object('cid', v_row.cid, 'markerType', v_row.marker_type,
                             'enabled', v_row.enabled, 'updatedBy', v_row.updated_by);
end
$fn$;

/*
 * 역할 변경. 관리자만.
 *
 * 자기 자신은 바꾸지 못하게 막는다. 마지막 관리자가 스스로를 강등하면
 * 아무도 역할을 되돌릴 수 없어 시스템이 잠긴다.
 */
create or replace function app_set_role(p_user_id uuid, p_role text)
returns json
language plpgsql
security definer
set search_path = ''
as $fn$
declare
    v_role text := upper(btrim(coalesce(p_role, '')));
begin
    if not public.app_is_admin() then
        raise exception '관리자만 역할을 바꿀 수 있습니다.' using errcode = '42501';
    end if;
    if p_user_id = auth.uid() then
        raise exception '자기 자신의 역할은 바꿀 수 없습니다.' using errcode = '42501';
    end if;
    if v_role not in ('ADMIN', 'OFFICER', 'MEMBER') then
        raise exception '알 수 없는 역할입니다.' using errcode = '22023';
    end if;

    update public.app_profile set role = v_role where user_id = p_user_id;
    if not found then
        raise exception '해당 계정을 찾을 수 없습니다.' using errcode = '02000';
    end if;

    return json_build_object('userId', p_user_id, 'role', v_role,
                             'note', '해당 계정은 다시 로그인해야 새 권한이 적용됩니다.');
end
$fn$;

/* 계정 사용 중지/재개. 지우는 대신 막는다(기록을 남기기 위해). 관리자만. */
create or replace function app_set_active(p_user_id uuid, p_active boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $fn$
begin
    if not public.app_is_admin() then
        raise exception '관리자만 수행할 수 있습니다.' using errcode = '42501';
    end if;
    if p_user_id = auth.uid() then
        raise exception '자기 자신은 중지할 수 없습니다.' using errcode = '42501';
    end if;

    update public.app_profile set active = p_active where user_id = p_user_id;
    if not found then
        raise exception '해당 계정을 찾을 수 없습니다.' using errcode = '02000';
    end if;
    return json_build_object('userId', p_user_id, 'active', p_active);
end
$fn$;

-- ---------------------------------------------------------------
-- 7. 함수 실행 권한
--
-- ⚠️ Postgres 는 함수를 만들 때 PUBLIC 에 EXECUTE 를 자동으로 준다.
--    3번의 revoke 는 그 뒤에 만들어진 함수에는 적용되지 않고, 애초에
--    anon/authenticated 는 PUBLIC 을 통해 상속받으므로 그것만으로는 부족하다.
--    여기서 PUBLIC 에서 명시적으로 회수한 뒤 authenticated 에만 다시 준다.
-- ---------------------------------------------------------------
do $grants$
declare f record;
begin
    for f in
        select p.oid::regprocedure as sig
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname like 'app!_%' escape '!'
    loop
        execute format('revoke all on function %s from public, anon', f.sig);
        execute format('grant execute on function %s to authenticated', f.sig);
    end loop;
end
$grants$;

comment on function app_register(text, text, text, text) is
    '회원가입 마무리. 역할을 인자로 받지 않는다(스스로 관리자를 자칭하지 못하게)';
comment on function app_toggle_marker(uuid, text, text, boolean, text) is
    '마커 토글. 주의를 켤 때 사유를 강제하기 위해 직접 쓰기 대신 이 함수만 연다';
