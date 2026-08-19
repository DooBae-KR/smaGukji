-- 권한을 3단계로 나눈다.
--   ADMIN   관리자   : 메뉴 권한 + 계정 관리 + 전체
--   OFFICER 간부진   : 인사 탭 관리 권한만
--   MEMBER  동맹원   : 시뮬레이션만
--
-- 메뉴 노출도 admin_only(2단계) 로는 표현이 안 되므로 역할 목록으로 바꾼다.

alter table app_account drop constraint ck_app_account_role;
alter table app_account add constraint ck_app_account_role
    check (role in ('ADMIN', 'OFFICER', 'MEMBER'));

-- ---------------------------------------------------------------
-- 메뉴: admin_only(boolean) → allowed_roles(text[])
-- ---------------------------------------------------------------
alter table menu_item add column allowed_roles text[] not null default '{ADMIN}';

-- 기존 값 이전: 관리자 전용이 아니었던 메뉴는 전 역할에게 열어둔다.
update menu_item set allowed_roles = '{ADMIN,OFFICER,MEMBER}' where admin_only = false;

alter table menu_item drop column admin_only;

alter table menu_item add constraint ck_menu_allowed_roles
    check (allowed_roles <@ array['ADMIN', 'OFFICER', 'MEMBER']::text[]
           and array_length(allowed_roles, 1) >= 1);

-- ---------------------------------------------------------------
-- 요청한 기본 권한으로 재설정
--   인사팀   → 관리자 + 간부진
--   시뮬팀   → 관리자 + 동맹원 (동맹원은 시뮬레이션만)
--   그 외    → 관리자
-- 관리자는 «관리자» 화면에서 언제든 바꿀 수 있다.
-- ---------------------------------------------------------------
update menu_item set allowed_roles = '{ADMIN,OFFICER}'        where code = 'hr';
update menu_item set allowed_roles = '{ADMIN,OFFICER,MEMBER}' where code = 'builder';
update menu_item set allowed_roles = '{ADMIN}'
    where code in ('office', 'strategy', 'planning', 'generals', 'tactics', 'data');

comment on column menu_item.allowed_roles is '이 메뉴를 볼 수 있는 역할 목록. 예: {ADMIN,OFFICER}';
