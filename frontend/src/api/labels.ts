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
 * 분석에 쓸 데이터가 갖춰졌는지.
 * 백엔드의 {@code perTurnTriggerProbability() != null} 과 같은 판정이다.
 */
export function isTacticDataComplete(
  category: string | null | undefined,
  triggerRate: number | null | undefined,
): boolean {
  if (!category) return false
  if (!TRIGGERS_BY_CHANCE.has(category)) return true
  return triggerRate != null
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
