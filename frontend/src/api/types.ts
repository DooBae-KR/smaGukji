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
  simulation: {
    turns: number
    iterations: number
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
