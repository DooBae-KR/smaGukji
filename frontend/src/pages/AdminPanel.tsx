import { useCallback, useEffect, useState } from 'react'
import * as hr from '../api/hr'
import { ROLE_LABEL } from '../api/hr'
import type { AccountSummary, MenuItem, Role } from '../api/hr'

const ROLES: Role[] = ['ADMIN', 'OFFICER', 'MEMBER']

const ROLE_COLOR: Record<Role, string> = {
  ADMIN: '#c8a24a',
  OFFICER: '#3f7fd0',
  MEMBER: '#3fa15e',
}

/** 관리자 전용 — 메뉴 권한과 계정 권한을 정한다. */
export function AdminPanel({ onMenusChanged }: { onMenusChanged: () => void }) {
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(() => {
    hr.listAllMenus().then(setMenus).catch((e) => setError(e.message))
    hr.listAccounts().then(setAccounts).catch((e) => setError(e.message))
  }, [])

  useEffect(reload, [reload])

  const patch = async (code: string, p: { visible?: boolean; allowedRoles?: Role[] }) => {
    setBusy(code)
    setError(null)
    try {
      await hr.patchMenu(code, p)
      reload()
      onMenusChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const toggleRole = (m: MenuItem, role: Role) => {
    const has = m.allowedRoles.includes(role)
    const next = has ? m.allowedRoles.filter((r) => r !== role) : [...m.allowedRoles, role]
    patch(m.code, { allowedRoles: next })
  }

  const setAccountRole = async (a: AccountSummary, role: Role) => {
    setBusy(a.id)
    setError(null)
    try {
      const r = await hr.changeAccountRole(a.id, role)
      setNotice(`${a.loginId} → ${ROLE_LABEL[role]}. ${r.note}`)
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const removeAccount = async (a: AccountSummary) => {
    if (!window.confirm(`계정 "${a.loginId}" 를 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      await hr.deleteAccount(a.id)
      setNotice(`${a.loginId} 삭제됨`)
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="panel">
      <h2>관리자</h2>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="notice">
        <strong>권한 구분</strong>
        <br />
        <span className="chip" style={{ borderColor: ROLE_COLOR.ADMIN, color: ROLE_COLOR.ADMIN }}>관리자</span> 메뉴 권한 · 계정 관리 · 전체 화면
        {' '}
        <span className="chip" style={{ borderColor: ROLE_COLOR.OFFICER, color: ROLE_COLOR.OFFICER }}>간부진</span> 인사 탭 관리만
        {' '}
        <span className="chip" style={{ borderColor: ROLE_COLOR.MEMBER, color: ROLE_COLOR.MEMBER }}>동맹원</span> 시뮬레이션만
        <br />
        아래에서 메뉴별로 어떤 역할에게 보일지 직접 켜고 끌 수 있습니다.
        관리자는 항상 포함되어 되돌릴 방법이 사라지지 않게 고정됩니다.
      </div>

      <h3>메뉴 권한</h3>
      <div className="grid-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>메뉴</th>
              <th>경로</th>
              <th style={{ textAlign: 'center' }}>표시</th>
              <th>볼 수 있는 역할</th>
            </tr>
          </thead>
          <tbody>
            {menus.map((m) => (
              <tr key={m.code}>
                <td style={{ whiteSpace: 'nowrap' }}>{m.icon} {m.label}</td>
                <td className="muted"><code>{m.route}</code></td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className={`marker-btn ${m.visible ? 'on' : ''}`}
                    style={m.visible
                      ? { background: '#3fa15e', borderColor: '#3fa15e', color: '#12100e' }
                      : { borderColor: '#6f665c', color: '#6f665c' }}
                    disabled={busy === m.code}
                    aria-pressed={m.visible}
                    onClick={() => patch(m.code, { visible: !m.visible })}
                  >
                    {m.visible ? '표시' : '숨김'}
                  </button>
                </td>
                <td>
                  <div className="marker-buttons">
                    {ROLES.map((role) => {
                      const on = m.allowedRoles.includes(role)
                      const locked = role === 'ADMIN'
                      return (
                        <button
                          key={role}
                          className={`marker-btn ${on ? 'on' : ''}`}
                          style={on
                            ? { background: ROLE_COLOR[role], borderColor: ROLE_COLOR[role], color: '#12100e' }
                            : { borderColor: '#6f665c', color: '#6f665c' }}
                          disabled={busy === m.code || locked}
                          aria-pressed={on}
                          title={locked ? '관리자는 항상 포함됩니다' : `${ROLE_LABEL[role]} ${on ? '제외' : '허용'}`}
                          onClick={() => toggleRole(m, role)}
                        >
                          {ROLE_LABEL[role]}
                        </button>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>계정 권한 ({accounts.length})</h3>
      <div className="grid-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>이름</th>
              <th>동맹</th>
              <th>역할</th>
              <th>cid</th>
              <th>마지막 로그인</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td><code>{a.loginId}</code></td>
                <td>{a.displayName}</td>
                <td className="muted">{a.alliance ?? '—'}</td>
                <td>
                  <div className="marker-buttons">
                    {ROLES.map((role) => {
                      const on = a.role === role
                      return (
                        <button
                          key={role}
                          className={`marker-btn ${on ? 'on' : ''}`}
                          style={on
                            ? { background: ROLE_COLOR[role], borderColor: ROLE_COLOR[role], color: '#12100e' }
                            : { borderColor: '#6f665c', color: '#6f665c' }}
                          disabled={busy === a.id || on}
                          aria-pressed={on}
                          onClick={() => setAccountRole(a, role)}
                        >
                          {ROLE_LABEL[role]}
                        </button>
                      )
                    })}
                  </div>
                </td>
                <td className="muted">{a.cid ?? '—'}</td>
                <td className="muted">
                  {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString('ko-KR') : '없음'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="danger" onClick={() => removeAccount(a)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        역할을 바꾸면 그 계정의 기존 로그인 세션이 끊깁니다. 다시 로그인해야 새 권한이 적용됩니다.
      </p>
    </div>
  )
}
