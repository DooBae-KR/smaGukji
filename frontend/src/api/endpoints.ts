import { API_BASE, request } from './client'
import type {
  AssetImportResult,
  Completeness,
  FactionCode,
  General,
  Tactic,
  Team,
  TeamAnalysis,
  TeamRequest,
} from './types'

// --- 장수 ---

export function listGenerals(faction?: FactionCode): Promise<General[]> {
  return request<General[]>(`/generals${faction ? `?faction=${faction}` : ''}`)
}

export function patchGeneral(id: string, patch: Partial<General>): Promise<General> {
  return request<General>(`/generals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// --- 전법 ---

export function listTactics(): Promise<Tactic[]> {
  return request<Tactic[]>('/tactics')
}

export function tacticCompleteness(): Promise<Completeness> {
  return request<Completeness>('/tactics/completeness')
}

export function patchTactic(id: string, patch: Partial<Tactic>): Promise<Tactic> {
  return request<Tactic>(`/tactics/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/** CSV 일괄 입력. 헤더 한 줄 + 데이터 행. */
export function importTacticsCsv(csv: string) {
  return request<{ updated: number; skipped: number; notFound: string[]; errors: string[] }>(
    '/tactics/import',
    { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv },
  )
}

export function importGeneralsCsv(csv: string) {
  return request<{ updated: number; skipped: number; notFound: string[]; errors: string[] }>(
    '/generals/import',
    { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv },
  )
}

// --- 부대 ---

export function listTeams(): Promise<Team[]> {
  return request<Team[]>('/teams')
}

export function createTeam(team: TeamRequest): Promise<Team> {
  return request<Team>('/teams', { method: 'POST', body: JSON.stringify(team) })
}

export function deleteTeam(id: string): Promise<void> {
  return request<void>(`/teams/${id}`, { method: 'DELETE' })
}

/** 저장하지 않고 편성안을 즉석에서 분석한다. 편성 화면의 실시간 미리보기용. */
export function analyzeDraft(team: TeamRequest, turns = 8): Promise<TeamAnalysis> {
  return request<TeamAnalysis>(`/teams/analyze?turns=${turns}`, {
    method: 'POST',
    body: JSON.stringify(team),
  })
}

// --- 이미지 ---

export function importAssets(): Promise<AssetImportResult> {
  return request<AssetImportResult>('/assets/import', { method: 'POST' })
}

export function assetCount(): Promise<Record<string, number>> {
  return request<Record<string, number>>('/assets/count')
}

// --- 스프레드시트 동기화 ---

export interface SheetSyncResult {
  roster: {
    sheetGenerals: number
    sheetTactics: number
    createdTactics: string[]
    missingGenerals: string[]
    extraTactics: string[]
    extraGenerals: string[]
  }
  general: {
    sheetRows: number
    updated: number
    notFound: string[]
    skipped: string[]
  }
  /** 사람이 확인해야 할 것들 (시트 오타·명단 불일치) */
  warnings: string[]
}

/** 구글 시트에서 장수·전법 데이터를 한 번에 불러온다. */
export function syncSheets(): Promise<SheetSyncResult> {
  return request<SheetSyncResult>('/sheets/sync', { method: 'POST' })
}

/** 백엔드가 깨어 있는지 확인. 로딩 화면에서 사용. */
export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE.replace(/\/api$/, '')}/actuator/health`)
    return res.ok
  } catch {
    return false
  }
}
