-- 동맹 인사 관리.
-- MemberWeek<YYYYMMDD>.xlsx 시트를 주차 스냅샷으로 적재하고, cid 단위로 마커와 주의사유를 붙인다.
--
-- 시트 컬럼(10개)과 이 테이블의 대응:
--   캐릭터 ID → cid            멤버 → member_name      직업 → job
--   조별      → team_group     직위 → position         번영 → prosperity
--   주간 무훈 → weekly_merit   주간 공헌 → weekly_contribution
--   주둔지    → garrison       주 공성 횟수 → weekly_siege_count

create table alliance (
    id         uuid        primary key default gen_random_uuid(),
    server     text        not null,
    name       text        not null,
    note       text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_alliance_server_name unique (server, name)
);

create trigger trg_alliance_updated_at
    before update on alliance
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 주차 스냅샷. 시트 한 행 = 한 레코드.
-- 같은 동맹·같은 일자·같은 cid 는 하나만 존재한다(재업로드 시 덮어씀).
-- ---------------------------------------------------------------
create table member_week (
    id                  uuid        primary key default gen_random_uuid(),
    alliance_id         uuid        not null references alliance (id) on delete cascade,
    snapshot_date       date        not null,
    cid                 text        not null,
    member_name         text        not null,
    job                 text,
    team_group          text,
    position            text,
    prosperity          bigint,
    weekly_merit        bigint,
    weekly_contribution bigint,
    garrison            text,
    weekly_siege_count  integer,
    source_file         text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint uq_member_week unique (alliance_id, snapshot_date, cid)
);

create index idx_member_week_lookup on member_week (alliance_id, snapshot_date);
create index idx_member_week_cid on member_week (alliance_id, cid);
create index idx_member_week_name on member_week (alliance_id, member_name);

create trigger trg_member_week_updated_at
    before update on member_week
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 마커. 주차와 무관하게 cid 에 붙는다.
--   CAUTION 주의(주황) / GILJAK 길작러(초록) / ACTIVE 액티브(파랑)
-- 버튼으로 켜고 끄므로 enabled 를 토글한다. 행을 지우지 않는 이유는 이력을 남기기 위해서다.
-- ---------------------------------------------------------------
create table member_marker (
    id          uuid        primary key default gen_random_uuid(),
    alliance_id uuid        not null references alliance (id) on delete cascade,
    cid         text        not null,
    marker_type text        not null,
    enabled     boolean     not null default true,
    updated_by  text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint uq_member_marker unique (alliance_id, cid, marker_type),
    constraint ck_member_marker_type check (marker_type in ('CAUTION', 'GILJAK', 'ACTIVE'))
);

create index idx_member_marker_lookup on member_marker (alliance_id, cid);
create index idx_member_marker_enabled on member_marker (alliance_id, marker_type, enabled);

create trigger trg_member_marker_updated_at
    before update on member_marker
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 주의 사유. 주의 마커를 켤 때 모달에서 입력한다. 여러 건 누적 가능.
-- ---------------------------------------------------------------
create table caution_note (
    id          uuid        primary key default gen_random_uuid(),
    alliance_id uuid        not null references alliance (id) on delete cascade,
    cid         text        not null,
    reason      text        not null,
    created_by  text,
    resolved    boolean     not null default false,
    resolved_at timestamptz,
    created_at  timestamptz not null default now(),
    constraint ck_caution_reason check (length(btrim(reason)) > 0)
);

create index idx_caution_note_lookup on caution_note (alliance_id, cid, created_at desc);
create index idx_caution_note_open on caution_note (alliance_id, resolved, created_at desc);

alter table alliance enable row level security;
alter table member_week enable row level security;
alter table member_marker enable row level security;
alter table caution_note enable row level security;

comment on table member_week is 'MemberWeek<YYYYMMDD> 시트의 주차별 동맹원 스냅샷';
comment on column member_week.snapshot_date is '파일명 MemberWeek20260814 에서 추출한 기준일';
comment on column member_week.cid is '게임 내 캐릭터 ID(11자리 숫자 문자열). 앞자리 0 보존을 위해 text 로 둔다';
comment on table member_marker is 'cid 단위 마커. CAUTION=주의(주황) GILJAK=길작러(초록) ACTIVE=액티브(파랑)';
