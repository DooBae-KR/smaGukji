import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { ping } from './api/endpoints'
 import * as hr from './api/hr'
import { ROLE_LABEL, can } from './api/hr'
import type { LoginResult, MenuItem } from './api/hr'
import { LoadingScreen } from './components/LoadingScreen'
 import { AdminPanel } from './pages/AdminPanel'
import { AgentPage } from './pages/AgentPage'
import { BuilderPage } from './pages/BuilderPage'
import { CatalogPage } from './pages/CatalogPage'
import { DataPage } from './pages/DataPage'
import { HrLogin } from './pages/hr/HrLogin'
import { HrPage } from './pages/hr/HrPage'
import { PlanningPage } from './pages/PlanningPage'
import { StrategyPage } from './pages/StrategyPage'

/** 관리자 화면은 DB 메뉴가 아니라 세션 역할로만 붙는다. */
const ADMIN_ROUTE = '/admin'

/** 백엔드가 깰 때까지 기다리는 최대 시간. Render 무료 플랜 콜드 스타트가 1분 남짓이다. */
const BOOT_TIMEOUT_SECONDS = 90

export default function App() {
  const [session, setSession] = useState<LoginResult | null>(null)
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [route, setRoute] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 부팅 상태. 백엔드가 응답할 때까지 로딩 화면을 보여준다.
  const [booted, setBooted] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [bootAttempt, setBootAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setBooted(false)
    setBootError(null)
    setElapsed(0)

    const startedAt = Date.now()
    const ticker = window.setInterval(() => {
      if (!cancelled) setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    const wait = async () => {
      // 잠든 서버가 깨어날 때까지 재시도한다. 한 번 실패했다고 포기하면
      // 무료 플랜에서는 사실상 항상 오류 화면이 뜬다.
      while (!cancelled) {
        if (await ping()) {
          if (!cancelled) setBooted(true)
          return
        }
        if ((Date.now() - startedAt) / 1000 > BOOT_TIMEOUT_SECONDS) {
          if (!cancelled) {
            setBootError(`${BOOT_TIMEOUT_SECONDS}초 동안 응답이 없습니다. 서버가 내려가 있을 수 있습니다.`)
          }
          return
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    wait()

    return () => {
      cancelled = true
      window.clearInterval(ticker)
    }
  }, [bootAttempt])

  const role = session?.role
  const isAdmin = can.manageSystem(role)

  const loadMenus = useCallback(() => {
    if (!session) {
      setMenus([])
      setRoute('')
      return
    }
    hr.listMenus()
      .then((m) => {
        setMenus(m)
        // 권한이 사라진 화면에 머물러 있으면 첫 메뉴로 돌려보낸다.
        setRoute((current) => {
          if (current === ADMIN_ROUTE) return current
          return m.some((x) => x.route === current) ? current : (m[0]?.route ?? ADMIN_ROUTE)
        })
        setError(null)
      })
      .catch((e) => setError(`메뉴를 불러오지 못했습니다: ${(e as Error).message}`))
  }, [session])

  useEffect(loadMenus, [loadMenus])

  const logout = async () => {
    await hr.logout().catch(() => undefined)
    hr.clearToken()
    setSession(null)
  }

  // 백엔드가 깨어나기 전에는 로딩 화면만 보여준다.
  // 이게 없으면 콜드 스타트 동안 로그인 화면이 뜬 채로 모든 요청이 실패해
  // 사용자는 앱이 고장난 줄 안다.
  if (!booted) {
    return (
      <LoadingScreen
        elapsedSeconds={elapsed}
        error={bootError}
        onRetry={() => setBootAttempt((n) => n + 1)}
      />
    )
  }

  // 로그인 전에는 다른 화면을 아예 만들지 않는다.
  if (!session) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>천하결전 오피스</h1>
          <span className="sub">덱 시뮬레이션 · 동맹 인사관리</span>
        </header>
        <HrLogin onLoggedIn={setSession} />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>천하결전 오피스</h1>
        <span className="sub">
          {session.server && session.allianceName
            ? `${session.server} · ${session.allianceName}`
            : '덱 시뮬레이션 · 동맹 인사관리'}
        </span>
        <div className="spacer" />
        <div className="session-chip">
          <span>
            {session.displayName}
            <span className={`chip ${isAdmin ? 'on' : ''}`} style={{ marginLeft: 6 }}>
              {ROLE_LABEL[session.role]}
            </span>
          </span>
          <button onClick={logout}>로그아웃</button>
        </div>
      </header>

      {error && <div className="error-box">{error}</div>}

      <nav className="tabs" role="tablist">
        {menus.map((m) => (
          <button
            key={m.code}
            role="tab"
            aria-selected={route === m.route}
            onClick={() => setRoute(m.route)}
          >
            {m.icon} {m.label}
          </button>
        ))}
        {isAdmin && (
          <button
            role="tab"
            aria-selected={route === ADMIN_ROUTE}
            onClick={() => setRoute(ADMIN_ROUTE)}
          >
            ⚙️ 관리자
          </button>
        )}
      </nav>

      {menus.length === 0 && route !== ADMIN_ROUTE && (
        <div className="panel">
          <p className="muted">
            사용할 수 있는 메뉴가 없습니다. 관리자에게 권한을 요청하세요.
            <br />
            현재 권한: <strong>{ROLE_LABEL[session.role]}</strong>
          </p>
        </div>
      )}

      {route === '/hr' && <HrPage session={session} onSession={setSession} />}
      {route === '/office' && <AgentPage onGoTo={setRoute} />}
      {route === '/builder' && <BuilderPage />}
      {route === '/strategy' && <StrategyPage />}
      {route === '/planning' && <PlanningPage />}
      {route === '/generals' && <CatalogPage kind="GENERAL" />}
      {route === '/tactics' && <CatalogPage kind="TACTIC" />}
      {route === '/data' && <DataPage />}
      {route === ADMIN_ROUTE && isAdmin && <AdminPanel onMenusChanged={loadMenus} />}
    </div>
  )
}
