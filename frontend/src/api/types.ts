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
  cost: number
  unitType?: string
  unitTypeLabel?: string
  attack?: number
  defense?: number
  intelligence?: number
  command?: number
  speed?: number
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
  costLimit?: number
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
  costLimit: number
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
  cost: {
    total: number
    limit: number
    remaining: number
    overBudget: boolean
    generalCount: number
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
