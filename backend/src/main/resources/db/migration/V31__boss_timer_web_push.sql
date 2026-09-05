-- 보스 등장 5분 전 웹 푸시(브라우저 알림). 카카오톡 봇과는 별개 경로다.
--
-- 흐름: pg_cron(1분마다) → boss_timer_push_kick() → 1회용 토큰 발급 → net.http_post 로
-- Edge Function(boss-timer-push) 호출 → 함수가 알림 대상 보스를 찾아 구독자들에게 웹 푸시.
-- (agent_run_token/agent_kick 과 같은 패턴)
--
-- 참고: 기록용 파일이다. Render 가 삭제된 뒤로는 Flyway 를 실행할 서버가 없어서,
-- 실제 Supabase DB에는 Supabase MCP 로 같은 내용을 직접 적용했다(2026-09-05).

create table boss_timer_push_subscription (
    id          uuid        primary key default gen_random_uuid(),
    room_id     uuid        not null references boss_timer_room (id) on delete cascade,
    endpoint    text        not null unique,
    p256dh      text        not null,
    auth        text        not null,
    created_at  timestamptz not null default now()
);

create index idx_boss_timer_push_room on boss_timer_push_subscription (room_id);

alter table boss_timer_push_subscription enable row level security;
revoke all on boss_timer_push_subscription from anon, authenticated;

create or replace function boss_timer_push_subscribe(p_slug text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_room_id uuid;
begin
    select id into v_room_id from boss_timer_room where slug = p_slug;
    if v_room_id is null then
        raise exception '방을 찾을 수 없습니다';
    end if;

    insert into boss_timer_push_subscription (room_id, endpoint, p256dh, auth)
    values (v_room_id, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update
        set room_id = excluded.room_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function boss_timer_push_unsubscribe(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    delete from boss_timer_push_subscription where endpoint = p_endpoint;
end;
$$;

grant execute on function boss_timer_push_subscribe(text, text, text, text) to anon, authenticated;
grant execute on function boss_timer_push_unsubscribe(text) to anon, authenticated;

create table boss_timer_push_token (
    token       uuid        primary key default gen_random_uuid(),
    expires_at  timestamptz not null default now() + interval '2 minutes'
);

revoke all on boss_timer_push_token from anon, authenticated;

create or replace function boss_timer_push_kick()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    tok uuid;
begin
    delete from boss_timer_push_token where expires_at < now();
    insert into boss_timer_push_token default values returning token into tok;
    perform net.http_post(
        url     := 'https://yzjbaenqfnyqfoaxqegu.supabase.co/functions/v1/boss-timer-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-boss-token', tok::text),
        body    := '{"source":"pg_cron"}'::jsonb,
        timeout_milliseconds := 30000
    );
end;
$$;

select cron.schedule('boss-timer-push-kick', '* * * * *', 'select public.boss_timer_push_kick()');

create or replace function boss_timer_recompute_all()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    r record;
begin
    for r in select id from boss_timer_room loop
        perform boss_timer_recompute_schedule(r.id);
    end loop;
end;
$$;

-- 웹 푸시 대상: 활성+알림켜짐+아직 안 알린 보스 중 5분 이내 등장. 가져가면서 알림 보냄 표시.
create or replace function boss_timer_push_due()
returns table (boss_id uuid, room_id uuid, name text, next_spawn_at timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
    update boss_timer b
       set alert_5min_sent = true
     where b.is_active
       and b.notify_enabled
       and not b.alert_5min_sent
       and b.next_spawn_at <= now() + interval '5 minutes'
       and b.next_spawn_at > now()
    returning b.id, b.room_id, b.name, b.next_spawn_at;
$$;

grant execute on function boss_timer_recompute_all() to service_role;
grant execute on function boss_timer_push_due() to service_role;

comment on table boss_timer_push_subscription is '보스 타이머 방별 웹 푸시 구독(브라우저 PushSubscription)';
comment on function boss_timer_push_kick() is 'pg_cron 이 1분마다 불러 boss-timer-push Edge Function 을 깨운다(1회용 토큰으로 인증)';
comment on function boss_timer_push_due() is 'Edge Function(boss-timer-push) 전용. service_role 로만 부른다';
