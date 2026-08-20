import { API_BASE } from './client'
import { emailToLoginId, friendlyError, loginIdToEmail, supabase } from '../lib/supabase'

/**
 * 인사팀 API.
 *
 * <p>예전에는 전부 Render 의 Spring 을 거쳤다. 지금은 로그인·명부·마커처럼
 * «사람이 기다리는» 것은 Supabase 로 직접 간다. Render 무료 인스턴스는 유휴 15분 뒤
 * 잠들어 깨는 데 수십 초가 걸리는데, 그 사이 화면이 고장난 것처럼 보이기 때문이다.
 *
 * <p>Render 에 남는 것은 계산과 파싱뿐이다. 덱 추천 시뮬레이션, 시트 동기화,
 * xlsx 업로드. 이것들은 버튼을 눌러서 하는 일이라 기다림을 납득할 수 있다.
 *
 * <p>권한 판단은 여기서 하지 않는다. DB 의 RLS 정책이 유일한 권위다.
 * 이 파일의 역할 검사는 화면을 정리하는 용도일 뿐, 우회해도 데이터는 나오지 않는다.
 */

// ---------------------------------------------------------------
// 타입
// ---------------------------------------------------------------

export type MarkerCode = 'CAUTION' | 'GILJAK' | 'ACTIVE'

export interface MarkerMeta {
  code: MarkerCode
  label: string
  color: string
  /** 켤 때 사유가 필요한 마커인지. */
  requiresReason: boolean
}

export interface MemberRow {
  cid: string
  memberName: string
  job?: string
  teamGroup?: string
  position?: string
  prosperity?: number
  weeklyMerit?: number
  weeklyContribution?: number
  garrison?: string
  weeklySiegeCount?: number
  markers: MarkerCode[]
  openCautionCount: number
  latestCaution?: string
}

export interface DirectorySnapshot {
  allianceId: string
  server: string
  allianceName: string
  snapshotDate?: string
  availableDates: string[]
  rows: MemberRow[]
}

export interface ImportResult {
  allianceId: string
  server: string
  allianceName: string
  snapshotDate: string
  imported: number
  replaced: number
  skipped: number
  errors: string[]
}

export interface NoteView {
  id: string
  reason: string
  createdBy?: string
  resolved: boolean
  createdAt: string
  resolvedAt?: string
}

export interface CautionEntry {
  cid: string
  memberName: string
  markerEnabled: boolean
  openCount: number
  notes: NoteView[]
}

/** 로그인 결과. 세션 토큰은 supabase-js 가 들고 있으므로 여기 담지 않는다. */
export interface LoginResult {
  userId: string
  loginId: string
  displayName: string
  role: Role
  allianceId?: string
  server?: string
  allianceName?: string
  cid?: string
  /** 기존 동맹에 합류했을 때처럼 사용자에게 알려줄 말이 있으면 담는다. */
  note?: string
}

/** 관리자 / 간부진 / 동맹원 */
export type Role = 'ADMIN' | 'OFFICER' | 'MEMBER'

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: '관리자',
  OFFICER: '간부진',
  MEMBER: '동맹원',
}

/** 화면 안에서 기능을 가릴 때 쓰는 판정. DB 정책과 같은 규칙이다. */
export const can = {
  manageSystem: (r?: Role) => r === 'ADMIN',
  manageHr: (r?: Role) => r === 'ADMIN' || r === 'OFFICER',
  simulate: (r?: Role) => r != null,
}

export interface MenuItem {
  code: string
  label: string
  route: string
  icon?: string
  allowedRoles: Role[]
  visible: boolean
  position: number
}

export interface AccountSummary {
  id: string
  loginId: string
  displayName: string
  role: Role
  cid?: string
  active: boolean
  lastLoginAt?: string
  alliance?: string
}

/**
 * 마커 메타.
 *
 * <p>예전에는 색을 프론트에 박지 않으려고 백엔드 enum 에서 내려받았다.
 * 이제 이 값을 쓰는 화면이 Render 없이 떠야 하므로 여기 둔다.
 * 색과 이름은 순수한 표시 정보라 서버가 알 필요가 없다.
 * (사유 필수 규칙은 화면이 아니라 DB 의 app_toggle_marker() 가 강제한다)
 */
export const MARKER_META: MarkerMeta[] = [
  { code: 'CAUTION', label: '주의', color: '#f59e0b', requiresReason: true },
  { code: 'GILJAK', label: '길작러', color: '#22c55e', requiresReason: false },
  { code: 'ACTIVE', label: '액티브', color: '#3b82f6', requiresReason: false },
]

export function markerMeta(): Promise<MarkerMeta[]> {
  return Promise.resolve(MARKER_META)
}

// ---------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------

/** supabase-js 는 오류를 던지지 않고 결과에 담아준다. 한 곳에서 예외로 바꾼다. */
function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(friendlyError(res.error))
  return res.data as T
}

interface AllianceRef {
  server: string
  name: string
}

interface ProfileRow {
  user_id: string
  alliance_id?: string | null
  role: Role
  login_id: string
  display_name: string
  cid: string | null
  active: boolean
  /**
   * 조인해 온 동맹.
   *
   * PostgREST 는 관계를 하나로 볼지 여럿으로 볼지에 따라 객체 또는 배열을 준다.
   * 어느 쪽이 오든 첫 번째를 쓴다.
   */
  alliance?: AllianceRef | AllianceRef[] | null
}

function oneAlliance(a: ProfileRow['alliance']): AllianceRef | undefined {
  if (!a) return undefined
  return Array.isArray(a) ? a[0] : a
}

/** 로그인한 사람의 프로필 + 동맹. RLS 가 본인 것만 돌려준다. */
async function loadProfile(userId: string): Promise<LoginResult> {
  const row = unwrap(
    await supabase
      .from('app_profile')
      .select('user_id, alliance_id, role, login_id, display_name, cid, active, alliance(server, name)')
      .eq('user_id', userId)
      .maybeSingle(),
  ) as unknown as ProfileRow | null

  if (!row) {
    // Supabase 계정은 있는데 프로필이 없다. 회원가입이 중간에 끊긴 경우다.
    throw new Error('가입이 완료되지 않은 계정입니다. 동맹 정보를 다시 입력해 주세요.')
  }
  if (!row.active) {
    throw new Error('사용이 중지된 계정입니다. 관리자에게 문의하세요.')
  }

  return {
    userId: row.user_id,
    loginId: row.login_id,
    displayName: row.display_name,
    role: row.role,
    allianceId: row.alliance_id ?? undefined,
    server: oneAlliance(row.alliance)?.server,
    allianceName: oneAlliance(row.alliance)?.name,
    cid: row.cid ?? undefined,
  }
}

// ---------------------------------------------------------------
// 인증
// ---------------------------------------------------------------

/**
 * 회원가입.
 *
 * <p>두 단계다. Supabase 에 계정을 만들고, 그 다음 app_register() 로 동맹과 역할을 정한다.
 * 역할을 프론트가 정하지 않는 것이 핵심이다. 인자로 넘길 수 있으면 누구나 관리자를 자칭한다.
 *
 * <p>동맹을 «새로 만든» 사람만 간부진이 된다. 이미 있는 동맹에 합류하면 동맹원이고,
 * 인사 권한은 관리자가 따로 준다. 그렇게 하지 않으면 명부가 이미 올라간 동맹에
 * 남이 먼저 가입해 인사 데이터를 통째로 가져갈 수 있다.
 */
export async function register(body: {
  loginId: string
  password: string
  displayName: string
  server: string
  allianceName: string
  cid?: string
}): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signUp({
    email: loginIdToEmail(body.loginId),
    password: body.password,
  })
  if (error) throw new Error(friendlyError(error))
  if (!data.session) {
    // 메일 확인이 켜져 있으면 세션 없이 돌아온다. 합성 주소라 메일을 받을 수 없다.
    throw new Error(
      '계정은 만들어졌지만 로그인되지 않았습니다. ' +
        'Supabase 설정에서 «Confirm email» 을 끈 뒤 로그인해 주세요.',
    )
  }

  const result = unwrap(
    await supabase.rpc('app_register', {
      p_server: body.server,
      p_alliance_name: body.allianceName,
      p_display_name: body.displayName,
      p_cid: body.cid ?? null,
    }),
  ) as { role: Role; allianceId: string; allianceCreated: boolean; note?: string }

  const profile = await loadProfile(data.session.user.id)
  return { ...profile, note: result.note ?? undefined }
}

export async function login(loginId: string, password: string): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginIdToEmail(loginId),
    password,
  })
  if (error) throw new Error(friendlyError(error))
  return loadProfile(data.user.id)
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * 저장된 세션을 복원한다. 없으면 null.
 *
 * <p>App 이 뜰 때 한 번 부른다. Render 를 기다리지 않으므로 화면이 즉시 뜬다.
 */
export async function restoreSession(): Promise<LoginResult | null> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  try {
    return await loadProfile(data.session.user.id)
  } catch {
    // 프로필이 사라졌거나 중지된 계정이면 세션을 버린다.
    await supabase.auth.signOut()
    return null
  }
}

export async function me(): Promise<LoginResult> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('로그인이 필요합니다.')
  return loadProfile(data.user.id)
}

/** 본인 비밀번호 변경. Supabase 가 처리하므로 현재 비밀번호를 다시 확인한다. */
export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email
  if (!email) throw new Error('로그인이 필요합니다.')

  // Supabase 의 updateUser 는 현재 비밀번호를 묻지 않는다.
  // 탭을 열어둔 채 자리를 비웠을 때 남이 비밀번호를 바꾸는 것을 막기 위해 직접 확인한다.
  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (check.error) throw new Error('현재 비밀번호가 올바르지 않습니다.')

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(friendlyError(error))
  return { status: 'changed', note: '비밀번호가 변경되었습니다.' }
}

// ---------------------------------------------------------------
// 메뉴
// ---------------------------------------------------------------

interface MenuRow {
  code: string
  label: string
  route: string
  icon: string | null
  allowed_roles: Role[]
  visible: boolean
  position: number
}

function toMenu(r: MenuRow): MenuItem {
  return {
    code: r.code,
    label: r.label,
    route: r.route,
    icon: r.icon ?? undefined,
    allowedRoles: r.allowed_roles,
    visible: r.visible,
    position: r.position,
  }
}

/** 지금 역할로 볼 수 있는 메뉴. */
export async function listMenus(): Promise<MenuItem[]> {
  const rows = unwrap(
    await supabase
      .from('menu_item')
      .select('code, label, route, icon, allowed_roles, visible, position')
      .eq('visible', true)
      .order('position'),
  ) as MenuRow[]

  const { data } = await supabase.auth.getUser()
  if (!data.user) return []
  const profile = await loadProfile(data.user.id)
  return rows.filter((r) => r.allowed_roles.includes(profile.role)).map(toMenu)
}

/** 관리자 화면용. 숨긴 것까지 전부. */
export async function listAllMenus(): Promise<MenuItem[]> {
  const rows = unwrap(
    await supabase
      .from('menu_item')
      .select('code, label, route, icon, allowed_roles, visible, position')
      .order('position'),
  ) as MenuRow[]
  return rows.map(toMenu)
}

export async function patchMenu(
  code: string,
  patch: { visible?: boolean; allowedRoles?: Role[]; label?: string },
): Promise<MenuItem> {
  const update: Record<string, unknown> = {}
  if (patch.visible !== undefined) update.visible = patch.visible
  if (patch.allowedRoles !== undefined) update.allowed_roles = patch.allowedRoles
  if (patch.label !== undefined) update.label = patch.label

  const rows = unwrap(
    await supabase
      .from('menu_item')
      .update(update)
      .eq('code', code)
      .select('code, label, route, icon, allowed_roles, visible, position'),
  ) as MenuRow[]

  // RLS 는 권한이 없으면 오류 대신 «0건 수정» 으로 조용히 지나간다.
  // 그대로 두면 화면에는 바뀐 것처럼 보이고 실제로는 안 바뀐다.
  if (!rows.length) throw new Error('메뉴를 바꿀 권한이 없습니다. 관리자만 가능합니다.')
  return toMenu(rows[0])
}

// ---------------------------------------------------------------
// 계정 관리 (관리자)
// ---------------------------------------------------------------

export async function listAccounts(): Promise<AccountSummary[]> {
  const rows = unwrap(
    await supabase
      .from('app_profile')
      .select('user_id, login_id, display_name, role, cid, active, alliance(server, name)')
      .order('role')
      .order('login_id'),
  ) as unknown as ProfileRow[]

  return rows.map((r) => {
    const a = oneAlliance(r.alliance)
    return {
      id: r.user_id,
      loginId: r.login_id,
      displayName: r.display_name,
      role: r.role,
      cid: r.cid ?? undefined,
      active: r.active,
      alliance: a ? `${a.server} · ${a.name}` : undefined,
    }
  })
}

export async function changeAccountRole(userId: string, role: Role) {
  return unwrap(
    await supabase.rpc('app_set_role', { p_user_id: userId, p_role: role }),
  ) as { role: Role; note: string }
}

/**
 * 계정 사용 중지·재개.
 *
 * <p>지우지 않고 막는다. 지우면 그 사람이 남긴 주의 기록의 작성자를 알 수 없게 된다.
 * (완전 삭제는 Supabase 의 관리자 키가 필요해 브라우저에서 할 수 없다)
 */
export async function setAccountActive(userId: string, active: boolean) {
  return unwrap(
    await supabase.rpc('app_set_active', { p_user_id: userId, p_active: active }),
  ) as { active: boolean }
}

// ---------------------------------------------------------------
// 동맹원 그리드
// ---------------------------------------------------------------

interface WeekRow {
  cid: string
  member_name: string
  job: string | null
  team_group: string | null
  position: string | null
  prosperity: number | null
  weekly_merit: number | null
  weekly_contribution: number | null
  garrison: string | null
  weekly_siege_count: number | null
}

/**
 * 그리드 조회.
 *
 * <p>명부·마커·주의를 각각 읽어 화면에서 합친다. 예전에는 Spring 이 합쳐 내려줬지만
 * 세 테이블 모두 RLS 로 같은 동맹만 걸러지므로 결과는 같다.
 * 한 동맹이 200명 남짓이라 세 번 읽는 비용이 문제되지 않는다.
 *
 * <p>server/alliance 인자는 화면이 들고 있는 값이지만 «권위 값이 아니다».
 * 실제로 무엇이 보이는지는 로그인한 사람의 프로필이 정한다.
 */
export async function loadGrid(
  server: string,
  alliance: string,
  snapshotDate?: string,
): Promise<DirectorySnapshot> {
  const all = unwrap(
    await supabase.from('alliance').select('id, server, name'),
  ) as { id: string; server: string; name: string }[]

  const target =
    all.find((a) => a.server === server && a.name === alliance) ?? all[0]
  if (!target) {
    throw new Error('볼 수 있는 동맹이 없습니다. 관리자에게 인사 권한을 요청하세요.')
  }

  const dates = await availableDates(target.id)
  const date = snapshotDate ?? dates[0]
  if (!date) {
    return {
      allianceId: target.id,
      server: target.server,
      allianceName: target.name,
      availableDates: [],
      rows: [],
    }
  }

  const [weeks, markers, notes] = await Promise.all([
    supabase
      .from('member_week')
      .select('cid, member_name, job, team_group, position, prosperity, weekly_merit, weekly_contribution, garrison, weekly_siege_count')
      .eq('alliance_id', target.id)
      .eq('snapshot_date', date)
      .order('member_name'),
    supabase
      .from('member_marker')
      .select('cid, marker_type')
      .eq('alliance_id', target.id)
      .eq('enabled', true),
    supabase
      .from('caution_note')
      .select('cid, reason, created_at, resolved')
      .eq('alliance_id', target.id)
      .eq('resolved', false)
      .order('created_at', { ascending: false }),
  ])

  const weekRows = unwrap(weeks) as WeekRow[]
  const markerRows = unwrap(markers) as { cid: string; marker_type: MarkerCode }[]
  const noteRows = unwrap(notes) as { cid: string; reason: string }[]

  const byMarker = new Map<string, MarkerCode[]>()
  for (const m of markerRows) {
    const list = byMarker.get(m.cid) ?? []
    list.push(m.marker_type)
    byMarker.set(m.cid, list)
  }

  const byNote = new Map<string, { count: number; latest: string }>()
  for (const n of noteRows) {
    const cur = byNote.get(n.cid)
    // 정렬이 최신순이라 처음 만난 것이 가장 최근이다.
    if (cur) cur.count += 1
    else byNote.set(n.cid, { count: 1, latest: n.reason })
  }

  return {
    allianceId: target.id,
    server: target.server,
    allianceName: target.name,
    snapshotDate: date,
    availableDates: dates,
    rows: weekRows.map((w) => ({
      cid: w.cid,
      memberName: w.member_name,
      job: w.job ?? undefined,
      teamGroup: w.team_group ?? undefined,
      position: w.position ?? undefined,
      prosperity: w.prosperity ?? undefined,
      weeklyMerit: w.weekly_merit ?? undefined,
      weeklyContribution: w.weekly_contribution ?? undefined,
      garrison: w.garrison ?? undefined,
      weeklySiegeCount: w.weekly_siege_count ?? undefined,
      markers: byMarker.get(w.cid) ?? [],
      openCautionCount: byNote.get(w.cid)?.count ?? 0,
      latestCaution: byNote.get(w.cid)?.latest,
    })),
  }
}

/** 적재된 주차 목록(최신순). */
async function availableDates(allianceId: string): Promise<string[]> {
  const rows = unwrap(
    await supabase
      .from('member_week')
      .select('snapshot_date')
      .eq('alliance_id', allianceId)
      .order('snapshot_date', { ascending: false }),
  ) as { snapshot_date: string }[]

  return [...new Set(rows.map((r) => r.snapshot_date))]
}

// ---------------------------------------------------------------
// 마커 · 주의
// ---------------------------------------------------------------

/**
 * 마커 토글.
 *
 * <p>테이블에 직접 쓰지 않고 RPC 를 부른다. «주의를 켤 때는 사유가 있어야 한다» 는
 * 규칙이 마커와 주의 두 테이블에 걸쳐 있어 RLS 정책만으로는 강제할 수 없기 때문이다.
 * 그래서 member_marker 에는 아예 쓰기를 열지 않았다.
 */
export async function toggleMarker(body: {
  allianceId: string
  cid: string
  markerType: MarkerCode
  enabled: boolean
  reason?: string
}) {
  return unwrap(
    await supabase.rpc('app_toggle_marker', {
      p_alliance_id: body.allianceId,
      p_cid: body.cid,
      p_marker_type: body.markerType,
      p_enabled: body.enabled,
      p_reason: body.reason ?? null,
    }),
  )
}

export async function listCautions(
  allianceId: string,
  q?: string,
  onlyOpen = false,
): Promise<CautionEntry[]> {
  let query = supabase
    .from('caution_note')
    .select('id, cid, reason, created_by, resolved, created_at, resolved_at')
    .eq('alliance_id', allianceId)
    .order('created_at', { ascending: false })

  if (onlyOpen) query = query.eq('resolved', false)

  const notes = unwrap(await query) as {
    id: string; cid: string; reason: string; created_by: string | null
    resolved: boolean; created_at: string; resolved_at: string | null
  }[]

  // 이름은 명부에서 가져온다. 주의는 cid 에만 붙어 있어 이름을 모른다.
  const names = new Map<string, string>()
  const markers = new Set<string>()
  if (notes.length) {
    const cids = [...new Set(notes.map((n) => n.cid))]
    const [weeks, marks] = await Promise.all([
      supabase.from('member_week').select('cid, member_name').eq('alliance_id', allianceId).in('cid', cids),
      supabase.from('member_marker').select('cid').eq('alliance_id', allianceId)
        .eq('marker_type', 'CAUTION').eq('enabled', true).in('cid', cids),
    ])
    for (const w of (unwrap(weeks) as { cid: string; member_name: string }[])) {
      names.set(w.cid, w.member_name)
    }
    for (const m of (unwrap(marks) as { cid: string }[])) markers.add(m.cid)
  }

  const grouped = new Map<string, CautionEntry>()
  for (const n of notes) {
    const memberName = names.get(n.cid) ?? '(명부에 없음)'
    if (q) {
      const needle = q.toLowerCase()
      if (!n.cid.includes(needle) && !memberName.toLowerCase().includes(needle)) continue
    }
    let entry = grouped.get(n.cid)
    if (!entry) {
      entry = {
        cid: n.cid,
        memberName,
        markerEnabled: markers.has(n.cid),
        openCount: 0,
        notes: [],
      }
      grouped.set(n.cid, entry)
    }
    if (!n.resolved) entry.openCount += 1
    entry.notes.push({
      id: n.id,
      reason: n.reason,
      createdBy: n.created_by ?? undefined,
      resolved: n.resolved,
      createdAt: n.created_at,
      resolvedAt: n.resolved_at ?? undefined,
    })
  }
  return [...grouped.values()]
}

export async function addCaution(allianceId: string, cid: string, reason: string): Promise<NoteView> {
  // created_by 는 넘기지 않는다. DB 트리거가 로그인한 사람으로 채운다.
  const rows = unwrap(
    await supabase
      .from('caution_note')
      .insert({ alliance_id: allianceId, cid, reason })
      .select('id, reason, created_by, resolved, created_at, resolved_at'),
  ) as { id: string; reason: string; created_by: string | null; resolved: boolean; created_at: string; resolved_at: string | null }[]

  const r = rows[0]
  return {
    id: r.id,
    reason: r.reason,
    createdBy: r.created_by ?? undefined,
    resolved: r.resolved,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined,
  }
}

/** 기록을 남긴 채 상태만 «해제»로 바꾼다. */
export async function resolveCaution(noteId: string) {
  const rows = unwrap(
    await supabase.from('caution_note').update({ resolved: true }).eq('id', noteId).select('id'),
  ) as { id: string }[]
  if (!rows.length) throw new Error('해제할 권한이 없습니다.')
  return { status: 'resolved' }
}

/** 사유를 완전히 삭제한다. 되돌릴 수 없다. */
export async function deleteCaution(noteId: string) {
  const rows = unwrap(
    await supabase.from('caution_note').delete().eq('id', noteId).select('id'),
  ) as { id: string }[]
  if (!rows.length) throw new Error('삭제할 권한이 없습니다.')
  return { status: 'deleted' }
}

// ---------------------------------------------------------------
// 시트 업로드 — 여기만 Render 를 쓴다
// ---------------------------------------------------------------

/**
 * MemberWeek&lt;YYYYMMDD&gt;.xlsx 업로드.
 *
 * <p>xlsx 파싱에 Apache POI 가 필요해 Render 에 남아 있다.
 * 잠들어 있으면 첫 요청이 수십 초 걸리므로, 화면에서 그 점을 알려야 한다.
 *
 * <p>인증은 Supabase 액세스 토큰을 그대로 보낸다. Render 쪽이 이 토큰을 검증한다.
 */
export async function importSheet(
  server: string,
  alliance: string,
  file: File,
  snapshotDate?: string,
): Promise<ImportResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요합니다.')

  const form = new FormData()
  form.append('file', file)
  const params = new URLSearchParams({ server, alliance })
  if (snapshotDate) params.set('snapshotDate', snapshotDate)

  const res = await fetch(`${API_BASE}/hr/members/import?${params}`, {
    method: 'POST',
    // Content-Type 은 붙이지 않는다. multipart 경계는 브라우저가 정해야 한다.
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const problem = await res.json().catch(() => null)
    throw new Error(problem?.detail ?? `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ImportResult
}

export { emailToLoginId }
