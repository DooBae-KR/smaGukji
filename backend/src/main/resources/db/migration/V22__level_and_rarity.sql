-- 코스트는 이 게임에 없는 개념이었다.
--
-- 카드에 적힌 숫자(예: «5 관우»)를 코스트로 읽고 테이블을 만들었는데,
-- 실제로는 «레벨»이고 코스트 제한 없이 어떤 장수든 쓸 수 있다.
-- 그래서 이름을 바로잡고, 코스트 상한이라는 개념 자체를 없앤다.
--
-- 참고: 지금 general.cost 는 54명 전원이 5.0 이다. 값 자체에는 정보가 없어서
-- 옮겨도 잃는 것이 없다. 이름만 사실에 맞게 고치는 셈이다.

alter table general rename column cost to level;

alter table general rename constraint ck_general_cost to ck_general_level;
alter table general drop constraint ck_general_level;
-- 최대 레벨을 모른다. 모르는 상한을 지어내느니 «양수» 만 강제한다.
alter table general add constraint ck_general_level check (level > 0);

comment on column general.level is '카드에 적힌 레벨. 코스트가 아니다(이 게임에는 코스트가 없다)';

-- 부대의 코스트 상한. 쓸 일이 없어졌다.
-- 값이 전부 기본값(15.0)이라 지워도 잃는 정보가 없다.
alter table team drop column cost_limit;

-- ---------------------------------------------------------------
-- 등급과 시즌
--
-- 카드 테두리 색이 등급을 뜻한다고 한다. 노랑=전설, 보라=영웅.
-- 그런데 DB 에 넣어둔 카드 이미지에서는 구분되지 않는다.
-- 54장의 테두리 색을 재보니 51장이 같은 색(hue 35°)으로 나왔고, 벗어난 3장도
-- 테두리가 아니라 그림 자체의 색이었다. 즉 이 이미지들에는 등급 테두리가 없다.
--
-- 그래서 값은 비워둔다. 모르는 것을 그럴듯하게 채우면, 나중에 그것이 실제 데이터인지
-- 지어낸 것인지 구분할 수 없게 된다. 채우는 것은 사람이 알려준 뒤에 한다.
-- ---------------------------------------------------------------
-- rarity 컬럼 자체는 V3 에서 만들어 뒀지만 값도 제약도 없이 비어 있었다.
-- 이제 무엇이 들어갈 수 있는지 정해준다.
alter table general add constraint ck_general_rarity
    check (rarity is null or rarity in ('LEGEND', 'HERO'));

-- 시즌 장수. 카드에 «S» 가 붙어 있는 것들이며 현재는 시즌2 다.
-- 비어 있으면 시즌 구분이 없는 기본 장수라는 뜻이다.
alter table general add column season integer;
alter table general add constraint ck_general_season
    check (season is null or season >= 1);

create index idx_general_rarity on general (rarity);

comment on column general.rarity is 'LEGEND 전설(노란 테두리) / HERO 영웅(보라 테두리). 비어 있으면 아직 확인되지 않음';
comment on column general.season is '시즌 장수 번호. 카드에 S 표시가 있는 장수. 비어 있으면 기본 장수';
