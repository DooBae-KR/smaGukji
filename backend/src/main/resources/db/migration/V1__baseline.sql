-- smaGukji 베이스라인.
-- 도메인(장수/전법/부대)과 무관하게 항상 필요한 것만 둔다.
-- 삼국지 도메인 스키마는 게임 정보 확정 후 V3 부터 추가한다.

create extension if not exists pgcrypto;

-- 모든 테이블에서 재사용하는 updated_at 자동 갱신 트리거 함수
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ---------------------------------------------------------------
-- 애플리케이션 사용자
-- Supabase Auth 를 함께 쓰는 경우 supabase_user_id 에 auth.users.id 를 저장한다.
-- ---------------------------------------------------------------
create table app_user (
    id               uuid        primary key default gen_random_uuid(),
    supabase_user_id uuid        unique,
    email            text        not null,
    display_name     text        not null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint uq_app_user_email unique (email)
);

create trigger trg_app_user_updated_at
    before update on app_user
    for each row execute function set_updated_at();

-- Supabase 는 public 스키마를 PostgREST(anon/authenticated)로 노출하므로 RLS 를 켠다.
-- Spring Boot 백엔드는 테이블 소유자인 postgres 역할로 접속하므로 RLS 의 영향을 받지 않는다.
-- 정책이 없다 = anon/authenticated 는 전부 차단(deny by default).
alter table app_user enable row level security;

comment on table app_user is '애플리케이션 사용자';
