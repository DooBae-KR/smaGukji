-- 기기(구독)별 "이 시간대에만 알림" 설정. 예: 06시~24시 → 새벽에는 안 옴.
-- 시간대는 Asia/Seoul 기준(이 프로젝트의 다른 시간 계산과 동일하게 가정).
--
-- 참고: 기록용 파일이다. Render 가 삭제된 뒤로는 Flyway 를 실행할 서버가 없어서,
-- 실제 Supabase DB에는 Supabase MCP 로 같은 내용을 직접 적용했다(2026-09-06).

alter table boss_timer_push_subscription
  add column if not exists quiet_start smallint not null default 0,
  add column if not exists quiet_end   smallint not null default 24;

alter table boss_timer_push_subscription
  add constraint ck_boss_timer_push_quiet_start check (quiet_start between 0 and 24),
  add constraint ck_boss_timer_push_quiet_end   check (quiet_end between 0 and 24);

comment on column boss_timer_push_subscription.quiet_start is '알림 허용 시작 시(0~24, Asia/Seoul). 기본 0=제한 없음';
comment on column boss_timer_push_subscription.quiet_end is '알림 허용 종료 시(0~24, Asia/Seoul). 기본 24=제한 없음. start<=end 면 [start,end), start>end 면 자정을 넘는 구간(예: 22~06)';

create or replace function boss_timer_push_set_hours(p_endpoint text, p_start smallint, p_end smallint)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if p_start < 0 or p_start > 24 or p_end < 0 or p_end > 24 then
        raise exception '시간은 0~24 사이여야 합니다';
    end if;

    update boss_timer_push_subscription
       set quiet_start = p_start, quiet_end = p_end
     where endpoint = p_endpoint;

    if not found then
        raise exception '이 기기는 아직 알림을 구독하지 않았습니다';
    end if;
end;
$$;

create or replace function boss_timer_push_get_hours(p_endpoint text)
returns table (quiet_start smallint, quiet_end smallint)
language sql
security definer
set search_path = public, extensions
stable
as $$
    select quiet_start, quiet_end from boss_timer_push_subscription where endpoint = p_endpoint;
$$;

grant execute on function boss_timer_push_set_hours(text, smallint, smallint) to anon, authenticated;
grant execute on function boss_timer_push_get_hours(text) to anon, authenticated;
