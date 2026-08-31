-- «전보 검증» 메뉴.
--
-- 전보(전투 결과) 스크린샷을 올려 실제 전법 발동을 시뮬레이션의 가정과 맞춰 보는 화면.
-- 시뮬레이션(«시뮬팀 · 편성»)을 쓰는 사람과 같은 대상이라 같은 권한으로 연다
-- (관리자 + 간부진 + 동맹원).

insert into menu_item (code, label, route, icon, allowed_roles, visible, position)
values ('ocr', '전보 검증', '/ocr', '📸', '{ADMIN,OFFICER,MEMBER}', true, 9);
