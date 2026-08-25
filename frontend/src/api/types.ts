export type AssetCategory = 'GENERAL' | 'TACTIC'

export interface AssetImageSummary {
  id: string
  category: AssetCategory
  name: string
  fileName: string
  contentType: string
  byteSize: number
  sha256: string
  externalUrl?: string
}

export interface AssetImportResult {
  inserted: number
  updated: number
  unchanged: number
  failures: string[]
}

export type FactionCode = 'WEI' | 'SHU' | 'WU' | 'QUN' | 'HAN'

export interface General {
  id: string
  name: string
  faction: FactionCode
  factionLabel: string
  /** 카드에 적힌 레벨. 이 게임에는 코스트라는 개념이 없다 */
  level: number
  /** LEGEND 전설(노란 테두리) / HERO 영웅(보라 테두리). 비어 있으면 아직 확인되지 않음 */
  rarity?: "LEGEND" | "HERO"
  /** 시즌 장수 번호. 카드에 S 표시가 있는 장수 */
  season?: number
  /** 병종: SHIELD 방패병 / SPEAR 창병 / BOW 궁병 / CAVALRY 기병 */
  unitType?: string
  unitTypeLabel?: string
  /** 진영(배치): FRONT 전열 / BALANCE 균형 / BACK 후열. 세력과는 다른 축이다 */
  camp?: string
  campLabel?: string
  /** 성향 코드. 한 장수가 여러 성향을 가질 수 있다 (예: 방어+병기) */
  dispositions: string[]
  /** 위 코드의 한글 라벨. 순서가 대응된다 */
  dispositionLabels: string[]
  /** 무력 · 지력 · 통솔 · 선공 (statLevel 기준, 소수점 있음) */
  might?: number
  intellect?: number
  leadership?: number
  initiative?: number
  statLevel: number
  signatureTacticName?: string
  note?: string
  imageUrl: string
}

export interface Tactic {
  id: string
  name: string
  category?: string
  categoryLabel?: string
  abilityType?: string
  abilityTypeLabel?: string
  quality?: string
  qualityLabel?: string
  triggerRate?: number
  targetCount?: number
  effectText?: string
  roleTags: string[]
  source?: string
  /** 시즌 전법 번호. 카드에 S 표시가 있는 전법 */
  season?: number
  /** LEGEND 전설 / HERO 영웅. 비어 있으면 아직 확인되지 않음 */
  rarity?: "LEGEND" | "HERO"
  dataComplete: boolean
  imageUrl: string
}

export interface TeamSlotDraft {
  position: number
  generalName: string
  tacticNames: string[]
}

export interface TeamRequest {
  name: string
  description?: string
  slots: TeamSlotDraft[]
}

export interface TeamSlot {
  id: string
  position: number
  leader: boolean
  general: General
  tactics: Tactic[]
}

export interface Team {
  id: string
  name: string
  description?: string
  slots: TeamSlot[]
  createdAt: string
  updatedAt: string
}

export interface Finding {
  severity: 'ERROR' | 'WARN' | 'INFO'
  code: string
  message: string
}

export interface TeamAnalysis {
  teamId?: string
  teamName: string
  score: number
  grade: string
  scoreCoverage: number
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  roster: {
    generalCount: number
    slotCapacity: number
  }
  faction: {
    countByFaction: Record<string, number>
    dominantFaction?: string
    dominantCount: number
    tier: string
    note: string
  }
  unitType: {
    countByUnitType: Record<string, number>
    unknownCount: number
    uniform: boolean
    note: string
  }
  tactics: {
    equippedCount: number
    slotCapacity: number
    countByCategory: Record<string, number>
    countByAbilityType: Record<string, number>
    countByQuality: Record<string, number>
    averageTriggerRate?: number
    dataCompleteness: number
    duplicateNames: string[]
    missingDataNames: string[]
  }
  /**
   * 화력·회복 지표.
   *
   * <p>전법 설명문의 «X%→Y%» 에서 만렙 계수 Y 를 읽어 그 전법을 든 장수의 무력(병기)이나
   * 지력(책략)에 곱하고 대상 수·발동확률까지 반영해 더한 값이다.
   *
   * <p>⚠️ 게임 안의 실제 피해량이 아니다. 진형·국가 강화·병종 보너스·회심·상대 통솔 감쇄가
   * 빠져 있다. 같은 식을 모든 덱에 적용하므로 <b>덱끼리 견주는 데만</b> 쓴다.
   */
  firepower: {
    damagePerTurn: number
    healPerTurn: number
    /** 장수별 턴당 피해 지표 */
    byGeneral: Record<string, number>
    /** 계수를 읽어낸 전법 수 */
    countedTactics: number
    /** 계수를 못 읽은 전법 수. 버프 전용 전법이면 정상이다 */
    unreadableTactics: number
  }
  /**
   * 이 편성이 가진 장점.
   *
   * <p>findings 가 «고쳐야 할 것»이라면 이쪽은 «이미 잘 되어 있는 것»이다. 티어덱표에
   * 덱마다 «왜 이 덱을 쓰는가»를 적으려면 지적 사항만으로는 쓸 수 없어서 따로 둔다.
   */
  strengths: {
    /** 시트 열이나 필터에 쓰기 좋은 고정 코드 */
    code: string
    /** 티어표 한 칸에 들어갈 짧은 이름 */
    title: string
    /** 판단 근거가 된 수치를 포함한 설명 */
    detail: string
  }[]
  simulation: {
    turns: number
    /** 몬테카를로 반복 횟수. 정확 계산이면 0 이다 */
    iterations: number
    /** EXACT=분포를 그대로 계산 / MONTE_CARLO=무작위 반복 */
    method?: 'EXACT' | 'MONTE_CARLO'
    evaluatedTactics: number
    skippedTactics: number
    expectedPerTurn: number
    probAtLeastOne: number
    activationHistogram: Record<string, number>
    perTacticExpected: Record<string, number>
  }
  findings: Finding[]
}

export interface Completeness {
  total: number
  filled: number
  missing: number
  percent: number
}
