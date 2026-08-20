-- 시트에 «문무» 성향이 새로 등장했다(동탁). 기존 «문무보조»와는 다른 값이다.
--
-- 분류 값은 앞으로도 늘어날 수 있다. 동기화는 모르는 값을 만나면 그 행을 통째로 건너뛰고
-- 무엇이 걸렸는지 보고하므로, 이렇게 제약과 enum 만 더해주면 된다.

alter table general drop constraint ck_general_dispositions;

alter table general add constraint ck_general_dispositions
    check (dispositions <@ array[
        'HEAL', 'SUPPORT', 'DEFENSE', 'SUPPORT_DEFENSE',
        'CIVIL_MARTIAL', 'CIVIL_MARTIAL_SUPPORT', 'STRATEGY', 'WEAPON'
    ]::text[]);

comment on column general.dispositions is '성향(복수): HEAL=치유 SUPPORT=보조 DEFENSE=방어 SUPPORT_DEFENSE=보조방어 CIVIL_MARTIAL=문무 CIVIL_MARTIAL_SUPPORT=문무보조 STRATEGY=책략 WEAPON=병기. 보조방어·문무보조는 시트에 한 덩어리로 적혀 있어 분해하지 않는다.';
