-- 전보(戰報). 게임의 «전투 결과» 화면을 그대로 옮겨 담는다.
--
-- 왜 필요한가
--   지금 덱 추천은 두 가지 근거로 돈다. 티어표(사람이 붙어 보고 매긴 표)와, 전법 설명문의
--   계수로 «추정한» 화력이다. 둘 다 남의 판단이거나 추정이라 우리 계정에서 실제로 무엇이
--   이겼는지는 모른다. 전보를 쌓으면 그 자리를 실측이 대신한다.
--
--   특히 전보에는 지금 어디에도 없는 값이 둘 있다.
--     · 부대 병력(0/14,779) — 이게 없어서 «10회 붙여 승률» 을 계산하지 못했다.
--     · 전법별 발동 횟수와 누적 피해(기병 돌격 ×12 → 11,142) — 설명문 계수로 추정하던 값의 실측.
--
-- 왜 Supabase 에 두나
--   Render 무료 인스턴스는 잠든다. 전보는 올리고 보는 일이 잦아 그때마다 서버를 깨울 수 없다.
--   조회·기록이 전부 정책만으로 끝나도록 여기 둔다.
--
-- 사진은 어디에
--   이 테이블에 넣지 않는다. 전보 사진은 한 장에 0.5MB 안팎이라 행에 담으면 DB 가 금방 커지고,
--   조회할 때마다 쓸데없이 따라 나온다. 파일은 Storage 버킷에 두고 여기에는 «경로» 만 적는다.

create table battle_report (
    id               uuid        primary key default gen_random_uuid(),
    user_id          uuid        not null references app_profile (user_id) on delete cascade,

    -- 승패. 게임 화면 한가운데 «패배/승리» 로 적힌 그것이다.
    outcome          text        not null,

    -- 진형은 부대의 성능을 크게 바꾸는데 편성 화면에서는 다루지 않는 값이다.
    -- 전보에는 양쪽 진형이 적혀 있으므로(안형진 / 어린진) 여기서 모은다.
    our_formation    text,
    enemy_formation  text,

    -- 누구와 붙었는지. 같은 편성이어도 상대에 따라 결과가 갈리므로 상대를 알아야
    -- «무엇에 강하고 무엇에 약한가» 를 낼 수 있다.
    our_commander    text,
    enemy_commander  text,
    our_alliance     text,
    enemy_alliance   text,

    -- 병력. 남은 값과 최대값을 따로 둔다. 손실은 계산할 수 있지만 화면에 적힌 값을
    -- 그대로 담아 둬야 판독이 틀렸을 때 대조할 수 있다.
    our_troops_left  integer,
    our_troops_max   integer,
    our_loss         integer,
    enemy_troops_left integer,
    enemy_troops_max  integer,
    enemy_loss        integer,

    -- Storage 버킷 안의 경로. 원본 사진은 판독이 틀렸을 때 되돌아볼 유일한 근거다.
    image_path       text,

    note             text,
    fought_at        date,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),

    constraint ck_battle_report_outcome check (outcome in ('WIN', 'LOSS', 'DRAW'))
);

create index idx_battle_report_user on battle_report (user_id, created_at desc);

create trigger trg_battle_report_updated_at
    before update on battle_report
    for each row execute function set_updated_at();

-- 부대에 선 장수. 한 전보에 아군 3 + 적군 3 이 들어간다.
create table battle_report_general (
    id           uuid        primary key default gen_random_uuid(),
    report_id    uuid        not null references battle_report (id) on delete cascade,

    side         text        not null,
    position     integer     not null,

    -- 이름과 id 를 함께 둔다. id 는 통계를 낼 때 쓰고, 이름은 판독한 그대로를 남긴다.
    -- 판독이 틀려 어느 장수인지 못 찾아도 전보 자체는 버리지 않기 위해서다.
    general_id   uuid        references general (id) on delete set null,
    general_name text        not null,

    level        integer,
    -- «궤멸» 처럼 카드에 덧씌워진 상태.
    status       text,
    troops_left  integer,
    troops_max   integer,

    constraint ck_brg_side     check (side in ('OUR', 'ENEMY')),
    constraint ck_brg_position check (position between 1 and 3),
    constraint uq_brg_slot     unique (report_id, side, position)
);

create index idx_brg_report on battle_report_general (report_id);
create index idx_brg_general on battle_report_general (general_id);

-- 장수가 들고 나온 전법과 그 성적.
create table battle_report_tactic (
    id            uuid        primary key default gen_random_uuid(),
    report_general_id uuid    not null references battle_report_general (id) on delete cascade,

    slot          integer     not null,
    tactic_id     uuid        references tactic (id) on delete set null,
    tactic_name   text        not null,

    -- 화면의 «×12». 몇 번 발동했는지.
    activations   integer,
    -- 붉은 숫자(누적 피해)와 초록 숫자(누적 회복). 한 전법이 둘 다 가질 수 있다.
    damage        integer,
    healing       integer,

    constraint uq_brt_slot unique (report_general_id, slot)
);

create index idx_brt_general on battle_report_tactic (report_general_id);
create index idx_brt_tactic on battle_report_tactic (tactic_id);

-- ---------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------
--
-- 전보는 동맹 전체가 함께 쌓는 자료다. 남이 올린 전보도 읽을 수 있어야 «무엇이 이기는가» 를
-- 알 수 있다. 대신 고치고 지우는 것은 올린 사람만 할 수 있다.

alter table battle_report enable row level security;
alter table battle_report_general enable row level security;
alter table battle_report_tactic enable row level security;

create policy battle_report_read on battle_report
    for select to authenticated using (true);

create policy battle_report_write on battle_report
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- 자식 테이블은 부모의 주인을 따라간다. 부모가 내 것이면 자식도 내 것이다.
create policy battle_report_general_read on battle_report_general
    for select to authenticated using (true);

create policy battle_report_general_write on battle_report_general
    for all to authenticated
    using (exists (select 1 from battle_report r
                    where r.id = report_id and r.user_id = auth.uid()))
    with check (exists (select 1 from battle_report r
                         where r.id = report_id and r.user_id = auth.uid()));

create policy battle_report_tactic_read on battle_report_tactic
    for select to authenticated using (true);

create policy battle_report_tactic_write on battle_report_tactic
    for all to authenticated
    using (exists (select 1 from battle_report_general g
                     join battle_report r on r.id = g.report_id
                    where g.id = report_general_id and r.user_id = auth.uid()))
    with check (exists (select 1 from battle_report_general g
                          join battle_report r on r.id = g.report_id
                         where g.id = report_general_id and r.user_id = auth.uid()));

grant select, insert, update, delete on battle_report          to authenticated;
grant select, insert, update, delete on battle_report_general  to authenticated;
grant select, insert, update, delete on battle_report_tactic   to authenticated;

-- ---------------------------------------------------------------
-- 집계
-- ---------------------------------------------------------------
--
-- 추천이 읽을 값이다. 화면에서 매번 전보를 전부 내려받아 세면 느리고, 무엇보다 «표본이
-- 몇 개인가» 를 같이 보여줘야 한다. 두 판 이겼다고 승률 100% 라고 말하면 안 된다.

create view battle_general_record as
select g.general_id,
       g.general_name,
       g.side,
       count(*)                                                    as battles,
       count(*) filter (where (g.side = 'OUR')  = (r.outcome = 'WIN')) as wins
  from battle_report_general g
  join battle_report r on r.id = g.report_id
 where r.outcome <> 'DRAW'
 group by g.general_id, g.general_name, g.side;

create view battle_tactic_record as
select t.tactic_id,
       t.tactic_name,
       count(*)              as uses,
       sum(t.activations)    as total_activations,
       sum(t.damage)         as total_damage,
       sum(t.healing)        as total_healing,
       avg(t.activations)    as avg_activations,
       avg(t.damage)         as avg_damage
  from battle_report_tactic t
 group by t.tactic_id, t.tactic_name;

grant select on battle_general_record to authenticated;
grant select on battle_tactic_record  to authenticated;

comment on table battle_report is '전보. 게임 «전투 결과» 화면을 옮겨 담아 실제 승패를 쌓는다';
comment on column battle_report.image_path is 'Storage 버킷 안의 원본 사진 경로. 판독을 되돌아볼 근거';
comment on view battle_general_record is '장수별 출전·승리 수. 표본 수(battles)를 반드시 함께 읽을 것';
