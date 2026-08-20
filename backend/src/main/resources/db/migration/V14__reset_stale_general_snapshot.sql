-- V13 은 스프레드시트를 «편집 중»에 찍은 스냅샷이었다.
-- 그 순간 주유 행에 곽가의 수치가 들어 있었고(복사 중이던 것으로 보인다),
-- 이후 시트에서 주유 행은 사라지고 곽가로 확정됐다.
--
-- 그래서 DB 에는 곽가와 주유가 똑같은 수치(45/241/169/134)를 갖는 상태가 남았다.
-- 시트에 없는 장수의 분류를 지어낸 셈이므로 되돌린다.
--
-- 앞으로 시트 반영은 마이그레이션이 아니라 POST /api/generals/sync-sheet 로 한다.
-- 시트가 계속 바뀌는데 변경마다 마이그레이션을 쌓는 것은 맞지 않는다.

update general
set camp = null,
    dispositions = '{}',
    unit_type = null,
    might = null,
    intellect = null,
    leadership = null,
    initiative = null,
    signature_tactic_id = null
where name = '주유';
