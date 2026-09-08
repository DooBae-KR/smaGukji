-- 레벨 40 이하 보스는 등장 후 1분 안에 항상 토벌되는 게임 구조라, 굳이 관리자가
-- "사망" 버튼을 누르지 않아도 등장 시각으로부터 1분이 지나면 자동으로 사망 처리한
-- 것처럼 다음 쿨타임으로 넘긴다. boss_timer_recompute_schedule() 은 요일/매일 고정형
-- 보스의 지난 회차를 다음 회차로 넘기던 기존 함수라, 같은 자리(방을 조회할 때마다 호출됨,
-- 비밀번호 불필요)에 쿨타임형(spawn_type=1) 레벨 40 이하 보스를 위한 처리를 추가한다.
-- next_spawn_at 을 미래로 옮기고 나면 "지금 등장중" 조건을 스스로 벗어나므로, 이 update 는
-- 여러 번 호출돼도(폴링마다) 안전하다(멱등).
create or replace function boss_timer_recompute_schedule(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    update boss_timer
       set next_spawn_at = boss_timer_next_weekly(weekday, fixed_time)
     where room_id = p_room_id
       and spawn_type = 2
       and weekday is not null
       and fixed_time is not null
       and next_spawn_at <= now();

    update boss_timer
       set next_spawn_at = boss_timer_next_daily(fixed_time)
     where room_id = p_room_id
       and spawn_type = 3
       and fixed_time is not null
       and next_spawn_at <= now();

    update boss_timer
       set next_spawn_at = next_spawn_at + interval '1 minute'
                            + make_interval(mins => coalesce(respawn_min_minutes, respawn_max_minutes))
     where room_id = p_room_id
       and spawn_type = 1
       and is_active
       and level is not null
       and level <= 40
       and coalesce(respawn_min_minutes, respawn_max_minutes) is not null
       and next_spawn_at <= now() - interval '1 minute';
end;
$$;
