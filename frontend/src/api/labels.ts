/**
 * 코드 → 한글 라벨.
 *
 * <p>장수·전법을 Render 대신 Supabase 에서 직접 읽으면서 필요해졌다.
 * 예전에는 Spring 이 enum 의 label() 을 붙여 내려줬지만, 그러면 Render 가 잠든 동안
 * 덱 편성 화면이 카드 목록조차 못 그린다. 동맹원에게는 그게 유일한 화면이라 치명적이다.
 *
 * <p>⚠️ 아래 값은 백엔드 enum 과 «반드시» 같아야 한다. 바꿀 일이 생기면 양쪽을 함께 고친다.
 *   backend/src/main/java/com/smagukji/backend/domain/Faction.java
 *   .../UnitType.java  .../Camp.java  .../Disposition.java
 *   .../TacticCategory.java  .../AbilityType.java  .../TacticQuality.java
 *
 * <p>enum 값 자체는 DB 의 체크 제약이 이미 강제하고 있어서, 여기 없는 코드가 들어올 일은
 * 새 값을 추가할 때뿐이다. 그런 경우 라벨 대신 코드가 그대로 보이므로 눈에 띈다.
 */

export const FACTION_LABEL: Record<string, string> = {
  WEI: '위', SHU: '촉', WU: '오', QUN: '군', HAN: '한',
}

export const UNIT_TYPE_LABEL: Record<string, string> = {
  SHIELD: '방패병', SPEAR: '창병', BOW: '궁병', CAVALRY: '기병',
}

export const CAMP_LABEL: Record<string, string> = {
  FRONT: '전열', BALANCE: '균형', BACK: '후열',
}

export const DISPOSITION_LABEL: Record<string, string> = {
  HEAL: '치유',
  SUPPORT: '보조',
  DEFENSE: '방어',
  SUPPORT_DEFENSE: '보조방어',
  CIVIL_MARTIAL: '문무',
  CIVIL_MARTIAL_SUPPORT: '문무보조',
  STRATEGY: '책략',
  WEAPON: '병기',
}

export const TACTIC_CATEGORY_LABEL: Record<string, string> = {
  PASSIVE: '패시브',
  ACTIVE: '액티브',
  COMMAND: '지휘',
  PURSUIT: '추격',
  ASSAULT: '돌격',
  FORMATION: '진법',
  INTERNAL: '내정',
}

export const ABILITY_TYPE_LABEL: Record<string, string> = {
  HEAL: '치유',
  SUPPORT: '보조',
  STRATEGY: '책략',
  WEAPON: '병기',
  DEFENSE: '방어',
  CIVIL_MARTIAL: '문무',
  CONTROL: '제어',
}

export const TACTIC_QUALITY_LABEL: Record<string, string> = {
  GOLD: '황금', PURPLE: '보라', BLUE: '파랑', GREEN: '초록',
}

/**
 * 매 턴 확률 판정으로 발동하는 분류.
 * 지휘·패시브·진법·내정은 상시 적용이라 발동확률이 없어도 «데이터 완비»로 본다.
 * (TacticCategory.triggersByChance() 와 같아야 한다)
 */
const TRIGGERS_BY_CHANCE = new Set(['ACTIVE', 'PURSUIT', 'ASSAULT'])

/**
 * 이 전법이 «한 턴에» 발동할 확률(0~1). 모르면 null.
 *
 * 백엔드 Tactic.perTurnTriggerProbability() 와 같은 계산이다. 전보 검증이 기대 발동 수를
 * 낼 때 시뮬레이션과 같은 모형을 써야 해서 여기에도 둔다 — 한쪽만 고치면 «검증» 이
 * 자기 자신을 검증하는 꼴이 된다.
 */
export function perTurnTriggerProbability(
  category: string | null | undefined,
  triggerRate: number | null | undefined,
): number | null {
  if (!category) return null
  // 지휘·패시브처럼 상시 적용되는 분류는 판정 없이 매 턴 걸린다.
  if (!TRIGGERS_BY_CHANCE.has(category)) return 1
  return triggerRate == null ? null : triggerRate / 100
}

/**
 * 분석에 쓸 데이터가 갖춰졌는지.
 * 백엔드의 {@code perTurnTriggerProbability() != null} 과 같은 판정이다.
 */
export function isTacticDataComplete(
  category: string | null | undefined,
  triggerRate: number | null | undefined,
): boolean {
  return perTurnTriggerProbability(category, triggerRate) != null
}

/** 코드를 라벨로. 모르는 코드는 코드 그대로 보여 눈에 띄게 한다. */
export function label(map: Record<string, string>, code: string | null | undefined): string | undefined {
  if (!code) return undefined
  return map[code] ?? code
}

/**
 * 시즌 표시. 카드에 «S» 가 붙는 시즌 장수·전법을 한눈에 알아보게 한다.
 * 비어 있으면 시즌 구분이 없는 기본 카드다.
 */
export function seasonTag(season?: number): string | undefined {
  return season == null ? undefined : `S${season}`
}

/**
 * 화면에 보여줄 이름. 시즌 카드는 뒤에 «S2» 를 붙인다.
 *
 * <p>같은 이름의 기본 카드와 시즌 카드가 함께 있을 수 있어서, 목록에서 구분이 필요하다.
 * DB 의 name 은 그대로 두고 표시할 때만 붙인다. 이름으로 조회하는 곳이 여러 군데라
 * 실제 값에 손대면 연결이 끊어진다.
 */
export function displayName(name: string, season?: number): string {
  return season == null ? name : `${name} S${season}`
}

/** 나라 표시 순서. 위·촉·오 다음에 군웅·한실. */
export const FACTION_ORDER = ['WEI', 'SHU', 'WU', 'QUN', 'HAN']

/** 등급 표시 순서와 라벨. */
export const RARITY_ORDER = ['LEGEND', 'HERO']

export const RARITY_LABEL: Record<string, string> = {
  LEGEND: '전설',
  HERO: '영웅',
}
