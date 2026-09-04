-- 보스 타이머. 로그인 시스템과 무관한 별도의 공개 페이지에서 쓴다.
--
-- 왜 별도인가
--   동맹원이 아닌 사람도 링크만 있으면 보고, 방 비밀번호만 알면 고칠 수 있어야 한다.
--   app_profile 로그인/역할과 엮으면 그때마다 계정을 만들어야 해서 취지에 안 맞는다.
--
-- 비밀번호를 애플리케이션이 아니라 DB 함수(SECURITY DEFINER)에서 확인하는 이유
--   anon 키는 누구나 볼 수 있다. 테이블에 직접 update 권한을 주면 비밀번호 검증을
--   프론트가 우회할 수 있으므로, 쓰기는 전부 이 파일의 RPC 함수를 통해서만 하고
--   테이블 자체는 anon/authenticated 어느 쪽에도 직접 권한을 주지 않는다.
--
-- 카카오톡 알림
--   보스 등장 5분 전 이벤트를 어느 대행사(알림톡)로 보낼지 아직 정하지 않았다(2026-09-04).
--   대신 사용자가 직접 운영하는 봇이 boss_timer_due_alerts() 를 주기적으로 폴링해
--   가져가는 방식으로 만든다. 폴링 토큰은 방 비밀번호와 다른 별도 값이라 봇에게
--   방 비밀번호(수정 권한)까지 줄 필요가 없다.

create table boss_timer_room (
    id                uuid        primary key default gen_random_uuid(),
    slug              text        not null unique,
    password_hash     text        not null,
    poll_token_hash   text        not null,
    notice            text        not null default '',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create trigger trg_boss_timer_room_updated_at
    before update on boss_timer_room
    for each row execute function set_updated_at();

create table boss_timer (
    id                    uuid        primary key default gen_random_uuid(),
    room_id               uuid        not null references boss_timer_room (id) on delete cascade,

    -- 화면의 "1-1" 같은 표시용 번호. 정렬에는 쓰지 않고 그대로 보여주기만 한다.
    seq_label             text        not null default '',
    name                  text        not null,
    sort_order            integer     not null default 0,

    -- O/X. 다음 등장 정보를 계속 추적할지 여부(죽은 필드 보스 등을 꺼 두는 용도).
    is_active             boolean     not null default true,

    next_spawn_at         timestamptz not null,
    respawn_interval_min  integer     not null default 0,

    -- 등장 5분 전 알림을 이미 큐에 넣었는지. 같은 등장에 중복 알림을 막는다.
    alert_5min_sent       boolean     not null default false,

    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index idx_boss_timer_room on boss_timer (room_id, sort_order);
create index idx_boss_timer_due on boss_timer (next_spawn_at) where is_active and not alert_5min_sent;

create trigger trg_boss_timer_updated_at
    before update on boss_timer
    for each row execute function set_updated_at();

-- 등장 시각이 바뀌면(적용/±1분/젠간격 변경) 다음 등장에 대해 다시 알려야 하므로 플래그를 되돌린다.
create or replace function reset_boss_timer_alert() returns trigger as $$
begin
    if new.next_spawn_at is distinct from old.next_spawn_at then
        new.alert_5min_sent := false;
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_boss_timer_reset_alert
    before update on boss_timer
    for each row execute function reset_boss_timer_alert();

alter table boss_timer_room enable row level security;
alter table boss_timer enable row level security;

-- 테이블에는 직접 아무 권한도 주지 않는다. 아래 SECURITY DEFINER 함수로만 드나든다.
revoke all on boss_timer_room from anon, authenticated;
revoke all on boss_timer from anon, authenticated;

-- ---------------------------------------------------------------
-- 방 만들기 / 비밀번호 확인
-- ---------------------------------------------------------------

create or replace function boss_timer_room_create(p_slug text, p_password text, p_poll_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    insert into boss_timer_room (slug, password_hash, poll_token_hash)
    values (p_slug, crypt(p_password, gen_salt('bf')), crypt(p_poll_token, gen_salt('bf')))
    returning id into v_id;
    return v_id;
end;
$$;

create or replace function boss_timer_room_verify(p_slug text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hash text;
begin
    select password_hash into v_hash from boss_timer_room where slug = p_slug;
    if v_hash is null then
        return false;
    end if;
    return v_hash = crypt(p_password, v_hash);
end;
$$;

create or replace function boss_timer_room_set_password(p_slug text, p_old_password text, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not boss_timer_room_verify(p_slug, p_old_password) then
        return false;
    end if;
    update boss_timer_room set password_hash = crypt(p_new_password, gen_salt('bf')) where slug = p_slug;
    return true;
end;
$$;

create or replace function boss_timer_room_set_notice(p_slug text, p_password text, p_notice text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        return false;
    end if;
    update boss_timer_room set notice = p_notice where slug = p_slug;
    return true;
end;
$$;

-- 방 폭파: 방과 그 안의 보스 타이머를 전부 지운다.
create or replace function boss_timer_room_destroy(p_slug text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        return false;
    end if;
    delete from boss_timer_room where slug = p_slug;
    return true;
end;
$$;

create or replace function boss_timer_room_exists(p_slug text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists(select 1 from boss_timer_room where slug = p_slug);
$$;

-- ---------------------------------------------------------------
-- 조회 (비밀번호 없이 공개)
-- ---------------------------------------------------------------

create or replace function boss_timer_room_view(p_slug text)
returns table (
    notice text,
    boss_id uuid,
    seq_label text,
    name text,
    sort_order integer,
    is_active boolean,
    next_spawn_at timestamptz,
    respawn_interval_min integer
)
language sql
security definer
set search_path = public
stable
as $$
    select r.notice, b.id, b.seq_label, b.name, b.sort_order, b.is_active, b.next_spawn_at, b.respawn_interval_min
      from boss_timer_room r
      left join boss_timer b on b.room_id = r.id
     where r.slug = p_slug
     order by b.sort_order, b.name;
$$;

-- ---------------------------------------------------------------
-- 쓰기 (비밀번호 필요)
-- ---------------------------------------------------------------

create or replace function boss_timer_upsert(
    p_slug text,
    p_password text,
    p_id uuid,
    p_seq_label text,
    p_name text,
    p_sort_order integer,
    p_is_active boolean,
    p_next_spawn_at timestamptz,
    p_respawn_interval_min integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room_id uuid;
    v_id uuid;
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        raise exception '비밀번호가 올바르지 않습니다';
    end if;
    select id into v_room_id from boss_timer_room where slug = p_slug;

    if p_id is null then
        insert into boss_timer (room_id, seq_label, name, sort_order, is_active, next_spawn_at, respawn_interval_min)
        values (v_room_id, p_seq_label, p_name, p_sort_order, p_is_active, p_next_spawn_at, p_respawn_interval_min)
        returning id into v_id;
    else
        update boss_timer
           set seq_label = p_seq_label,
               name = p_name,
               sort_order = p_sort_order,
               is_active = p_is_active,
               next_spawn_at = p_next_spawn_at,
               respawn_interval_min = p_respawn_interval_min
         where id = p_id and room_id = v_room_id
        returning id into v_id;
    end if;
    return v_id;
end;
$$;

-- +1분/-1분처럼 상대 이동. 분 단위(음수 가능).
create or replace function boss_timer_shift(p_slug text, p_password text, p_id uuid, p_delta_minutes integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room_id uuid;
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        raise exception '비밀번호가 올바르지 않습니다';
    end if;
    select id into v_room_id from boss_timer_room where slug = p_slug;

    update boss_timer
       set next_spawn_at = next_spawn_at + make_interval(mins => p_delta_minutes)
     where id = p_id and room_id = v_room_id;
    return found;
end;
$$;

create or replace function boss_timer_delete(p_slug text, p_password text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room_id uuid;
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        raise exception '비밀번호가 올바르지 않습니다';
    end if;
    select id into v_room_id from boss_timer_room where slug = p_slug;

    delete from boss_timer where id = p_id and room_id = v_room_id;
    return found;
end;
$$;

-- ---------------------------------------------------------------
-- 봇 폴링용: 5분 이내 등장 예정이고 아직 알리지 않은 보스 목록.
-- ---------------------------------------------------------------

create or replace function boss_timer_due_alerts(p_slug text, p_poll_token text)
returns table (
    boss_id uuid,
    seq_label text,
    name text,
    next_spawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room_id uuid;
    v_hash text;
begin
    select id, poll_token_hash into v_room_id, v_hash from boss_timer_room where slug = p_slug;
    if v_room_id is null or v_hash <> crypt(p_poll_token, v_hash) then
        raise exception '폴링 토큰이 올바르지 않습니다';
    end if;

    return query
        update boss_timer b
           set alert_5min_sent = true
         where b.room_id = v_room_id
           and b.is_active
           and not b.alert_5min_sent
           and b.next_spawn_at <= now() + interval '5 minutes'
           and b.next_spawn_at > now()
        returning b.id, b.seq_label, b.name, b.next_spawn_at;
end;
$$;

grant execute on function boss_timer_room_create(text, text, text) to anon, authenticated;
grant execute on function boss_timer_room_verify(text, text) to anon, authenticated;
grant execute on function boss_timer_room_set_password(text, text, text) to anon, authenticated;
grant execute on function boss_timer_room_set_notice(text, text, text) to anon, authenticated;
grant execute on function boss_timer_room_destroy(text, text) to anon, authenticated;
grant execute on function boss_timer_room_view(text) to anon, authenticated;
grant execute on function boss_timer_room_exists(text) to anon, authenticated;
grant execute on function boss_timer_upsert(text, text, uuid, text, text, integer, boolean, timestamptz, integer) to anon, authenticated;
grant execute on function boss_timer_shift(text, text, uuid, integer) to anon, authenticated;
grant execute on function boss_timer_delete(text, text, uuid) to anon, authenticated;
grant execute on function boss_timer_due_alerts(text, text) to anon, authenticated;

comment on table boss_timer_room is '보스 타이머 방. 로그인과 무관한 공개 페이지, 비밀번호는 방 단위 공용';
comment on table boss_timer is '보스별 다음 등장 시각. 쓰기는 전부 boss_timer_* SECURITY DEFINER 함수를 통해서만';
comment on function boss_timer_due_alerts(text, text) is '봇이 폴링해서 5분전 알림을 가져가는 창구. 가져가면서 alert_5min_sent 를 true 로 표시(중복 발송 방지)';
