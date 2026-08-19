-- 화면 메뉴 노출 제어.
--
-- 기본 정책: 인사팀만 누구에게나 보이고, 나머지 화면은 «관리자» 로 들어와야 보인다.
-- 어떤 메뉴를 열어둘지는 소스코드가 아니라 이 테이블에서 관리자가 켜고 끈다.
--
--   admin_only = true  → 관리자 세션이 있어야 목록에 나온다
--   visible    = false → 관리자에게도 숨긴다(완전히 끔)

create table menu_item (
    id         uuid        primary key default gen_random_uuid(),
    code       text        not null,
    label      text        not null,
    route      text        not null,
    icon       text,
    admin_only boolean     not null default true,
    visible    boolean     not null default true,
    position   integer     not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_menu_item_code unique (code),
    constraint uq_menu_item_route unique (route)
);

create index idx_menu_item_order on menu_item (position);

create trigger trg_menu_item_updated_at
    before update on menu_item
    for each row execute function set_updated_at();

alter table menu_item enable row level security;

insert into menu_item (code, label, route, icon, admin_only, visible, position) values
    ('hr',       '인사팀 · 동맹원', '/hr',       '📋', false, true, 1),
    ('office',   'AI 오피스',       '/office',   '🏢', true,  true, 2),
    ('builder',  '시뮬팀 · 편성',   '/builder',  '🎲', true,  true, 3),
    ('strategy', '전략팀',          '/strategy', '♟️', true,  true, 4),
    ('planning', '기획팀',          '/planning', '💡', true,  true, 5),
    ('generals', '장수',            '/generals', '🗡️', true,  true, 6),
    ('tactics',  '전법',            '/tactics',  '📜', true,  true, 7),
    ('data',     '데이터',          '/data',     '🗄️', true,  true, 8);

comment on table menu_item is '화면 메뉴 노출 제어. 인사팀 외에는 기본이 관리자 전용';
comment on column menu_item.admin_only is 'true 면 관리자 세션에서만 메뉴에 나타난다';
comment on column menu_item.visible is 'false 면 관리자에게도 숨긴다';
