import { supabase } from '../lib/supabase'

/**
 * 전보(戰報).
 *
 * <p>게임의 «전투 결과» 화면을 그대로 옮겨 담는다. 왜 필요한가는 마이그레이션
 * {@code V27__battle_report.sql} 머리말에 적어 뒀다. 요약하면, 지금 덱 추천은 티어표(남의
 * 판단)와 설명문 계수로 «추정한» 화력에 기대고 있는데, 전보를 쌓으면 그 자리를 실측이
 * 대신한다.
 *
 * <p>읽기·쓰기가 전부 Supabase 로 간다. Render 를 거치지 않으므로 무료 인스턴스가 잠들어도
 * 전보를 올리고 볼 수 있다.
 */

export type Outcome = 'WIN' | 'LOSS' | 'DRAW'
export type Side = 'OUR' | 'ENEMY'

export interface ReportTactic {
  slot: number
  tacticId?: string
  tacticName: string
  /** 화면의 «×12» */
  activations?: number
  /** 붉은 숫자 — 누적 피해 */
  damage?: number
  /** 초록 숫자 — 누적 회복 */
  healing?: number
}

export interface ReportGeneral {
  side: Side
  position: number
  generalId?: string
  generalName: string
  level?: number
  /** «궤멸» 처럼 카드에 덧씌워진 상태 */
  status?: string
  troopsLeft?: number
  troopsMax?: number
  tactics: ReportTactic[]
}

export interface BattleReport {
  id?: string
  outcome: Outcome
  ourFormation?: string
  enemyFormation?: string
  ourCommander?: string
  enemyCommander?: string
  ourAlliance?: string
  enemyAlliance?: string
  ourTroopsLeft?: number
  ourTroopsMax?: number
  ourLoss?: number
  enemyTroopsLeft?: number
  enemyTroopsMax?: number
  enemyLoss?: number
  imagePath?: string
  note?: string
  foughtAt?: string
  createdAt?: string
  generals: ReportGeneral[]
}

const BUCKET = 'battle-report'

function fail(error: unknown): never {
  const message = (error as { message?: string })?.message ?? '전보 처리 실패'
  if (/row-level security|permission denied/i.test(message)) {
    throw new Error('전보를 저장할 권한이 없습니다. 다시 로그인해 주세요.')
  }
  throw new Error(message)
}

/**
 * 원본 사진을 올린다.
 *
 * <p>DB 행이 아니라 Storage 버킷에 넣는다. 사진 한 장이 0.5MB 안팎이라 행에 담으면 목록을
 * 부를 때마다 통째로 따라 나온다. 비공개 버킷이라 링크만으로는 열리지 않는다.
 *
 * <p>이름은 «계정/시각-원래이름» 으로 둔다. 같은 이름의 스크린샷을 여러 장 올려도 덮어쓰지
 * 않고, 누구 것인지도 경로에서 바로 보인다.
 */
export async function uploadImage(file: File): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('로그인이 필요합니다.')

  // 한글 파일명은 Storage 키로 쓰면 다루기 번거롭다. 확장자만 살리고 시각으로 이름을 짓는다.
  const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'png').toLowerCase()
  const path = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/png',
    upsert: false,
  })
  if (error) fail(error)
  return path
}

/** 비공개 버킷이라 볼 때마다 짧게 사는 주소를 발급받는다. */
export async function imageUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error) return null
  return data.signedUrl
}

/**
 * 전보 한 건을 저장한다.
 *
 * <p>부모(전보) → 장수 → 전법 순으로 넣는다. Supabase 는 다중 테이블 트랜잭션을 열어주지
 * 않으므로, 중간에 실패하면 부모를 지워 반쪽짜리 전보가 남지 않게 한다.
 */
export async function saveReport(report: BattleReport): Promise<string> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('로그인이 필요합니다.')

  const { data: created, error } = await supabase
    .from('battle_report')
    .insert({
      user_id: userId,
      outcome: report.outcome,
      our_formation: report.ourFormation || null,
      enemy_formation: report.enemyFormation || null,
      our_commander: report.ourCommander || null,
      enemy_commander: report.enemyCommander || null,
      our_alliance: report.ourAlliance || null,
      enemy_alliance: report.enemyAlliance || null,
      our_troops_left: report.ourTroopsLeft ?? null,
      our_troops_max: report.ourTroopsMax ?? null,
      our_loss: report.ourLoss ?? null,
      enemy_troops_left: report.enemyTroopsLeft ?? null,
      enemy_troops_max: report.enemyTroopsMax ?? null,
      enemy_loss: report.enemyLoss ?? null,
      image_path: report.imagePath || null,
      note: report.note || null,
      fought_at: report.foughtAt || null,
    })
    .select('id')
    .single()
  if (error) fail(error)

  const reportId = created!.id as string

  try {
    const rows = report.generals
      .filter((g) => g.generalName.trim() !== '')
      .map((g) => ({
        report_id: reportId,
        side: g.side,
        position: g.position,
        general_id: g.generalId ?? null,
        general_name: g.generalName.trim(),
        level: g.level ?? null,
        status: g.status || null,
        troops_left: g.troopsLeft ?? null,
        troops_max: g.troopsMax ?? null,
      }))
    if (rows.length === 0) throw new Error('장수가 한 명도 없습니다.')

    const { data: savedGenerals, error: gError } = await supabase
      .from('battle_report_general')
      .insert(rows)
      .select('id, side, position')
    if (gError) fail(gError)

    const idBySlot = new Map(
      (savedGenerals ?? []).map((r) => [`${r.side}:${r.position}`, r.id as string]),
    )
    const tacticRows = report.generals.flatMap((g) => {
      const parentId = idBySlot.get(`${g.side}:${g.position}`)
      if (!parentId) return []
      return g.tactics
        .filter((t) => t.tacticName.trim() !== '')
        .map((t) => ({
          report_general_id: parentId,
          slot: t.slot,
          tactic_id: t.tacticId ?? null,
          tactic_name: t.tacticName.trim(),
          activations: t.activations ?? null,
          damage: t.damage ?? null,
          healing: t.healing ?? null,
        }))
    })
    if (tacticRows.length > 0) {
      const { error: tError } = await supabase.from('battle_report_tactic').insert(tacticRows)
      if (tError) fail(tError)
    }
  } catch (e) {
    // 반쪽짜리 전보를 남기지 않는다. 자식은 on delete cascade 로 함께 지워진다.
    await supabase.from('battle_report').delete().eq('id', reportId)
    throw e
  }

  return reportId
}

export async function listReports(limit = 50): Promise<BattleReport[]> {
  const { data, error } = await supabase
    .from('battle_report')
    .select(
      `id, outcome, our_formation, enemy_formation, our_commander, enemy_commander,
       our_alliance, enemy_alliance, our_troops_left, our_troops_max, our_loss,
       enemy_troops_left, enemy_troops_max, enemy_loss, image_path, note, fought_at, created_at,
       battle_report_general (
         id, side, position, general_id, general_name, level, status, troops_left, troops_max,
         battle_report_tactic ( slot, tactic_id, tactic_name, activations, damage, healing )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail(error)

  return (data ?? []).map((r) => ({
    id: r.id,
    outcome: r.outcome as Outcome,
    ourFormation: r.our_formation ?? undefined,
    enemyFormation: r.enemy_formation ?? undefined,
    ourCommander: r.our_commander ?? undefined,
    enemyCommander: r.enemy_commander ?? undefined,
    ourAlliance: r.our_alliance ?? undefined,
    enemyAlliance: r.enemy_alliance ?? undefined,
    ourTroopsLeft: r.our_troops_left ?? undefined,
    ourTroopsMax: r.our_troops_max ?? undefined,
    ourLoss: r.our_loss ?? undefined,
    enemyTroopsLeft: r.enemy_troops_left ?? undefined,
    enemyTroopsMax: r.enemy_troops_max ?? undefined,
    enemyLoss: r.enemy_loss ?? undefined,
    imagePath: r.image_path ?? undefined,
    note: r.note ?? undefined,
    foughtAt: r.fought_at ?? undefined,
    createdAt: r.created_at,
    generals: (r.battle_report_general ?? [])
      .sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position)
      .map((g) => ({
        side: g.side as Side,
        position: g.position,
        generalId: g.general_id ?? undefined,
        generalName: g.general_name,
        level: g.level ?? undefined,
        status: g.status ?? undefined,
        troopsLeft: g.troops_left ?? undefined,
        troopsMax: g.troops_max ?? undefined,
        tactics: (g.battle_report_tactic ?? [])
          .sort((a, b) => a.slot - b.slot)
          .map((t) => ({
            slot: t.slot,
            tacticId: t.tactic_id ?? undefined,
            tacticName: t.tactic_name,
            activations: t.activations ?? undefined,
            damage: t.damage ?? undefined,
            healing: t.healing ?? undefined,
          })),
      })),
  }))
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('battle_report').delete().eq('id', id)
  if (error) fail(error)
}

// ---------------------------------------------------------------
// 집계
// ---------------------------------------------------------------

export interface GeneralRecord {
  generalId?: string
  generalName: string
  battles: number
  wins: number
}

export interface TacticRecord {
  tacticId?: string
  tacticName: string
  uses: number
  avgActivations: number
  avgDamage: number
}

/**
 * 장수별 전적.
 *
 * <p>⚠️ battles 를 반드시 함께 읽어야 한다. 두 판 이겨서 «승률 100%» 인 장수를 승률만 보고
 * 최고라고 말하면 안 된다. 표본이 얼마나 되는지가 승률만큼 중요하다.
 */
export async function generalRecords(): Promise<GeneralRecord[]> {
  const { data, error } = await supabase
    .from('battle_general_record')
    .select('general_id, general_name, side, battles, wins')
    .eq('side', 'OUR')
  if (error) fail(error)
  return (data ?? []).map((r) => ({
    generalId: r.general_id ?? undefined,
    generalName: r.general_name,
    battles: Number(r.battles),
    wins: Number(r.wins),
  }))
}

export async function tacticRecords(): Promise<TacticRecord[]> {
  const { data, error } = await supabase
    .from('battle_tactic_record')
    .select('tactic_id, tactic_name, uses, avg_activations, avg_damage')
  if (error) fail(error)
  return (data ?? []).map((r) => ({
    tacticId: r.tactic_id ?? undefined,
    tacticName: r.tactic_name,
    uses: Number(r.uses),
    avgActivations: Number(r.avg_activations ?? 0),
    avgDamage: Number(r.avg_damage ?? 0),
  }))
}
