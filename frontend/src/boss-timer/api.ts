import { supabase } from '../lib/supabase'

/**
 * 보스 타이머 방(room)은 로그인과 무관하다. 쓰기는 전부 DB 의 SECURITY DEFINER
 * 함수(boss_timer_*, V28 마이그레이션)를 통해서만 되고, 비밀번호는 그 함수 안에서 확인한다.
 * 여기서는 그 함수를 부르기만 한다.
 */

export interface BossTimerRow {
  boss_id: string
  seq_label: string
  name: string
  sort_order: number
  is_active: boolean
  next_spawn_at: string
  respawn_interval_min: number
}

export interface BossTimerRoomView {
  notice: string
  bosses: BossTimerRow[]
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export async function roomExists(slug: string): Promise<boolean> {
  return unwrap(await supabase.rpc('boss_timer_room_exists', { p_slug: slug }))
}

export async function createRoom(slug: string, password: string, pollToken: string): Promise<void> {
  unwrap(
    await supabase.rpc('boss_timer_room_create', {
      p_slug: slug,
      p_password: password,
      p_poll_token: pollToken,
    }),
  )
}

export async function verifyPassword(slug: string, password: string): Promise<boolean> {
  return unwrap(await supabase.rpc('boss_timer_room_verify', { p_slug: slug, p_password: password }))
}

export async function loadRoom(slug: string): Promise<BossTimerRoomView> {
  const rows = unwrap<
    { notice: string; boss_id: string | null; seq_label: string; name: string; sort_order: number
      is_active: boolean; next_spawn_at: string; respawn_interval_min: number }[]
  >(await supabase.rpc('boss_timer_room_view', { p_slug: slug }))

  const notice = rows[0]?.notice ?? ''
  const bosses = rows
    .filter((r) => r.boss_id !== null)
    .map((r) => ({
      boss_id: r.boss_id as string,
      seq_label: r.seq_label,
      name: r.name,
      sort_order: r.sort_order,
      is_active: r.is_active,
      next_spawn_at: r.next_spawn_at,
      respawn_interval_min: r.respawn_interval_min,
    }))
  return { notice, bosses }
}

export async function setPassword(slug: string, oldPassword: string, newPassword: string): Promise<boolean> {
  return unwrap(
    await supabase.rpc('boss_timer_room_set_password', {
      p_slug: slug,
      p_old_password: oldPassword,
      p_new_password: newPassword,
    }),
  )
}

export async function setNotice(slug: string, password: string, notice: string): Promise<boolean> {
  return unwrap(
    await supabase.rpc('boss_timer_room_set_notice', { p_slug: slug, p_password: password, p_notice: notice }),
  )
}

export async function destroyRoom(slug: string, password: string): Promise<boolean> {
  return unwrap(await supabase.rpc('boss_timer_room_destroy', { p_slug: slug, p_password: password }))
}

export interface BossTimerInput {
  id: string | null
  seqLabel: string
  name: string
  sortOrder: number
  isActive: boolean
  nextSpawnAt: string
  respawnIntervalMin: number
}

export async function upsertBoss(slug: string, password: string, input: BossTimerInput): Promise<string> {
  return unwrap(
    await supabase.rpc('boss_timer_upsert', {
      p_slug: slug,
      p_password: password,
      p_id: input.id,
      p_seq_label: input.seqLabel,
      p_name: input.name,
      p_sort_order: input.sortOrder,
      p_is_active: input.isActive,
      p_next_spawn_at: input.nextSpawnAt,
      p_respawn_interval_min: input.respawnIntervalMin,
    }),
  )
}

export async function shiftBoss(slug: string, password: string, bossId: string, deltaMinutes: number): Promise<void> {
  unwrap(
    await supabase.rpc('boss_timer_shift', {
      p_slug: slug,
      p_password: password,
      p_id: bossId,
      p_delta_minutes: deltaMinutes,
    }),
  )
}

export async function deleteBoss(slug: string, password: string, bossId: string): Promise<void> {
  unwrap(await supabase.rpc('boss_timer_delete', { p_slug: slug, p_password: password, p_id: bossId }))
}
