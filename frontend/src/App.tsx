import { useCallback, useEffect, useState } from 'react'
import './App.css'
 import * as hr from './api/hr'
import { ROLE_LABEL, can } from './api/hr'
import type { LoginResult, MenuItem } from './api/hr'
import { supabaseConfigured } from './lib/supabase'
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

export default function App() {
  const [session, setSession] = useState<LoginResult | null>(null)
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [route, setRoute] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 저장된 로그인을 되살리는 동안만 잠깐 기다린다.
  //
  // 예전에는 여기서 Render 가 깨어날 때까지(최대 90초) 로딩 화면을 띄웠다.
  // 이제 로그인과 인사 데이터는 항상 켜져 있는 Supabase 로 가므로 기다릴 일이 없다.
  // Render 는 «덱 분석» 을 누른 순간에만 필요하고, 그 대기는 해당 화면 안에서 보여준다.
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    let cancelled = false
    hr.restoreSession()
      .then((s) => { if (!cancelled) setSession(s) })
      .catch(() => { /* 세션이 없으면 로그인 화면으로 간다 */ })
      .finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
  }, [])

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
    setSession(null)
  }

  // 설정이 빠졌으면 그것부터 알려준다. 이게 없으면 «로그인이 안 된다» 로만 보인다.
  if (!supabaseConfigured) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>천하결전 오피스</h1>
        </header>
        <div className="error-box">
          Supabase 설정이 없습니다. 배포 환경변수에 <code>VITE_SUPABASE_URL</code> 과{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> 를 넣고 다시 빌드해 주세요.
        </div>
      </div>
    )
  }

  // 로그인 전에는 다른 화면을 아예 만들지 않는다.
  // 세션 복원은 Supabase 만 보므로 대개 눈에 띄지 않게 끝난다.
  if (!session) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>천하결전 오피스</h1>
          <span className="sub">덱 시뮬레이션 · 동맹 인사관리</span>
        </header>
        {restoring ? <div className="panel"><p className="muted">불러오는 중…</p></div>
                   : <HrLogin onLoggedIn={setSession} />}
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
