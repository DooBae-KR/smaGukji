-- 보스 타이머: 보스별 카카오톡 알림 on/off.
--
-- 여러 보스 중 일부만 카톡방에 알리고 싶다는 요청(2026-09-05). is_active(추적 여부)와는
-- 별개 스위치다 — 화면에는 계속 보이되(is_active=true), 알림만 끌 수 있어야 하기 때문.
--
-- 참고: 이 파일은 기록용이다. Render 가 삭제된 뒤로는 Flyway 를 실행할 서버가 없어서,
-- 실제 Supabase DB에는 Supabase MCP 로 같은 내용을 직접 적용했다(2026-09-05).

-- V28 의 함수들은 search_path 를 public 으로만 뒀는데, 이 프로젝트의 pgcrypto 는
-- extensions 스키마에 있어서 gen_salt/crypt 를 못 찾아 "function gen_salt(unknown) does not
-- exist" 로 방 만들기가 실패했다(2026-09-05). 나머지 함수도 search_path 를 맞춘다.
alter function boss_timer_room_create(text, text, text) set search_path = public, extensions;
alter function boss_timer_room_verify(text, text) set search_path = public, extensions;
alter function boss_timer_room_set_password(text, text, text) set search_path = public, extensions;
alter function boss_timer_room_set_notice(text, text, text) set search_path = public, extensions;
alter function boss_timer_room_destroy(text, text) set search_path = public, extensions;
alter function boss_timer_room_exists(text) set search_path = public, extensions;
alter function boss_timer_shift(text, text, uuid, integer) set search_path = public, extensions;
alter function boss_timer_delete(text, text, uuid) set search_path = public, extensions;

alter table boss_timer add column if not exists notify_enabled boolean not null default true;

drop function if exists boss_timer_room_view(text);
drop function if exists boss_timer_upsert(text, text, uuid, text, text, integer, boolean, timestamptz, integer);

create function boss_timer_room_view(p_slug text)
returns table (
    notice text,
    boss_id uuid,
    seq_label text,
    name text,
    sort_order integer,
    is_active boolean,
    notify_enabled boolean,
    next_spawn_at timestamptz,
    respawn_interval_min integer
)
language sql
security definer
set search_path = public, extensions
stable
as $$
    select r.notice, b.id, b.seq_label, b.name, b.sort_order, b.is_active, b.notify_enabled, b.next_spawn_at, b.respawn_interval_min
      from boss_timer_room r
      left join boss_timer b on b.room_id = r.id
     where r.slug = p_slug
     order by b.sort_order, b.name;
$$;

create function boss_timer_upsert(
    p_slug text,
    p_password text,
    p_id uuid,
    p_seq_label text,
    p_name text,
    p_sort_order integer,
    p_is_active boolean,
    p_next_spawn_at timestamptz,
    p_respawn_interval_min integer,
    p_notify_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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
        insert into boss_timer (room_id, seq_label, name, sort_order, is_active, next_spawn_at, respawn_interval_min, notify_enabled)
        values (v_room_id, p_seq_label, p_name, p_sort_order, p_is_active, p_next_spawn_at, p_respawn_interval_min, p_notify_enabled)
        returning id into v_id;
    else
        update boss_timer
           set seq_label = p_seq_label,
               name = p_name,
               sort_order = p_sort_order,
               is_active = p_is_active,
               next_spawn_at = p_next_spawn_at,
               respawn_interval_min = p_respawn_interval_min,
               notify_enabled = p_notify_enabled
         where id = p_id and room_id = v_room_id
        returning id into v_id;
    end if;
    return v_id;
end;
$$;

-- 알림 on 인 보스만 봇에게 넘긴다.
create or replace function boss_timer_due_alerts(p_slug text, p_poll_token text)
returns table (
    boss_id uuid,
    seq_label text,
    name text,
    next_spawn_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
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
           and b.notify_enabled
           and not b.alert_5min_sent
           and b.next_spawn_at <= now() + interval '5 minutes'
           and b.next_spawn_at > now()
        returning b.id, b.seq_label, b.name, b.next_spawn_at;
end;
$$;

grant execute on function boss_timer_room_view(text) to anon, authenticated;
grant execute on function boss_timer_upsert(text, text, uuid, text, text, integer, boolean, timestamptz, integer, boolean) to anon, authenticated;
grant execute on function boss_timer_due_alerts(text, text) to anon, authenticated;

comment on column boss_timer.notify_enabled is '카카오톡 알림 봇에게 이 보스를 넘길지. is_active(추적 여부)와 별개';
