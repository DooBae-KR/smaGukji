-- 새 테이블이 자동으로 열리는 것을 막는다.
--
-- 발견한 것
--   Supabase 는 public 스키마에 «기본 권한(default privileges)» 을 걸어둔다.
--   postgres 가 테이블을 만들면 anon·authenticated·service_role 에게
--   arwdDxtm(INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
--   전부가 «자동으로» 붙는다.
--
--   그래서 V20 에서 owned_card 에 select/insert/delete 만 줬는데도
--   anon 이 SELECT 를, authenticated 가 UPDATE 를 갖고 있었다.
--
-- 왜 문제인가
--   지금은 RLS 정책이 막아주고 있어 실제로 새어나가지는 않는다. 하지만 이건
--   «정책을 한 번이라도 빠뜨리면 곧바로 인터넷에 공개» 라는 뜻이다.
--   RLS 를 켜는 것을 잊은 테이블 하나면 충분하다.
--   V18 에서 한 일괄 회수는 그 시점에 있던 테이블만 고쳤고, 그 뒤에 만든
--   테이블(V20)은 다시 열린 채로 생겼다. 원인을 막지 않으면 계속 반복된다.
--
-- 여기서 하는 일
--   1. 기본 권한 자체를 꺼서 앞으로 만드는 것이 열리지 않게 한다
--   2. 지금까지 새어들어간 권한을 회수하고, 필요한 것만 다시 준다
--
-- service_role 은 건드리지 않는다. 서버 쪽에서 쓰는 열쇠이고 브라우저에 나가지 않는다.

-- ---------------------------------------------------------------
-- 1. 원인 차단
--
-- «for role postgres» 가 기본값이다. 우리 마이그레이션은 postgres 로 도니
-- 앞으로 만드는 테이블·시퀀스·함수가 더 이상 자동으로 열리지 않는다.
-- ---------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------
-- 2. 이미 붙어버린 권한 정리
--
-- 전부 회수한 뒤 필요한 것만 다시 준다. «무엇이 열려 있는지» 가 이 목록 하나로
-- 드러나는 편이, 여기저기 흩어진 grant 를 쫓아다니는 것보다 확인하기 쉽다.
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- anon 에게는 아무것도 주지 않는다. 로그인은 PostgREST 가 아니라 GoTrue 가 처리한다.

-- 읽기만 — 본인/소속 범위는 RLS 정책이 정한다
grant select on app_profile   to authenticated;
grant select on alliance      to authenticated;
grant select on member_week   to authenticated;
grant select on member_marker to authenticated;   -- 켜고 끄는 것은 app_toggle_marker() 로만

-- 읽기 + 쓰기 — 한 테이블 안에서 규칙이 끝나는 것들
grant select, insert, update, delete on caution_note to authenticated;
grant select, insert, delete         on owned_card   to authenticated;   -- 켜고 끄기뿐이라 update 는 없다

-- 공용 참조 데이터 — 로그인했으면 누구나 읽는다. 쓰기는 Render 가 postgres 로 한다
grant select on general, tactic, asset_image, menu_item,
                agent_team, agent_staff, agent_thought,
                team, team_slot, team_slot_tactic
           to authenticated;

-- 메뉴 노출 변경은 관리자만(정책이 판단). code/route 는 트리거가 고정한다
grant update on menu_item to authenticated;

-- app_user / app_account / app_session / flyway_schema_history 는 아무 권한도 주지 않는다.
-- 옛 로그인 방식이 쓰던 것들이라 접근 경로가 없어야 한다.

comment on schema public is
    '기본 권한을 꺼뒀다. 새 테이블에는 필요한 권한을 직접 grant 해야 한다(V21 참고)';
