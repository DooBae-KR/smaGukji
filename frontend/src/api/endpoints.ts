import { API_BASE, assetImageUrl, request } from './client'
import { supabase } from '../lib/supabase'
import {
  ABILITY_TYPE_LABEL,
  CAMP_LABEL,
  DISPOSITION_LABEL,
  FACTION_LABEL,
  TACTIC_CATEGORY_LABEL,
  TACTIC_QUALITY_LABEL,
  UNIT_TYPE_LABEL,
  isTacticDataComplete,
  label,
} from './labels'
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

/**
 * 읽기는 Supabase, 쓰기·계산은 Render.
 *
 * <p>장수·전법 «조회»가 Render 에 묶여 있으면 무료 인스턴스가 잠든 동안 덱 편성 화면이
 * 카드 목록조차 못 그린다. 동맹원에게는 그게 유일한 화면이라 앱이 죽은 것처럼 보인다.
 * 그래서 조회는 항상 켜져 있는 Supabase 에서 직접 읽는다.
 *
 * <p>반대로 수정·불러오기·시뮬레이션은 Render 에 남는다. 버튼을 눌러서 하는 일이라
 * 기다림을 납득할 수 있고, 파싱과 계산에 서버가 필요하다.
 */

function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error((res.error as { message?: string }).message ?? '조회 실패')
  return res.data as T
}

// --- 장수 ---

interface GeneralRow {
  id: string
  name: string
  faction: string
  level: number
  rarity: string | null
  season: number | null
  unit_type: string | null
  camp: string | null
  dispositions: string[] | null
  might: number | null
  intellect: number | null
  leadership: number | null
  initiative: number | null
  stat_level: number
  signature_tactic_id: string | null
  note: string | null
}

export async function listGenerals(faction?: FactionCode): Promise<General[]> {
  let query = supabase
    .from('general')
    .select('id, name, faction, level, rarity, season, unit_type, camp, dispositions, might, intellect, leadership, initiative, stat_level, signature_tactic_id, note')
    .order('name')
  if (faction) query = query.eq('faction', faction)

  const [generals, tactics] = await Promise.all([
    query,
    supabase.from('tactic').select('id, name'),
  ])

  const rows = unwrap(generals) as GeneralRow[]
  // 고유전법 이름은 따로 읽어 붙인다. 관계 임베딩보다 이 편이 예측하기 쉽다.
  const tacticName = new Map(
    (unwrap(tactics) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  )

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    faction: r.faction as FactionCode,
    factionLabel: label(FACTION_LABEL, r.faction) ?? r.faction,
    level: r.level,
    rarity: (r.rarity as "LEGEND" | "HERO" | null) ?? undefined,
    season: r.season ?? undefined,
    unitType: r.unit_type ?? undefined,
    unitTypeLabel: label(UNIT_TYPE_LABEL, r.unit_type),
    camp: r.camp ?? undefined,
    campLabel: label(CAMP_LABEL, r.camp),
    dispositions: r.dispositions ?? [],
    dispositionLabels: (r.dispositions ?? []).map((d) => label(DISPOSITION_LABEL, d) ?? d),
    might: r.might ?? undefined,
    intellect: r.intellect ?? undefined,
    leadership: r.leadership ?? undefined,
    initiative: r.initiative ?? undefined,
    statLevel: r.stat_level,
    signatureTacticName: r.signature_tactic_id
      ? tacticName.get(r.signature_tactic_id)
      : undefined,
    note: r.note ?? undefined,
    imageUrl: assetImageUrl('GENERAL', r.name) ?? '',
  }))
}

export function patchGeneral(id: string, patch: Partial<General>): Promise<General> {
  return request<General>(`/generals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// --- 전법 ---

interface TacticRow {
  id: string
  name: string
  category: string | null
  ability_type: string | null
  quality: string | null
  trigger_rate: number | null
  target_count: number | null
  effect_text: string | null
  role_tags: string[] | null
  source: string | null
  season: number | null
  rarity: string | null
}

export async function listTactics(): Promise<Tactic[]> {
  const rows = unwrap(
    await supabase
      .from('tactic')
      .select('id, name, category, ability_type, quality, trigger_rate, target_count, effect_text, role_tags, source, season, rarity')
      .order('name'),
  ) as TacticRow[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category ?? undefined,
    categoryLabel: label(TACTIC_CATEGORY_LABEL, r.category),
    abilityType: r.ability_type ?? undefined,
    abilityTypeLabel: label(ABILITY_TYPE_LABEL, r.ability_type),
    quality: r.quality ?? undefined,
    qualityLabel: label(TACTIC_QUALITY_LABEL, r.quality),
    triggerRate: r.trigger_rate ?? undefined,
    targetCount: r.target_count ?? undefined,
    effectText: r.effect_text ?? undefined,
    roleTags: r.role_tags ?? [],
    source: r.source ?? undefined,
    rarity: (r.rarity as "LEGEND" | "HERO" | null) ?? undefined,
    season: r.season ?? undefined,
    dataComplete: isTacticDataComplete(r.category, r.trigger_rate),
    imageUrl: assetImageUrl('TACTIC', r.name) ?? '',
  }))
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
