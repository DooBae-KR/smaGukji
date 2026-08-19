import { API_BASE, request } from './client'

// ---------------------------------------------------------------
// 타입
// ---------------------------------------------------------------

export type MarkerCode = 'CAUTION' | 'GILJAK' | 'ACTIVE'

export interface MarkerMeta {
  code: MarkerCode
  label: string
  color: string
  /** 켤 때 사유가 필요한 마커인지. 백엔드가 boolean 으로 내려준다. */
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
  /** 이번에 적재한 행 수 */
  imported: number
  /** 같은 주차에 있던 기존 행 중 교체된 수 */
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

export interface LoginResult {
  token: string
  expiresAt: string
  displayName: string
  role: Role
  allianceId?: string
  server?: string
  allianceName?: string
  cid?: string
}

/** 관리자 / 간부진 / 동맹원 */
export type Role = 'ADMIN' | 'OFFICER' | 'MEMBER'

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: '관리자',
  OFFICER: '간부진',
  MEMBER: '동맹원',
}

/** 메뉴 권한과 별개로, 화면 안에서 기능을 가릴 때 쓰는 판정. 백엔드와 같은 규칙이다. */
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
  /** 관리자는 전체 동맹 계정을 보므로 어느 동맹인지 함께 표시한다. */
  alliance?: string
}

// ---------------------------------------------------------------
// 세션
// ---------------------------------------------------------------

const TOKEN_KEY = 'smagukji.hr.token'

export function saveToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function loadToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

/** 세션 토큰을 헤더로 붙인다. 토큰은 sessionStorage 에만 두고 URL 에 싣지 않는다. */
function authed(init?: RequestInit): RequestInit {
  const token = loadToken()
  return {
    ...init,
    headers: { ...init?.headers, ...(token ? { 'X-Session-Token': token } : {}) },
  }
}

function scope(server: string, alliance: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ server, alliance, ...extra })
  return params.toString()
}

// ---------------------------------------------------------------
// 인증
// ---------------------------------------------------------------

/** 회원가입. 동맹 정보를 함께 넣으면 그 동맹이 만들어지고 첫 가입자는 간부진이 된다. */
export function register(body: {
  loginId: string
  password: string
  displayName: string
  server: string
  allianceName: string
  cid?: string
}): Promise<LoginResult> {
  return request('/hr/auth/register', { method: 'POST', body: JSON.stringify(body) })
}

export function login(loginId: string, password: string): Promise<LoginResult> {
  return request('/hr/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  })
}

export function me(): Promise<{
  accountId: string
  loginId: string
  role: Role
  allianceId?: string
  displayName: string
  cid?: string
}> {
  return request('/hr/auth/me', authed())
}

// ---------------------------------------------------------------
// 메뉴 (관리자가 노출을 제어)
// ---------------------------------------------------------------

/** 현재 세션에서 보여줄 메뉴. 비로그인도 호출 가능하며 공개 메뉴만 나온다. */
export function listMenus(): Promise<MenuItem[]> {
  return request('/menus', authed())
}

export function listAllMenus(): Promise<MenuItem[]> {
  return request('/menus/all', authed())
}

export function patchMenu(
  code: string,
  patch: { visible?: boolean; allowedRoles?: Role[]; label?: string },
): Promise<MenuItem> {
  return request(`/menus/${code}`, authed({ method: 'PATCH', body: JSON.stringify(patch) }))
}

export function changeAccountRole(accountId: string, role: Role) {
  return request<{ status: string; role: Role; note: string }>(
    `/hr/auth/accounts/${accountId}/role`,
    authed({ method: 'PATCH', body: JSON.stringify({ role }) }),
  )
}

// ---------------------------------------------------------------
// 계정 관리 (관리자)
// ---------------------------------------------------------------

export function listAccounts(): Promise<AccountSummary[]> {
  return request('/hr/auth/accounts', authed())
}

export function deleteAccount(accountId: string) {
  return request<{ status: string }>(
    `/hr/auth/accounts/${accountId}`,
    authed({ method: 'DELETE' }),
  )
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ status: string; note: string }>(
    '/hr/auth/password',
    authed({ method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  )
}

export function logout() {
  return request<{ status: string }>('/hr/auth/logout', authed({ method: 'POST' }))
}

export function createAccount(body: {
  loginId: string
  password: string
  displayName: string
  role?: Role
  cid?: string
}) {
  return request<{ accountId: string; loginId: string }>(
    '/hr/auth/accounts',
    authed({ method: 'POST', body: JSON.stringify(body) }),
  )
}

/** 세션 복원용. 저장된 토큰이 아직 유효한지 확인한다. */
export function hasToken(): boolean {
  return loadToken() != null
}

// ---------------------------------------------------------------
// 동맹원
// ---------------------------------------------------------------

export function loadGrid(
  server: string,
  alliance: string,
  snapshotDate?: string,
): Promise<DirectorySnapshot> {
  const extra: Record<string, string> = snapshotDate ? { snapshotDate } : {}
  return request(`/hr/members?${scope(server, alliance, extra)}`, authed())
}

export function markerMeta(): Promise<MarkerMeta[]> {
  return request('/hr/markers/meta')
}

export function toggleMarker(
  server: string,
  alliance: string,
  body: { cid: string; markerType: MarkerCode; enabled: boolean; reason?: string },
) {
  return request(`/hr/markers?${scope(server, alliance)}`, authed({
    method: 'POST',
    body: JSON.stringify(body),
  }))
}

export function listCautions(
  server: string,
  alliance: string,
  q?: string,
  onlyOpen = false,
): Promise<CautionEntry[]> {
  const extra: Record<string, string> = { onlyOpen: String(onlyOpen) }
  if (q) extra.q = q
  return request(`/hr/cautions?${scope(server, alliance, extra)}`, authed())
}

export function addCaution(server: string, alliance: string, cid: string, reason: string) {
  return request<NoteView>(`/hr/cautions?${scope(server, alliance)}`, authed({
    method: 'POST',
    body: JSON.stringify({ cid, reason }),
  }))
}

/** 기록을 남긴 채 상태만 «해제»로 바꾼다. */
export function resolveCaution(server: string, alliance: string, noteId: string) {
  return request<{ status: string }>(
    `/hr/cautions/${noteId}/resolve?${scope(server, alliance)}`,
    authed({ method: 'POST' }),
  )
}

/** 사유를 완전히 삭제한다. 되돌릴 수 없다. */
export function deleteCaution(server: string, alliance: string, noteId: string) {
  return request<{ status: string }>(
    `/hr/cautions/${noteId}?${scope(server, alliance)}`,
    authed({ method: 'DELETE' }),
  )
}

/** 시트 업로드. multipart 이므로 request() 헬퍼를 쓰지 않는다(Content-Type 을 브라우저가 정해야 함). */
export async function importSheet(
  server: string,
  alliance: string,
  file: File,
  snapshotDate?: string,
): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  const extra: Record<string, string> = snapshotDate ? { snapshotDate } : {}
  const token = loadToken()

  const res = await fetch(`${API_BASE}/hr/members/import?${scope(server, alliance, extra)}`, {
    method: 'POST',
    headers: token ? { 'X-Session-Token': token } : {},
    body: form,
  })
  if (!res.ok) {
    const problem = await res.json().catch(() => null)
    throw new Error(problem?.detail ?? `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ImportResult
}
