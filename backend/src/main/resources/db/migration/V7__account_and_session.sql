-- 인사팀 로그인.
--
-- 흐름: 관리자 ID 입력(게이트) → 동맹원 ID/PW 입력(인증) → 동맹 정보 열람
--
-- 🔒 비밀번호는 BCrypt 해시로만 저장한다. 평문은 어디에도(로그·응답·DB) 남기지 않는다.
--    게임 계정 비밀번호가 아니라 이 앱 전용 계정이다. 외부 서비스 자격증명을 받지 않는다.

create table app_account (
    id             uuid        primary key default gen_random_uuid(),
    alliance_id    uuid        references alliance (id) on delete cascade,
    login_id       text        not null,
    password_hash  text        not null,
    role           text        not null,
    cid            text,
    display_name   text        not null,
    active         boolean     not null default true,
    failed_attempts integer    not null default 0,
    locked_until   timestamptz,
    last_login_at  timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint uq_app_account_login unique (login_id),
    constraint ck_app_account_role check (role in ('ADMIN', 'MEMBER')),
    -- BCrypt 해시 형식만 허용해서 평문이 실수로 들어가는 것을 DB 차원에서 막는다.
    constraint ck_app_account_hash check (password_hash ~ '^\$2[aby]\$\d{2}\$.{53}$')
);

create index idx_app_account_alliance on app_account (alliance_id, role);
create index idx_app_account_cid on app_account (alliance_id, cid);

create trigger trg_app_account_updated_at
    before update on app_account
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 세션. 토큰 원문은 저장하지 않고 SHA-256 해시만 둔다.
-- DB 가 유출돼도 토큰을 그대로 재사용할 수 없게 하기 위해서다.
-- ---------------------------------------------------------------
create table app_session (
    id           uuid        primary key default gen_random_uuid(),
    account_id   uuid        not null references app_account (id) on delete cascade,
    token_hash   text        not null,
    expires_at   timestamptz not null,
    created_at   timestamptz not null default now(),
    constraint uq_app_session_token unique (token_hash)
);

create index idx_app_session_account on app_session (account_id);
create index idx_app_session_expiry on app_session (expires_at);

alter table app_account enable row level security;
alter table app_session enable row level security;

comment on table app_account is '이 앱 전용 계정. 게임 계정 자격증명이 아니다';
comment on column app_account.password_hash is 'BCrypt 해시. 평문 저장 금지(체크 제약으로 강제)';
comment on column app_session.token_hash is '세션 토큰의 SHA-256 해시. 원문은 발급 시 1회만 클라이언트에 전달';
