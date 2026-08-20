-- 장수 분류 체계를 실제 게임 데이터에 맞춰 다시 잡는다.
--
-- 근거: 사용자가 관리하는 스프레드시트의 «무장» 시트.
--   무장 진영 : 전열 / 균형 / 후열      ← 배치 위치. 새로 추가
--   무장 성향 : 치유 / 보조방어 / 문무보조 / 책략 / 병기   ← 새로 추가
--   무장 병종 : 방패병 / 창병 / 궁병 / 기병  ← 값이 기존 추정과 다름
--   수치(50렙): 무력 / 지력 / 통솔 / 선공   ← 소수점이 있어 정수로는 못 담는다
--
-- 기존 세력(위/촉/오/군)은 카드 이미지에서 판독한 별개의 축이므로 그대로 둔다.
-- 시트에는 세력이 없고, 진영은 세력과 다른 개념이다.
--
-- 기존 수치 컬럼(attack/defense/intelligence/command/speed)은 단 한 건도 채워진 적이
-- 없으므로 그대로 버린다.

-- ---------------------------------------------------------------
-- 1) 병종 값 교체
--    기존 추정값(CAVALRY/INFANTRY/ARCHER/SPEARMAN/SIEGE)은 카드 아이콘을 보고 세운
--    가설이었고 실제로 입력된 적이 없다. 시트의 실제 분류로 바꾼다.
-- ---------------------------------------------------------------
alter table general drop constraint ck_general_unit_type;

update general set unit_type = null where unit_type is not null;

alter table general add constraint ck_general_unit_type
    check (unit_type is null or unit_type in ('SHIELD', 'SPEAR', 'BOW', 'CAVALRY'));

comment on column general.unit_type is '병종: SHIELD=방패병 SPEAR=창병 BOW=궁병 CAVALRY=기병';

-- ---------------------------------------------------------------
-- 2) 진영 · 성향 추가
-- ---------------------------------------------------------------
alter table general add column camp text;

-- 성향은 «복수»다. 시트에서 전위가 방어+병기 두 값을 갖는다.
-- 단일 컬럼으로 두면 그런 장수를 표현할 수 없다.
alter table general add column dispositions text[] not null default '{}';

alter table general add constraint ck_general_camp
    check (camp is null or camp in ('FRONT', 'BALANCE', 'BACK'));

alter table general add constraint ck_general_dispositions
    check (dispositions <@ array[
        'HEAL', 'SUPPORT', 'DEFENSE', 'SUPPORT_DEFENSE',
        'CIVIL_MARTIAL_SUPPORT', 'STRATEGY', 'WEAPON'
    ]::text[]);

create index idx_general_camp on general (camp);
create index idx_general_dispositions on general using gin (dispositions);

comment on column general.camp is '진영(배치): FRONT=전열 BALANCE=균형 BACK=후열';
-- COMMENT ON 은 문자열 리터럴만 받는다. || 로 이어붙이면 문법 오류가 난다.
comment on column general.dispositions is '성향(복수): HEAL=치유 SUPPORT=보조 DEFENSE=방어 SUPPORT_DEFENSE=보조방어 CIVIL_MARTIAL_SUPPORT=문무보조 STRATEGY=책략 WEAPON=병기. 보조방어·문무보조는 시트에 한 덩어리로 적혀 있어 분해하지 않는다.';

-- ---------------------------------------------------------------
-- 3) 수치를 50레벨 기준 소수값으로 교체
--    시트 값이 151.5 / 209.5 처럼 .5 단위라 정수로는 담을 수 없다.
-- ---------------------------------------------------------------
alter table general drop column attack;
alter table general drop column defense;
alter table general drop column intelligence;
alter table general drop column command;
alter table general drop column speed;

alter table general add column might      numeric(6, 1);   -- 무력
alter table general add column intellect  numeric(6, 1);   -- 지력
alter table general add column leadership numeric(6, 1);   -- 통솔
alter table general add column initiative numeric(6, 1);   -- 선공
alter table general add column stat_level integer not null default 50;

alter table general add constraint ck_general_stats check (
    (might      is null or might      >= 0) and
    (intellect  is null or intellect  >= 0) and
    (leadership is null or leadership >= 0) and
    (initiative is null or initiative >= 0)
);

comment on column general.might is '무력 (stat_level 기준)';
comment on column general.intellect is '지력';
comment on column general.leadership is '통솔';
comment on column general.initiative is '선공';
comment on column general.stat_level is '위 수치의 기준 레벨. 시트는 50렙 기준';

-- ---------------------------------------------------------------
-- 4) 전법 특성에 «치유» 추가
--    시트의 전법 특성은 치유 / 보조 / 책략 / 병기 네 가지다.
--    기존에 넣어둔 DEFENSE/CONTROL 은 실제 데이터에 없지만, 이미 입력된 값이 있을 수
--    있으므로 지우지 않고 HEAL 만 더한다.
-- ---------------------------------------------------------------
alter table tactic drop constraint ck_tactic_ability_type;

alter table tactic add constraint ck_tactic_ability_type
    check (ability_type is null or ability_type in
        ('WEAPON', 'STRATEGY', 'DEFENSE', 'SUPPORT', 'CONTROL', 'HEAL'));

comment on column tactic.ability_type is
    '전법 특성: HEAL=치유 SUPPORT=보조 STRATEGY=책략 WEAPON=병기 (DEFENSE/CONTROL 은 예비)';
