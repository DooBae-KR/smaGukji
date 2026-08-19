import { useState } from 'react'
import * as hr from '../../api/hr'
import type { LoginResult } from '../../api/hr'

type Mode = 'login' | 'register'

/**
 * 로그인 / 회원가입.
 *
 * 회원가입 때 서버·동맹 이름을 함께 받아 동맹을 만들거나 기존 동맹에 합류한다.
 * 그 동맹의 첫 가입자는 관리자가 되고, 이후 가입자는 일반 멤버가 된다.
 */
export function HrLogin({ onLoggedIn }: { onLoggedIn: (r: LoginResult) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [server, setServer] = useState('')
  const [alliance, setAlliance] = useState('')
  const [cid, setCid] = useState('')

  const run = async (fn: () => Promise<LoginResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await fn()
      hr.saveToken(result.token)
      setPassword('')
      onLoggedIn(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doLogin = () => run(() => hr.login(loginId, password))
  const doRegister = () =>
    run(() =>
      hr.register({
        loginId,
        password,
        displayName,
        server,
        allianceName: alliance,
        cid: cid || undefined,
      }),
    )

  const loginReady = loginId.trim() !== '' && password !== ''
  const registerReady =
    loginReady && password.length >= 4 && displayName.trim() !== '' &&
    server.trim() !== '' && alliance.trim() !== ''

  return (
    <div className="panel" style={{ maxWidth: 460 }}>
      <nav className="tabs" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(null) }}>
          로그인
        </button>
        <button role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(null) }}>
          회원가입
        </button>
      </nav>

      {error && <div className="error-box">{error}</div>}

      <label><span className="field-label">ID</span>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'login' && loginReady) doLogin() }}
        />
      </label>

      <label><span className="field-label">비밀번호{mode === 'register' && ' (4자 이상)'}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'login' && loginReady) doLogin() }}
        />
      </label>

      {mode === 'register' && (
        <>
          <label><span className="field-label">표시 이름</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="예: 순두부" />
          </label>

          <div className="notice" style={{ marginTop: 12 }}>
            <strong>동맹 정보</strong>
            <br />
            처음 등록하는 동맹이면 <strong>내가 관리자</strong>가 되어 동맹을 관리할 수 있습니다.
            이미 등록된 동맹이면 일반 멤버로 합류합니다.
          </div>

          <label><span className="field-label">서버</span>
            <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="예: 12" />
          </label>
          <label><span className="field-label">동맹 이름</span>
            <input value={alliance} onChange={(e) => setAlliance(e.target.value)} placeholder="예: 도원" />
          </label>
          <label><span className="field-label">내 캐릭터 ID (선택)</span>
            <input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="예: 20003057019" />
          </label>
        </>
      )}

      <div className="toolbar" style={{ marginTop: 14 }}>
        {mode === 'login' ? (
          <button className="primary" disabled={busy || !loginReady} onClick={doLogin}>
            로그인
          </button>
        ) : (
          <button className="primary" disabled={busy || !registerReady} onClick={doRegister}>
            가입하고 시작하기
          </button>
        )}
      </div>

      <p className="muted" style={{ marginTop: 10 }}>
        🔒 이 앱 전용 계정입니다. 게임 계정과 무관하며 비밀번호는 해시로만 저장됩니다.
      </p>
    </div>
  )
}
