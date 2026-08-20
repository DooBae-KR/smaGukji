-- 전법 특성에 «문무» 가 등장했다(동탁 - 압도적 권력).
-- 성향의 CIVIL_MARTIAL 과 이름은 같지만 다른 컬럼이다.

alter table tactic drop constraint ck_tactic_ability_type;

alter table tactic add constraint ck_tactic_ability_type
    check (ability_type is null or ability_type in
        ('HEAL', 'SUPPORT', 'STRATEGY', 'WEAPON', 'DEFENSE', 'CIVIL_MARTIAL', 'CONTROL'));

comment on column tactic.ability_type is '전법 특성: HEAL=치유 SUPPORT=보조 STRATEGY=책략 WEAPON=병기 DEFENSE=방어 CIVIL_MARTIAL=문무 (CONTROL 은 예비)';
