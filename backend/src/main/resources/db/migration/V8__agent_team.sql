-- AI 오피스 에이전트: 4개 팀.
--
-- 팀·직원·대사를 소스코드가 아니라 DB 에 둔다. 화면 문구를 고치려고 배포할 필요가 없다.
--
-- 주의: 이 에이전트는 LLM 을 호출하지 않는다. 직원은 팀별 상태(state)와 여기 저장된
-- 문구로 움직이는 시뮬레이션이다. 실제 계산은 각 팀이 가리키는 기능(route)이 수행한다.

create table agent_team (
    id         uuid        primary key default gen_random_uuid(),
    code       text        not null,
    name       text        not null,
    icon       text,
    short_name text,
    task       text        not null,
    report     text        not null,
    route      text,
    position   integer     not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_agent_team_code unique (code),
    constraint uq_agent_team_position unique (position),
    constraint ck_agent_team_code check (code in ('SIM', 'HR', 'STRATEGY', 'PLANNING'))
);

create trigger trg_agent_team_updated_at
    before update on agent_team
    for each row execute function set_updated_at();

create table agent_staff (
    id           uuid        primary key default gen_random_uuid(),
    team_id      uuid        not null references agent_team (id) on delete cascade,
    name         text        not null,
    role         text        not null,
    rank         text        not null,
    hair_color   text        not null default '#42283a',
    shirt_color  text        not null default '#c9b8ff',
    accent_color text        not null default '#ff8fc0',
    position     integer     not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint ck_agent_staff_rank check (rank in ('LEAD', 'MEMBER'))
);

create index idx_agent_staff_team on agent_staff (team_id, position);

-- 팀당 팀장은 정확히 1명
create unique index uq_agent_staff_lead on agent_staff (team_id) where rank = 'LEAD';

create trigger trg_agent_staff_updated_at
    before update on agent_staff
    for each row execute function set_updated_at();

create table agent_thought (
    id       uuid    primary key default gen_random_uuid(),
    staff_id uuid    not null references agent_staff (id) on delete cascade,
    text     text    not null,
    position integer not null default 0
);

create index idx_agent_thought_staff on agent_thought (staff_id, position);

alter table agent_team enable row level security;
alter table agent_staff enable row level security;
alter table agent_thought enable row level security;

-- ---------------------------------------------------------------
-- 시드
-- ---------------------------------------------------------------
insert into agent_team (code, name, icon, short_name, task, report, route, position) values
    ('SIM',      '시뮬팀', '🎲', 'sim.lab',      '부대 편성 시뮬레이션과 발동 확률 계산',
     '발동확률이 입력된 전법만 계산합니다. 미입력은 추정하지 않아요.', '/builder',  1),
    ('HR',       '인사팀', '📋', 'hr.office',    '동맹원 주차 시트 적재와 마커·주의 관리',
     '주차별 시트를 cid 기준으로 정리하고 주의 사유를 남깁니다.',      '/hr',       2),
    ('STRATEGY', '전략팀', '♟️', 'strategy.war', '세력·병종 구성과 편성 우열 판단',
     '동세력 여부와 코스트 상한부터 확인합니다.',                      '/strategy', 3),
    ('PLANNING', '기획팀', '💡', 'plan.studio',  '덱 후보 발굴과 데이터 보강 우선순위 정리',
     '무엇을 먼저 채워야 분석이 정확해지는지 알려드려요.',             '/planning', 4);

-- 직원: 팀당 팀장 1 + 팀원 2
with t as (select code, id from agent_team)
insert into agent_staff (team_id, name, role, rank, hair_color, shirt_color, accent_color, position)
select t.id, s.name, s.role, s.rank, s.hair, s.shirt, s.accent, s.position
from t
join (values
    ('SIM',      '한도현', '시뮬 팀장',       'LEAD',   '#42283a', '#c9b8ff', '#ff8fc0', 0),
    ('SIM',      '노유진', '확률 계산',       'MEMBER', '#2f2a3d', '#b8f0dd', '#c9b8ff', 1),
    ('SIM',      '서지훈', '반복 검증',       'MEMBER', '#6b3d34', '#fff3b0', '#b8f0dd', 2),
    ('HR',       '오세라', '인사 팀장',       'LEAD',   '#7a453c', '#ffe6f2', '#ff8fc0', 0),
    ('HR',       '김하람', '시트 적재',       'MEMBER', '#334a3a', '#c9b8ff', '#fff3b0', 1),
    ('HR',       '문지안', '주의 이력 관리',  'MEMBER', '#5a3450', '#b8f0dd', '#ff8fc0', 2),
    ('STRATEGY', '최윤성', '전략 팀장',       'LEAD',   '#2d4b46', '#b8f0dd', '#b8f0dd', 0),
    ('STRATEGY', '배시원', '세력 구성 분석',  'MEMBER', '#463227', '#fff3b0', '#c9b8ff', 1),
    ('STRATEGY', '유가온', '병종 상성',       'MEMBER', '#8a4a3c', '#ffe6f2', '#ff8fc0', 2),
    ('PLANNING', '정아린', '기획 팀장',       'LEAD',   '#c26e4b', '#ff8fc0', '#fff3b0', 0),
    ('PLANNING', '강도경', '덱 후보 발굴',    'MEMBER', '#33304a', '#c9b8ff', '#b8f0dd', 1),
    ('PLANNING', '표수빈', '데이터 보강',     'MEMBER', '#274a44', '#fff3b0', '#c9b8ff', 2)
) as s(team_code, name, role, rank, hair, shirt, accent, position) on s.team_code = t.code;

-- 혼잣말
insert into agent_thought (staff_id, text, position)
select a.id, v.text, v.position
from agent_staff a
join agent_team t on t.id = a.team_id
join (values
    ('SIM',      '한도현', '같은 seed 면 결과가 같아야 해요.', 0),
    ('SIM',      '한도현', '반복 2만 번이면 소수점 둘째 자리까지는 믿을 만해요.', 1),
    ('SIM',      '노유진', '지휘 전법은 확률 판정을 안 거칩니다.', 0),
    ('SIM',      '노유진', '발동확률이 비면 계산에서 빼요.', 1),
    ('SIM',      '서지훈', '기대값이 이론값과 어긋나면 시드부터 봅니다.', 0),
    ('HR',       '오세라', '파일명 날짜와 시트 내용이 맞는지부터 봐요.', 0),
    ('HR',       '오세라', '주의를 켤 땐 사유를 반드시 남깁니다.', 1),
    ('HR',       '김하람', '같은 주차 재업로드는 덮어쓰기로 처리해요.', 0),
    ('HR',       '김하람', 'cid 앞자리 0이 날아가지 않게 문자열로 다룹니다.', 1),
    ('HR',       '문지안', '주의 사유는 지우지 않고 해제 처리만 해요.', 0),
    ('HR',       '문지안', '누가 언제 켰는지 남아야 나중에 설명이 됩니다.', 1),
    ('STRATEGY', '최윤성', '동세력 3인이면 보너스를 온전히 받아요.', 0),
    ('STRATEGY', '최윤성', '코스트 상한부터 확인하고 시작합니다.', 1),
    ('STRATEGY', '배시원', '세력이 다 다르면 보너스가 없어요.', 0),
    ('STRATEGY', '유가온', '병종이 비어 있으면 상성 얘기를 못 합니다.', 0),
    ('STRATEGY', '유가온', '아이콘만 보고 병종을 찍지 않아요.', 1),
    ('PLANNING', '정아린', '데이터가 없으면 점수가 아니라 입력률부터 봅니다.', 0),
    ('PLANNING', '정아린', '무엇을 먼저 채울지가 오늘의 결론이에요.', 1),
    ('PLANNING', '강도경', '전법 상세가 채워져야 후보 비교가 됩니다.', 0),
    ('PLANNING', '표수빈', '병종 54칸이 아직 비어 있어요.', 0),
    ('PLANNING', '표수빈', '추측으로 채우면 나중에 더 비쌉니다.', 1)
) as v(team_code, staff_name, text, position)
  on v.team_code = t.code and v.staff_name = a.name;

comment on table agent_team is 'AI 오피스 4개 팀. LLM 호출 없음 — 상태 기반 시뮬레이션';
