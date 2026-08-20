-- 자동 생성 파일. 직접 수정하지 말고 tools/generate-general-seed.js 를 다시 실행하세요.
--
-- 출처: 사용자 스프레드시트의 «무장» 시트.
-- 시트가 비어 있는 장수는 넣지 않는다. 추측으로 채우지 않는다.

-- 1) 고유전법. 카드로 존재하는 77개 전법과는 별개다.
insert into tactic (name, category, ability_type, trigger_rate, effect_text, source) values
    ('백성과의함께', 'COMMAND', 'HEAL', 100, '전투 시작 시, 전체 아군의 통솔이 9 → 18 포인트 증가하며 (지력의 영향받음). 매 턴 종료 시, 전체 야군의 병력을 (치유율 50% → 100%, 지력의 영향 받음). 병력이 가장 낮은 아군 단일 목표의 디버프 상태 1가지를 제거하고, 1회 추가로 회복시킨다 (치유율 45% → 90%, 지력의 영향 받음).', 'SIGNATURE'),
    ('난세의 간웅', 'COMMAND', 'SUPPORT', 100, '전투 시작 시, 전체 아군이 받는 피해가 7% → 14% 감소하며 (지력의 영향 받음), 3% → 6%의 회유(과) 심리 피해를 (물) 획득한다 (지력의 영향 받음). 통솔이 가장 높은 아군 단일 목표를 피해를 받을 때마다 15% → 30% 확률로 자신도 병력을 회복한다 (치유율 20% → 40%, 지력과 통솔의 영향 받음).', 'SIGNATURE'),
    ('강동호거', 'COMMAND', 'SUPPORT', 100, '자신이 액티브 전법을 학습할 때마다 전체 아군의 액티브 전법 발동률이 3.5% → 7% 증가하고, 받는 피해가 2.5% → 5% 감소한다. 자신이 액티브 전법이 아닌 전법을 학습할 때마다 전체 아군의 14% → 28% 연타 확률이 증가하고, 받는 책략 피해가 2.5% → 5% (모든 효과는 자신의 초상 영향받음) 감소한다.', 'SIGNATURE'),
    ('초선차전', 'COMMAND', 'STRATEGY', 100, '자신의 심리 공격력(가) 12% → 24% 증가하며, 자신이 피해를 주거나 받으면 50% 확률로 랜덤 단일 목표에게 40% → 80%의 책략 피해를 주고, 매 턴 5회 발동될 수 있다.', 'SIGNATURE'),
    ('화하진압', 'ACTIVE', 'WEAPON', 45, '2턴 동안 자신의 액티브 전법 발동률이 4% → 8% 증가하며, 공포 상태를 보유한 적군 1명마다 추가로 3% → 6%의 병기 피해를 주며, 목표 전체에게 90% → 180%의 병기 피해를 주며, 목표가 제어 상태를 보유하면, 목표가 제어 상태를 보유하면, 축적된 피해량(합성)가 연타(협력의 영향 받음).', 'SIGNATURE'),
    ('철진철출', 'PASSIVE', 'WEAPON', 100, '자신의 회심 확률이 17.5% → 35% 증가하며, 피신 성공 후, 용담 발동: 랜덤 적군 2명에게 즉시 45% → 90%의 병기 피해를 주며, 현재 턴에서 다음 용담의 피해 계수가 5% → 10% 감소한다. 용담은 매 턴 7회 발동될 수 있다.', 'SIGNATURE'),
    ('기병 돌격', 'PASSIVE', 'WEAPON', 100, '자신의 회심 확률이 22.5% → 45% 증가하며, 회심 피해를 준 후, 목표에게 추격 피해 발동: 통솔을 무시하는 30% → 60%의 병기 피해(회심 발동 불가)를 1회 준다. 목표가 디버프 상태를 보유한 경우, 추격 피해는 매 턴 5회 발동될 수 있다.', 'SIGNATURE'),
    ('현모한 계책', 'COMMAND', 'STRATEGY', 100, '매 턴 시작 시, 90%→90% 확률로 랜덤 적군 단일 목표와 우군 1명에게 2턴 동안 지속되는 혼란을(를) 부여한다. 적군 목표가 이미 혼란 상태일 경우, 추가로 150%→300%의 책략 피해를 준다. 우군 목표가 이미 혼란 상태일 경우, 추가로 해당 목표와 자신의 병력을 회복한다(치유율 55%→110%, 지력의 영향 받음).
전체 아군이 자신과 우군에게 주는 피해가 30%→60% 감소한다,', 'SIGNATURE'),
    ('화소연영', 'ACTIVE', 'STRATEGY', 60, '랜덤 적군 단일 목표에게 2턴 동안 지속되는 화공을(를) 부여한다. 이후 화공 상태를 보유한 적군 목표에게 2턴 동안 지속되는 연소 상태를 1스택 부여하며, 110%→220%의 책략 피해를 주고, 40% 확률로(지력의 영향 받음) 추가로 1스택의 연소 상태를 부여한다.', 'SIGNATURE'),
    ('바람 방랑자', 'PASSIVE', 'SUPPORT', 100, '관통이(가) 10%→20% 증가한다. 매 턴 시작 시, 60%→60% 확률(이미 손실된 병력의 영향 받음)로 1턴 동안 정신 회복을(를) 획득한다. 자신이 전열이면 피해를 준 후, 랜덤 적군 단일 목표에게 25%→50%의 피해 전달을(를) 주며, 후열 목표를 우선적으로 선택한다.', 'SIGNATURE'),
    ('매의 응시', 'ACTIVE', 'STRATEGY', 100, '포석을 진행하여 포진 상태 1가지를 랜덤으로 획득하며(다른 상태 우선 획득), 전투 종료까지 지속된다. 25%→50% 확률로(지력의 영향 받음) 1회 재포석한다. 랜덤 적군 2명에게 25%→50%의 책략 피해를 주며, 포석으로 제공되는 상태 1가지 당 책략 피해 계수가 10%→20% 증가한다. 8회까지 증가할 수 있다.', 'SIGNATURE'),
    ('연환계', 'COMMAND', 'SUPPORT', 100, '자신의 간파이(가) 10%→20% 증가한다(지력의 영향 받음). 홀수 턴에 적군 전체에 1턴 동안 연환을 부여한다. 연환: 피해를 받으면 우군 2명이 12.5%→25%(지력의 영향 받음)의 피해 전달을(를) 받는다.', 'SIGNATURE'),
    ('주도면밀', 'COMMAND', 'STRATEGY', 100, '전투 시작 시, 자신과 지력이 가장 높은 우군의 액티브 전법 발동률이 3%→6% 증가한다. 자신이 액티브 전법 발동 성공 후, 35%→70% 확률로 1회 추가 발동한다(추가로 전법 준비할 필요 없음).', 'SIGNATURE'),
    ('고대의 악래', 'PASSIVE', 'WEAPON', 100, '자신의 반격 확률이 30%→60% 증가하며, 자신이 피해를 받은 후, 2턴 동안 자신의 반격 피해가 10%→20%, 통솔이 10→20포인트 증가한다, 5회 중첩될 수 있다.', 'SIGNATURE')
on conflict (name) do update set
    category = excluded.category,
    ability_type = excluded.ability_type,
    trigger_rate = excluded.trigger_rate,
    effect_text = excluded.effect_text,
    source = excluded.source;

-- 2) 장수 분류·수치를 채우고 고유전법을 연결한다.
--    이름이 이미 있는 장수만 갱신한다. 시트에만 있는 이름은 만들지 않는다.
update general set
    camp = 'FRONT', dispositions = '{HEAL}', unit_type = 'SHIELD',
    might = 151.5, intellect = 209.5, leadership = 215, initiative = 139,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '백성과의함께')
where name = '유비';

update general set
    camp = 'FRONT', dispositions = '{SUPPORT_DEFENSE}', unit_type = 'SHIELD',
    might = 141, intellect = 217, leadership = 233, initiative = 142.5,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '난세의 간웅')
where name = '조조';

update general set
    camp = 'BALANCE', dispositions = '{CIVIL_MARTIAL_SUPPORT}', unit_type = 'SPEAR',
    might = 185.5, intellect = 200, leadership = 205.5, initiative = 190.5,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '강동호거')
where name = '손권';

update general set
    camp = 'BALANCE', dispositions = '{STRATEGY}', unit_type = 'BOW',
    might = 76, intellect = 275, leadership = 226, initiative = 139.5,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '초선차전')
where name = '제갈량';

update general set
    camp = 'BACK', dispositions = '{WEAPON}', unit_type = 'CAVALRY',
    might = 257.5, intellect = 153.5, leadership = 210.5, initiative = 200.5,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '화하진압')
where name = '관우';

update general set
    camp = 'FRONT', dispositions = '{WEAPON}', unit_type = 'CAVALRY',
    might = 249.5, intellect = 153, leadership = 214.5, initiative = 180.5,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '철진철출')
where name = '조운';

update general set
    camp = 'BACK', dispositions = '{WEAPON}', unit_type = 'CAVALRY',
    might = 257, intellect = 108.5, leadership = 189, initiative = 201.5,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '기병 돌격')
where name = '마초';

update general set
    camp = 'BACK', dispositions = '{STRATEGY}', unit_type = 'BOW',
    might = 68, intellect = 243, leadership = 167, initiative = 159,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '현모한 계책')
where name = '가후';

update general set
    camp = 'BACK', dispositions = '{STRATEGY}', unit_type = 'BOW',
    might = 88, intellect = 240, leadership = 191, initiative = 134,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '화소연영')
where name = '육손';

update general set
    camp = 'FRONT', dispositions = '{WEAPON}', unit_type = 'CAVALRY',
    might = 230, intellect = 159, leadership = 191, initiative = 204,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '바람 방랑자')
where name = '장료';

update general set
    camp = 'BACK', dispositions = '{STRATEGY}', unit_type = 'SHIELD',
    might = 84, intellect = 245, leadership = 209, initiative = 116,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '매의 응시')
where name = '사마의';

update general set
    camp = 'BACK', dispositions = '{SUPPORT}', unit_type = 'BOW',
    might = 79, intellect = 235, leadership = 162, initiative = 125,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '연환계')
where name = '방통';

update general set
    camp = 'BACK', dispositions = '{STRATEGY}', unit_type = 'BOW',
    might = 45, intellect = 241, leadership = 169, initiative = 134,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '주도면밀')
where name = '곽가';

update general set
    camp = 'FRONT', dispositions = '{DEFENSE,WEAPON}', unit_type = 'SPEAR',
    might = 245, intellect = 59, leadership = 193, initiative = 169,
    stat_level = 50,
    signature_tactic_id = (select id from tactic where name = '고대의 악래')
where name = '전위';

update general set
    camp = 'BACK', dispositions = '{STRATEGY}', unit_type = 'BOW',
    might = 45, intellect = 241, leadership = 169, initiative = 134,
    stat_level = 50
where name = '주유';

