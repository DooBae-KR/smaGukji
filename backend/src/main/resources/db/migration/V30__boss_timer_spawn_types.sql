-- 보스마다 등장 방식이 다르다(시트 «등장 코드» 열, 2026-09-05).
--   1 = 쿨타임형: 죽은 뒤 respawn_min_minutes~respawn_max_minutes 후 등장. 사망 시각을 사람이 입력해야 한다.
--   2 = 요일고정형: 매주 weekday(0=일~6=토) 의 fixed_time 에 등장.
--   3 = 매일고정형: 매일 fixed_time 에 등장(한 보스가 하루 두 번이면 행을 두 개 둔다. 예: 심연의 틈 12:00/20:00).
-- 2·3 은 다음 등장 시각을 서버가 스스로 계산해 굴린다.
-- 시간대는 게임 서버 기준을 모르므로 Asia/Seoul 로 가정한다.
--
-- 참고: 기록용 파일이다. Render 가 삭제된 뒤로는 Flyway 를 실행할 서버가 없어서,
-- 실제 Supabase DB에는 Supabase MCP 로 같은 내용을 직접 적용했다(2026-09-05).

alter table boss_timer
  add column if not exists spawn_type smallint not null default 1,
  add column if not exists weekday smallint,
  add column if not exists fixed_time time,
  add column if not exists respawn_min_minutes integer,
  add column if not exists respawn_max_minutes integer,
  add column if not exists level integer,
  add column if not exists location text;

alter table boss_timer
  add constraint ck_boss_timer_spawn_type check (spawn_type in (1, 2, 3));

comment on column boss_timer.spawn_type is '1=쿨타임형(사망 후 n분) 2=요일고정형(매주) 3=매일고정형';
comment on column boss_timer.weekday is '0=일 1=월 ... 6=토. spawn_type=2 에서만 씀';
comment on column boss_timer.fixed_time is '고정 등장 시각(HH:MM). spawn_type 2/3 에서만 씀';
comment on column boss_timer.respawn_min_minutes is '쿨타임형의 최소 쿨타임(분). spawn_type=1 에서만 씀';
comment on column boss_timer.respawn_max_minutes is '쿨타임형의 최대 쿨타임(분, 범위가 없으면 min과 같음)';

create or replace function boss_timer_next_weekly(p_weekday smallint, p_time time)
returns timestamptz
language sql
stable
as $$
    select ((d.day + p_time) at time zone 'Asia/Seoul')
      from generate_series(0, 7) as offset_days
      cross join lateral (
          select ((now() at time zone 'Asia/Seoul')::date + offset_days) as day
      ) d
     where extract(dow from d.day) = p_weekday
       and ((d.day + p_time) at time zone 'Asia/Seoul') > now()
     order by d.day
     limit 1;
$$;

create or replace function boss_timer_next_daily(p_time time)
returns timestamptz
language sql
stable
as $$
    select ((d.day + p_time) at time zone 'Asia/Seoul')
      from generate_series(0, 1) as offset_days
      cross join lateral (
          select ((now() at time zone 'Asia/Seoul')::date + offset_days) as day
      ) d
     where ((d.day + p_time) at time zone 'Asia/Seoul') > now()
     order by d.day
     limit 1;
$$;

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
end;
$$;

drop function if exists boss_timer_room_view(text);
drop function if exists boss_timer_upsert(text, text, uuid, text, text, integer, boolean, timestamptz, integer, boolean);
drop function if exists boss_timer_due_alerts(text, text);

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
    respawn_interval_min integer,
    spawn_type smallint,
    weekday smallint,
    fixed_time time,
    respawn_min_minutes integer,
    respawn_max_minutes integer,
    level integer,
    location text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_room_id uuid;
begin
    select id into v_room_id from boss_timer_room r where r.slug = p_slug;
    if v_room_id is not null then
        perform boss_timer_recompute_schedule(v_room_id);
    end if;

    return query
        select r.notice, b.id, b.seq_label, b.name, b.sort_order, b.is_active, b.notify_enabled,
               b.next_spawn_at, b.respawn_interval_min, b.spawn_type, b.weekday, b.fixed_time,
               b.respawn_min_minutes, b.respawn_max_minutes, b.level, b.location
          from boss_timer_room r
          left join boss_timer b on b.room_id = r.id
         where r.slug = p_slug
         order by b.sort_order, b.name;
end;
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
    p_notify_enabled boolean default true,
    p_spawn_type smallint default 1,
    p_weekday smallint default null,
    p_fixed_time time default null,
    p_respawn_min_minutes integer default null,
    p_respawn_max_minutes integer default null,
    p_level integer default null,
    p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_room_id uuid;
    v_id uuid;
    v_next timestamptz;
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        raise exception '비밀번호가 올바르지 않습니다';
    end if;
    select id into v_room_id from boss_timer_room where slug = p_slug;

    v_next := p_next_spawn_at;
    if p_spawn_type = 2 and p_weekday is not null and p_fixed_time is not null then
        v_next := boss_timer_next_weekly(p_weekday, p_fixed_time);
    elsif p_spawn_type = 3 and p_fixed_time is not null then
        v_next := boss_timer_next_daily(p_fixed_time);
    end if;

    if p_id is null then
        insert into boss_timer (room_id, seq_label, name, sort_order, is_active, next_spawn_at, respawn_interval_min,
                                 notify_enabled, spawn_type, weekday, fixed_time, respawn_min_minutes, respawn_max_minutes,
                                 level, location)
        values (v_room_id, p_seq_label, p_name, p_sort_order, p_is_active, v_next, p_respawn_interval_min,
                p_notify_enabled, p_spawn_type, p_weekday, p_fixed_time, p_respawn_min_minutes, p_respawn_max_minutes,
                p_level, p_location)
        returning id into v_id;
    else
        update boss_timer
           set seq_label = p_seq_label,
               name = p_name,
               sort_order = p_sort_order,
               is_active = p_is_active,
               next_spawn_at = v_next,
               respawn_interval_min = p_respawn_interval_min,
               notify_enabled = p_notify_enabled,
               spawn_type = p_spawn_type,
               weekday = p_weekday,
               fixed_time = p_fixed_time,
               respawn_min_minutes = p_respawn_min_minutes,
               respawn_max_minutes = p_respawn_max_minutes,
               level = p_level,
               location = p_location
         where id = p_id and room_id = v_room_id
        returning id into v_id;
    end if;
    return v_id;
end;
$$;

create or replace function boss_timer_mark_death(p_slug text, p_password text, p_id uuid, p_use_max boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_room_id uuid;
    v_minutes integer;
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        raise exception '비밀번호가 올바르지 않습니다';
    end if;
    select id into v_room_id from boss_timer_room where slug = p_slug;

    select case when p_use_max then coalesce(respawn_max_minutes, respawn_min_minutes)
                else coalesce(respawn_min_minutes, respawn_max_minutes) end
      into v_minutes
      from boss_timer where id = p_id and room_id = v_room_id;

    if v_minutes is null then
        raise exception '이 보스에는 쿨타임이 설정돼 있지 않습니다';
    end if;

    update boss_timer
       set next_spawn_at = now() + make_interval(mins => v_minutes)
     where id = p_id and room_id = v_room_id;
    return found;
end;
$$;

create or replace function boss_timer_bulk_import(p_slug text, p_password text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_room_id uuid;
    v_row jsonb;
    v_count integer := 0;
    v_next timestamptz;
    v_spawn_type smallint;
    v_weekday smallint;
    v_fixed_time time;
begin
    if not boss_timer_room_verify(p_slug, p_password) then
        raise exception '비밀번호가 올바르지 않습니다';
    end if;
    select id into v_room_id from boss_timer_room where slug = p_slug;

    for v_row in select * from jsonb_array_elements(p_rows)
    loop
        v_spawn_type := coalesce((v_row->>'spawnType')::smallint, 1);
        v_weekday := (v_row->>'weekday')::smallint;
        v_fixed_time := (v_row->>'fixedTime')::time;

        if v_spawn_type = 2 and v_weekday is not null and v_fixed_time is not null then
            v_next := boss_timer_next_weekly(v_weekday, v_fixed_time);
        elsif v_spawn_type = 3 and v_fixed_time is not null then
            v_next := boss_timer_next_daily(v_fixed_time);
        else
            v_next := now() + make_interval(mins => coalesce((v_row->>'respawnMinMinutes')::integer, 60));
        end if;

        update boss_timer b
           set level = (v_row->>'level')::integer,
               location = v_row->>'location',
               respawn_min_minutes = (v_row->>'respawnMinMinutes')::integer,
               respawn_max_minutes = (v_row->>'respawnMaxMinutes')::integer,
               respawn_interval_min = coalesce((v_row->>'respawnMinMinutes')::integer, b.respawn_interval_min)
         where b.room_id = v_room_id
           and b.name = v_row->>'name'
           and coalesce(b.location, '') = coalesce(v_row->>'location', '')
           and b.spawn_type = v_spawn_type
           and coalesce(b.weekday, -1) = coalesce(v_weekday, -1)
           and coalesce(b.fixed_time, '00:00'::time) = coalesce(v_fixed_time, '00:00'::time);

        if not found then
            insert into boss_timer (room_id, name, sort_order, is_active, notify_enabled, next_spawn_at,
                                     respawn_interval_min, spawn_type, weekday, fixed_time,
                                     respawn_min_minutes, respawn_max_minutes, level, location)
            values (v_room_id, v_row->>'name', 0, true, true, v_next,
                    coalesce((v_row->>'respawnMinMinutes')::integer, 60), v_spawn_type, v_weekday, v_fixed_time,
                    (v_row->>'respawnMinMinutes')::integer, (v_row->>'respawnMaxMinutes')::integer,
                    (v_row->>'level')::integer, v_row->>'location');
        end if;
        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

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

    perform boss_timer_recompute_schedule(v_room_id);

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
grant execute on function boss_timer_upsert(text, text, uuid, text, text, integer, boolean, timestamptz, integer, boolean, smallint, smallint, time, integer, integer, integer, text) to anon, authenticated;
grant execute on function boss_timer_mark_death(text, text, uuid, boolean) to anon, authenticated;
grant execute on function boss_timer_bulk_import(text, text, jsonb) to anon, authenticated;
grant execute on function boss_timer_due_alerts(text, text) to anon, authenticated;

comment on function boss_timer_bulk_import(text, text, jsonb) is '구글시트 «보스탭» 을 한 번에 반영. 같은 이름+위치+방식+요일+시간이면 갱신, 없으면 새로 만든다';
