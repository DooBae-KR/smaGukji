-- 부대(team) 편성.
-- 천하결전 편성 규칙을 따른다: 부대 = 장수 최대 3명, 장수당 장착 전법 최대 2개.
-- 장수의 고유 전법(general.signature_tactic_id)은 자동 포함되므로 여기에 넣지 않는다.

create table team (
    id          uuid          primary key default gen_random_uuid(),
    owner_id    uuid          references app_user (id) on delete cascade,
    name        text          not null,
    description text,
    cost_limit  numeric(4, 1) not null default 15.0,
    created_at  timestamptz   not null default now(),
    updated_at  timestamptz   not null default now(),
    constraint ck_team_cost_limit check (cost_limit > 0 and cost_limit <= 60)
);

create index idx_team_owner on team (owner_id);

create trigger trg_team_updated_at
    before update on team
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 부대 내 장수 슬롯 (1=대장, 2/3=부장)
-- ---------------------------------------------------------------
create table team_slot (
    id         uuid    primary key default gen_random_uuid(),
    team_id    uuid    not null references team (id) on delete cascade,
    position   integer not null,
    general_id uuid    not null references general (id) on delete restrict,
    constraint uq_team_slot_position check (position between 1 and 3),
    constraint uq_team_slot_pos      unique (team_id, position),
    constraint uq_team_slot_general  unique (team_id, general_id)
);

create index idx_team_slot_team on team_slot (team_id, position);
create index idx_team_slot_general on team_slot (general_id);

-- ---------------------------------------------------------------
-- 슬롯에 장착한 전법 (장수당 최대 2개)
-- ---------------------------------------------------------------
create table team_slot_tactic (
    id        uuid    primary key default gen_random_uuid(),
    slot_id   uuid    not null references team_slot (id) on delete cascade,
    tactic_id uuid    not null references tactic (id) on delete restrict,
    position  integer not null,
    constraint ck_slot_tactic_position check (position between 1 and 2),
    constraint uq_slot_tactic_pos     unique (slot_id, position),
    constraint uq_slot_tactic_tactic  unique (slot_id, tactic_id)
);

create index idx_slot_tactic_slot on team_slot_tactic (slot_id, position);
create index idx_slot_tactic_tactic on team_slot_tactic (tactic_id);

alter table team enable row level security;
alter table team_slot enable row level security;
alter table team_slot_tactic enable row level security;

comment on table team is '부대 편성';
comment on column team_slot.position is '1=대장, 2/3=부장';
comment on table team_slot_tactic is '슬롯별 장착 전법. 고유 전법은 general.signature_tactic_id 로 별도 관리';
