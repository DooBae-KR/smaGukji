-- 천하결전 도메인: 장수(general) / 전법(tactic)
--
-- 데이터 출처와 신뢰도:
--   - name, faction, cost : 로컬 카드 이미지에서 판독 (신뢰도 높음, 텍스트로 표기됨)
--   - unit_type           : 카드 아이콘이 20px 남짓이라 판독 불가 → 의도적으로 NULL
--   - 나머지 수치/전법 상세 : 미입력. CSV 임포트 또는 PATCH API 로 채운다.
-- 미입력 컬럼은 전부 nullable 이며, 분석 로직은 NULL 을 '미입력'으로 처리한다.

create table general (
    id           uuid          primary key default gen_random_uuid(),
    name         text          not null,
    faction      text          not null,
    cost         numeric(4, 1) not null,
    unit_type    text,
    rarity       text,
    -- 수치 (미입력)
    attack       integer,
    defense      integer,
    intelligence integer,
    command      integer,
    speed        integer,
    note         text,
    created_at   timestamptz   not null default now(),
    updated_at   timestamptz   not null default now(),
    constraint uq_general_name      unique (name),
    constraint ck_general_faction   check (faction in ('WEI', 'SHU', 'WU', 'QUN', 'HAN')),
    constraint ck_general_unit_type check (unit_type is null
        or unit_type in ('CAVALRY', 'INFANTRY', 'ARCHER', 'SPEARMAN', 'SIEGE')),
    constraint ck_general_cost      check (cost > 0 and cost <= 20)
);

create index idx_general_faction on general (faction);
create index idx_general_unit_type on general (unit_type);

create trigger trg_general_updated_at
    before update on general
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 전법
-- 필드 구성은 천하결전 전법 데이터가 일반적으로 갖는 항목을 따른다.
--   category     패시브 / 액티브 / 지휘 / 추격 / 돌격 / 진법 / 내정
--   ability_type 병기 / 책략 / 방어 / 보조 / 제어
--   quality      황금 / 보라 / 파랑 / 초록
-- ---------------------------------------------------------------
create table tactic (
    id           uuid          primary key default gen_random_uuid(),
    name         text          not null,
    category     text,
    ability_type text,
    quality      text,
    trigger_rate numeric(5, 2),
    target_count integer,
    effect_text  text,
    role_tags    text[]        not null default '{}',
    source       text,
    created_at   timestamptz   not null default now(),
    updated_at   timestamptz   not null default now(),
    constraint uq_tactic_name         unique (name),
    constraint ck_tactic_category     check (category is null
        or category in ('PASSIVE', 'ACTIVE', 'COMMAND', 'PURSUIT', 'ASSAULT', 'FORMATION', 'INTERNAL')),
    constraint ck_tactic_ability_type check (ability_type is null
        or ability_type in ('WEAPON', 'STRATEGY', 'DEFENSE', 'SUPPORT', 'CONTROL')),
    constraint ck_tactic_quality      check (quality is null
        or quality in ('GOLD', 'PURPLE', 'BLUE', 'GREEN')),
    constraint ck_tactic_trigger_rate check (trigger_rate is null
        or (trigger_rate >= 0 and trigger_rate <= 100)),
    constraint ck_tactic_target_count check (target_count is null or target_count >= 0),
    constraint ck_tactic_source       check (source is null
        or source in ('SIGNATURE', 'INHERITED', 'EVENT', 'BASIC'))
);

create index idx_tactic_category on tactic (category);
create index idx_tactic_ability_type on tactic (ability_type);
create index idx_tactic_quality on tactic (quality);

create trigger trg_tactic_updated_at
    before update on tactic
    for each row execute function set_updated_at();

-- 장수 고유 전법. tactic 이 생성된 뒤에 FK 를 건다(상호 참조 회피).
alter table general
    add column signature_tactic_id uuid,
    add constraint fk_general_signature_tactic
        foreign key (signature_tactic_id) references tactic (id) on delete set null;

create index idx_general_signature_tactic on general (signature_tactic_id);

alter table general enable row level security;
alter table tactic enable row level security;

comment on table general is '장수 마스터';
comment on table tactic is '전법 마스터';
comment on column general.unit_type is '병종. 카드 이미지 아이콘 판독 불가로 초기값 NULL';
comment on column general.cost is '편성 코스트. 현재 데이터는 전원 5.0';
comment on column tactic.role_tags is '역할 태그 배열. 예: {딜_병기, 방어_자신}';
