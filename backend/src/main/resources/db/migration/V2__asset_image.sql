-- 장수 / 전법 카드 이미지 원본을 DB(bytea)에 보관한다.
-- 131개 x 약 110KB = 약 14MB 로 Supabase 무료 티어(500MB) 안에서 여유롭다.
-- 나중에 Supabase Storage 로 옮기면 external_url 만 채우고 data 를 비우면 된다.
--
-- 이 테이블은 장수/전법의 '수치' 스키마와 독립적이다. 이름(name)으로 느슨하게 연결되므로
-- 이후 general / tactic 테이블이 생겨도 이 테이블은 그대로 재사용한다.

create table asset_image (
    id           uuid        primary key default gen_random_uuid(),
    category     text        not null,
    name         text        not null,
    file_name    text        not null,
    content_type text        not null default 'image/png',
    byte_size    integer     not null,
    sha256       text        not null,
    data         bytea,
    external_url text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint uq_asset_image_key      unique (category, name),
    constraint ck_asset_image_category check (category in ('GENERAL', 'TACTIC')),
    constraint ck_asset_image_size     check (byte_size > 0),
    constraint ck_asset_image_payload  check (data is not null or external_url is not null)
);

create index idx_asset_image_category on asset_image (category, name);
create index idx_asset_image_sha256 on asset_image (sha256);

create trigger trg_asset_image_updated_at
    before update on asset_image
    for each row execute function set_updated_at();

alter table asset_image enable row level security;

comment on table asset_image is '장수/전법 카드 이미지 원본 (PNG bytea)';
comment on column asset_image.category is 'GENERAL=장수, TACTIC=전법';
comment on column asset_image.name is '파일명에서 확장자를 제거한 이름. 예: 관우, 결사의 다짐';
comment on column asset_image.sha256 is '재적재 시 변경 여부 판단용 원본 해시';
