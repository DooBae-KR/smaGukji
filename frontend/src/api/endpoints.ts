import { request } from './client'
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
