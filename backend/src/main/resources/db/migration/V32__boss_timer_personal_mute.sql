-- 보스별 "내 폰만" 알림 끄기. 방 관리자가 끄는 notify_enabled(전체 공용)와는 별개다.
-- 구독(디바이스)당 뮤트 목록을 두고, 발송 직전에 이 목록에 있으면 그 기기만 건너뛴다.
-- 비밀번호가 필요 없다 — 이 설정은 "그 기기가 그 방을 구독하고 있다"는 사실 자체가
-- 권한이고, 다른 사람 알림에 손댈 방법이 없다(내 endpoint 로만 조작 가능).
--
-- 참고: 기록용 파일이다. Render 가 삭제된 뒤로는 Flyway 를 실행할 서버가 없어서,
-- 실제 Supabase DB에는 Supabase MCP 로 같은 내용을 직접 적용했다(2026-09-06).

create table boss_timer_push_mute (
    subscription_id uuid not null references boss_timer_push_subscription (id) on delete cascade,
    boss_id         uuid not null references boss_timer (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (subscription_id, boss_id)
);

alter table boss_timer_push_mute enable row level security;
revoke all on boss_timer_push_mute from anon, authenticated;

create or replace function boss_timer_push_set_mute(p_endpoint text, p_boss_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_sub_id uuid;
begin
    select id into v_sub_id from boss_timer_push_subscription where endpoint = p_endpoint;
    if v_sub_id is null then
        raise exception '이 기기는 아직 알림을 구독하지 않았습니다';
    end if;

    if p_muted then
        insert into boss_timer_push_mute (subscription_id, boss_id)
        values (v_sub_id, p_boss_id)
        on conflict do nothing;
    else
        delete from boss_timer_push_mute where subscription_id = v_sub_id and boss_id = p_boss_id;
    end if;
end;
$$;

create or replace function boss_timer_push_my_mutes(p_endpoint text)
returns setof uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
    select m.boss_id
      from boss_timer_push_mute m
      join boss_timer_push_subscription s on s.id = m.subscription_id
     where s.endpoint = p_endpoint;
$$;

grant execute on function boss_timer_push_set_mute(text, uuid, boolean) to anon, authenticated;
grant execute on function boss_timer_push_my_mutes(text) to anon, authenticated;

comment on table boss_timer_push_mute is '기기(구독)별로 개인이 꺼둔 보스 알림. 방 전체 공용인 boss_timer.notify_enabled 와 별개';
