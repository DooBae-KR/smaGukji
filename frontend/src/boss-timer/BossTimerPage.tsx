import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './api'
import type { BossTimerRow, SpawnType } from './api'
import { BOSS_SHEET_CSV_URL, DEFAULT_BOSS_SEED, parseBossSheet } from './sheetImport'
import { getSubscriptionState, subscribeToPush, unsubscribeFromPush } from './webPush'
import './boss-timer.css'

/** 표준 DOM 타입에는 없는 크롬 전용 이벤트. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

const LAST_ROOM_KEY = 'boss-timer-last-room'

/**
 * 홈 화면에 아이콘으로 추가(PWA)해서 열면 매니페스트의 start_url 만 뜨고 ?room= 은 못
 * 들고 온다. 그래서 마지막으로 본 방을 localStorage 에 기억해뒀다가, 주소에 방이 없으면
 * 그걸로 대신 연다.
 */
function getSlug(): string {
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('room')
  if (fromUrl) {
    try {
      window.localStorage.setItem(LAST_ROOM_KEY, fromUrl)
    } catch {
      // 프라이빗 모드 등에서 localStorage 를 못 쓰면 그냥 넘어간다.
    }
    return fromUrl
  }
  try {
    return window.localStorage.getItem(LAST_ROOM_KEY) || 'main'
  } catch {
    return 'main'
  }
}

function formatRemaining(nextSpawnAt: string, now: number): string {
  const diffMs = new Date(nextSpawnAt).getTime() - now
  const sign = diffMs < 0 ? '-' : ''
  const total = Math.floor(Math.abs(diffMs) / 60000)
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  return `${sign}${days}일 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatSpawnAt(nextSpawnAt: string): string {
  const d = new Date(nextSpawnAt)
  return `${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토']

function scheduleLabel(b: BossTimerRow): string {
  if (b.spawn_type === 2 && b.weekday !== null && b.fixed_time) {
    return `매주 ${WEEKDAY_LABEL[b.weekday]} ${b.fixed_time.slice(0, 5)}`
  }
  if (b.spawn_type === 3 && b.fixed_time) {
    return `매일 ${b.fixed_time.slice(0, 5)}`
  }
  return '쿨타임형'
}

interface RowEditState {
  days: string
  hours: string
  minutes: string
  spawnType: SpawnType
  weekday: number
  fixedTime: string
  cdMin: string
  cdMax: string
}

export function BossTimerPage() {
  const slug = useMemo(getSlug, [])
  const [exists, setExists] = useState<boolean | null>(null)
  const [password, setPasswordInput] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [notice, setNoticeText] = useState('')
  const [bosses, setBosses] = useState<BossTimerRow[]>([])
  const [newPassword, setNewPasswordInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [edits, setEdits] = useState<Record<string, RowEditState>>({})
  const [openSchedule, setOpenSchedule] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [pushState, setPushState] = useState<'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading'>('loading')
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallHelp, setShowInstallHelp] = useState(false)

  // 방 만들기 화면용
  const [createPassword, setCreatePassword] = useState('')
  const [createPollToken, setCreatePollToken] = useState('')
  const [joinRoomInput, setJoinRoomInput] = useState('')

  /** 서버 이름만 알면 URL을 몰라도 그 방으로 바로 들어간다. */
  const goToRoom = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    window.location.href = `/boss-timer.html?room=${encodeURIComponent(trimmed)}`
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    getSubscriptionState().then(setPushState)
  }, [])

  // 안드로이드 크롬은 "홈 화면에 추가"를 이 이벤트로 직접 띄울 수 있다. 아이폰 사파리는
  // 이 이벤트 자체가 없어서(플랫폼 제약) 대신 안내 문구로 대체한다.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  const handleEnablePush = async () => {
    try {
      await subscribeToPush(slug)
      setPushState('subscribed')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDisablePush = async () => {
    try {
      await unsubscribeFromPush()
      setPushState('unsubscribed')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const reload = useCallback(async () => {
    try {
      const view = await api.loadRoom(slug)
      setNoticeText(view.notice)
      setBosses(view.bosses)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    api
      .roomExists(slug)
      .then((v) => {
        if (cancelled) return
        setExists(v)
        if (v) reload()
      })
      .catch((e) => setError((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [slug, reload])

  const editFor = (b: BossTimerRow): RowEditState =>
    edits[b.boss_id] ?? {
      days: '0',
      hours: '0',
      minutes: '0',
      spawnType: b.spawn_type,
      weekday: b.weekday ?? 1,
      fixedTime: b.fixed_time?.slice(0, 5) ?? '09:00',
      cdMin: String(b.respawn_min_minutes ?? Math.floor(b.respawn_interval_min)),
      cdMax: String(b.respawn_max_minutes ?? b.respawn_min_minutes ?? Math.floor(b.respawn_interval_min)),
    }

  const updateEdit = (id: string, patch: Partial<RowEditState>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...editFor(bosses.find((b) => b.boss_id === id)!), ...prev[id], ...patch } }))

  const handleCreateRoom = async () => {
    if (!createPassword || !createPollToken) {
      setError('비밀번호와 폴링 토큰을 모두 입력하세요.')
      return
    }
    try {
      await api.createRoom(slug, createPassword, createPollToken)
      // 방을 막 만들었으니 기본 보스 목록을 바로 채운다. 나중에 시트가 바뀌면
      // "시트에서 불러오기" 로 다시 갱신하면 된다.
      await api.bulkImport(slug, createPassword, DEFAULT_BOSS_SEED)
      setExists(true)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleUnlock = async () => {
    try {
      const ok = await api.verifyPassword(slug, password)
      if (!ok) {
        setError('비밀번호가 올바르지 않습니다.')
        return
      }
      setUnlocked(true)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const requirePassword = (): boolean => {
    if (!unlocked) {
      setError('먼저 비밀번호를 확인하세요.')
      return false
    }
    return true
  }

  /** 스케줄(방식·요일·시간·쿨타임 범위) 을 뺀 나머지는 그대로 두고 upsert 를 부르는 공통 헬퍼. */
  const saveBoss = async (b: BossTimerRow, patch: Partial<Parameters<typeof api.upsertBoss>[2]>) => {
    try {
      await api.upsertBoss(slug, password, {
        id: b.boss_id,
        seqLabel: b.seq_label,
        name: b.name,
        sortOrder: b.sort_order,
        isActive: b.is_active,
        notifyEnabled: b.notify_enabled,
        nextSpawnAt: b.next_spawn_at,
        respawnIntervalMin: b.respawn_interval_min,
        spawnType: b.spawn_type,
        weekday: b.weekday,
        fixedTime: b.fixed_time,
        respawnMinMinutes: b.respawn_min_minutes,
        respawnMaxMinutes: b.respawn_max_minutes,
        level: b.level,
        location: b.location,
        ...patch,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleApply = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    const e = editFor(b)
    const spawnAt = new Date(now + (Number(e.days) * 1440 + Number(e.hours) * 60 + Number(e.minutes)) * 60000)
    await saveBoss(b, { nextSpawnAt: spawnAt.toISOString() })
  }

  const handleMarkDeath = async (b: BossTimerRow, useMax: boolean) => {
    if (!requirePassword()) return
    try {
      await api.markDeath(slug, password, b.boss_id, useMax)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleShift = async (b: BossTimerRow, delta: number) => {
    if (!requirePassword()) return
    try {
      await api.shiftBoss(slug, password, b.boss_id, delta)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleSetActive = async (b: BossTimerRow, isActive: boolean) => {
    if (!requirePassword()) return
    if (b.is_active === isActive) return
    await saveBoss(b, { isActive })
  }

  const handleToggleNotify = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    await saveBoss(b, { notifyEnabled: !b.notify_enabled })
  }

  const handleSaveSchedule = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    const e = editFor(b)
    if (e.spawnType === 1) {
      const cdMin = Number(e.cdMin)
      const cdMax = Number(e.cdMax) || cdMin
      await saveBoss(b, {
        spawnType: 1,
        weekday: null,
        fixedTime: null,
        respawnMinMinutes: cdMin,
        respawnMaxMinutes: cdMax,
        respawnIntervalMin: cdMin,
      })
    } else if (e.spawnType === 2) {
      await saveBoss(b, {
        spawnType: 2,
        weekday: e.weekday,
        fixedTime: e.fixedTime,
        respawnMinMinutes: null,
        respawnMaxMinutes: null,
      })
    } else {
      await saveBoss(b, {
        spawnType: 3,
        weekday: null,
        fixedTime: e.fixedTime,
        respawnMinMinutes: null,
        respawnMaxMinutes: null,
      })
    }
    setOpenSchedule(null)
  }

  const handleDelete = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    if (!confirm(`"${b.name}" 을(를) 삭제할까요?`)) return
    try {
      await api.deleteBoss(slug, password, b.boss_id)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleAdd = async () => {
    if (!requirePassword()) return
    try {
      await api.upsertBoss(slug, password, {
        id: null,
        seqLabel: '',
        name: '새 보스',
        sortOrder: bosses.length,
        isActive: true,
        notifyEnabled: true,
        nextSpawnAt: new Date(now + 60 * 60000).toISOString(),
        respawnIntervalMin: 60,
        spawnType: 1,
        weekday: null,
        fixedTime: null,
        respawnMinMinutes: 60,
        respawnMaxMinutes: 60,
        level: null,
        location: null,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleSaveNotice = async () => {
    if (!requirePassword()) return
    try {
      await api.setNotice(slug, password, notice)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleChangePassword = async () => {
    if (!requirePassword()) return
    if (!newPassword) return
    try {
      const ok = await api.setPassword(slug, password, newPassword)
      if (!ok) {
        setError('비밀번호 변경에 실패했습니다.')
        return
      }
      setPasswordInput(newPassword)
      setNewPasswordInput('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDestroy = async () => {
    if (!requirePassword()) return
    if (!confirm('정말 이 방을 통째로 삭제할까요? 되돌릴 수 없습니다.')) return
    try {
      await api.destroyRoom(slug, password)
      window.location.reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleImportSheet = async () => {
    if (!requirePassword()) return
    setImporting(true)
    setImportMsg(null)
    try {
      const res = await fetch(BOSS_SHEET_CSV_URL)
      if (!res.ok) throw new Error(`시트를 불러오지 못했습니다 (HTTP ${res.status})`)
      const csvText = await res.text()
      const { rows, skipped } = parseBossSheet(csvText)
      if (rows.length === 0) throw new Error('시트에서 읽은 보스가 없습니다. 시트 공유 설정을 확인하세요.')
      const count = await api.bulkImport(slug, password, rows)
      setImportMsg(
        `${count}개 반영됨` + (skipped.length > 0 ? ` · 형식을 못 읽어 건너뜀: ${skipped.join(', ')}` : ''),
      )
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  // 켜진(ON) 보스가 먼저, 그 안에서는 등장이 빠른 순.
  const sortedBosses = useMemo(() => {
    return [...bosses].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return new Date(a.next_spawn_at).getTime() - new Date(b.next_spawn_at).getTime()
    })
  }, [bosses])

  if (exists === null) {
    return (
      <div className="boss-timer-app">
        <div className="boss-timer-loading">불러오는 중…</div>
      </div>
    )
  }

  if (!exists) {
    return (
      <div className="boss-timer-app">
        <div className="boss-timer-card boss-timer-setup">
          <h1>⚡ 보스 타이머</h1>
          <p className="muted">"{slug}" 방이 아직 없습니다.</p>
          {error && <div className="error-box">{error}</div>}

          <div className="boss-timer-panel">
            <label>이미 만들어진 서버 이름을 아시나요?</label>
            <div className="join-row">
              <input
                type="text"
                placeholder="서버 이름 (예: hera2)"
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goToRoom(joinRoomInput)}
              />
              <button className="primary" onClick={() => goToRoom(joinRoomInput)}>입장</button>
            </div>
          </div>

          <div className="setup-divider">또는 새로 만들기</div>

          <div className="boss-timer-panel">
            <label>방 비밀번호 (조회·수정 시 사용)</label>
            <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
            <label>봇 폴링 토큰 (알림 봇 전용, 방 비밀번호와 다르게)</label>
            <input type="password" value={createPollToken} onChange={(e) => setCreatePollToken(e.target.value)} />
            <button className="primary" onClick={handleCreateRoom}>방 만들기</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="boss-timer-app">
      <header className="boss-timer-header">
        <h1>⚡ 보스 타이머</h1>
        <span className="boss-timer-room-name">방: {slug}</span>
        <button className="switch-room" onClick={() => { const n = prompt('들어갈 서버 이름을 입력하세요', slug); if (n) goToRoom(n) }}>
          다른 서버로
        </button>
        <div className="spacer" />
        {pushState === 'subscribed' && (
          <button className="ok" onClick={handleDisablePush}>🔔 폰 알림 켜짐</button>
        )}
        {pushState === 'unsubscribed' && (
          <button className="primary" onClick={handleEnablePush}>🔔 이 폰으로 알림 받기</button>
        )}
        {pushState === 'denied' && <span className="muted">알림 권한이 거부돼 있습니다(브라우저 설정에서 허용 필요)</span>}
        {pushState === 'unsupported' && <span className="muted">이 브라우저는 푸시 알림 미지원</span>}
        {installPrompt ? (
          <button onClick={handleInstall}>📲 앱으로 설치</button>
        ) : (
          <button onClick={() => setShowInstallHelp((v) => !v)}>📲 홈 화면에 추가</button>
        )}
      </header>

      {showInstallHelp && !installPrompt && (
        <div className="boss-timer-card install-help">
          <b>홈 화면에 추가하는 법</b>
          <p>
            <b>아이폰(사파리)</b>: 아래 공유 버튼 <span className="ios-share-icon">⬆️</span> → "홈 화면에 추가". 아이폰은
            이렇게 추가해야만 알림(푸시)이 옵니다 — 사파리로만 열어두면 알림이 안 옵니다.
          </p>
          <p><b>안드로이드(크롬)</b>: 오른쪽 위 점 3개 메뉴 → "홈 화면에 추가" 또는 "앱 설치".</p>
          <button onClick={() => setShowInstallHelp(false)}>닫기</button>
        </div>
      )}

      <div className="boss-timer-card">
        <div className="boss-timer-toolbar">
          <input
            type="password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(e) => setPasswordInput(e.target.value)}
          />
          <button className={unlocked ? 'ok' : 'primary'} onClick={handleUnlock}>
            {unlocked ? '✓ 확인됨' : '확인'}
          </button>
          <div className="spacer" />
          <input
            type="password"
            placeholder="비밀번호 변경"
            value={newPassword}
            onChange={(e) => setNewPasswordInput(e.target.value)}
          />
          <button onClick={handleChangePassword}>비밀번호 저장</button>
          <button className="danger" onClick={handleDestroy}>방 폭파</button>
        </div>
      </div>

      <div className="boss-timer-card">
        <div className="boss-timer-card-title">📢 공지</div>
        <textarea
          className="boss-timer-notice"
          value={notice}
          onChange={(e) => setNoticeText(e.target.value)}
          rows={3}
        />
        <div className="boss-timer-card-actions">
          <button className="primary" onClick={handleSaveNotice}>공지 저장</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="boss-timer-card">
        <div className="boss-timer-toolbar">
          <span className="muted sort-label">켜진 보스 · 등장 임박 순</span>
          <div className="spacer" />
          <button onClick={handleImportSheet} disabled={importing}>
            {importing ? '불러오는 중…' : '📄 시트에서 불러오기'}
          </button>
          <button className="primary" onClick={handleAdd}>+ 보스 추가</button>
          <button onClick={reload}>↻ 새로고침</button>
        </div>
        {importMsg && <p className="muted import-msg">{importMsg}</p>}

        <div className="boss-timer-table-wrap">
          <table className="boss-timer-table">
            <colgroup>
              <col className="col-status" />
              <col className="col-name" />
              <col className="col-remaining" />
              <col className="col-spawn-at" />
              <col className="col-delete" />
            </colgroup>
            <thead>
              <tr>
                <th>상태</th>
                <th>보스 이름</th>
                <th>남은 시간</th>
                <th>등장 시간</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedBosses.map((b) => {
                const e = editFor(b)
                const scheduling = openSchedule === b.boss_id
                return (
                  <tr key={b.boss_id} className={b.is_active ? '' : 'row-inactive'}>
                    <td className="nowrap" data-label="상태">
                      <div className="active-radio" role="radiogroup" aria-label="보스 상태">
                        <label className={b.is_active ? 'checked' : ''}>
                          <input
                            type="radio"
                            name={`active-${b.boss_id}`}
                            checked={b.is_active}
                            onChange={() => handleSetActive(b, true)}
                          />
                          ON
                        </label>
                        <label className={!b.is_active ? 'checked' : ''}>
                          <input
                            type="radio"
                            name={`active-${b.boss_id}`}
                            checked={!b.is_active}
                            onChange={() => handleSetActive(b, false)}
                          />
                          OFF
                        </label>
                      </div>
                    </td>
                    <td data-label="이름">
                      <div className="name-cell">
                        {b.seq_label && <span className="seq-label">{b.seq_label}</span>}
                        <span className="name-text">
                          {b.level != null && <span className="level-tag">Lv{b.level}</span>}
                          {b.name}
                        </span>
                        <button
                          className={`notify-toggle ${b.notify_enabled ? 'on' : 'off'}`}
                          onClick={() => handleToggleNotify(b)}
                          title="카카오톡 알림 켜기/끄기"
                        >
                          {b.notify_enabled ? '🔔' : '🔕'}
                        </button>
                        <button
                          className="schedule-gear"
                          onClick={() => setOpenSchedule(scheduling ? null : b.boss_id)}
                          title={`등장 방식: ${scheduleLabel(b)} (클릭해서 수정)`}
                        >
                          ⚙
                        </button>
                      </div>
                      {scheduling && (
                        <div className="schedule-editor">
                          <select
                            value={e.spawnType}
                            onChange={(ev) => updateEdit(b.boss_id, { spawnType: Number(ev.target.value) as SpawnType })}
                          >
                            <option value={1}>쿨타임형</option>
                            <option value={2}>요일고정형</option>
                            <option value={3}>매일고정형</option>
                          </select>
                          {e.spawnType === 1 && (
                            <span className="schedule-fields">
                              <input
                                type="number"
                                value={e.cdMin}
                                onChange={(ev) => updateEdit(b.boss_id, { cdMin: ev.target.value })}
                              />
                              ~
                              <input
                                type="number"
                                value={e.cdMax}
                                onChange={(ev) => updateEdit(b.boss_id, { cdMax: ev.target.value })}
                              />
                              분
                            </span>
                          )}
                          {e.spawnType === 2 && (
                            <span className="schedule-fields">
                              <select
                                value={e.weekday}
                                onChange={(ev) => updateEdit(b.boss_id, { weekday: Number(ev.target.value) })}
                              >
                                {WEEKDAY_LABEL.map((w, i) => (
                                  <option key={w} value={i}>{w}요일</option>
                                ))}
                              </select>
                              <input
                                type="time"
                                value={e.fixedTime}
                                onChange={(ev) => updateEdit(b.boss_id, { fixedTime: ev.target.value })}
                              />
                            </span>
                          )}
                          {e.spawnType === 3 && (
                            <span className="schedule-fields">
                              <input
                                type="time"
                                value={e.fixedTime}
                                onChange={(ev) => updateEdit(b.boss_id, { fixedTime: ev.target.value })}
                              />
                            </span>
                          )}
                          <button className="primary" onClick={() => handleSaveSchedule(b)}>저장</button>
                        </div>
                      )}
                    </td>
                    <td data-label="남은 시간">
                      <div className="remaining-cell">
                        <span className={`remaining ${new Date(b.next_spawn_at).getTime() - now <= 5 * 60000 ? 'soon' : ''}`}>
                          {formatRemaining(b.next_spawn_at, now)}
                        </span>
                        {b.spawn_type === 1 ? (
                          <div className="remaining-inputs">
                            <input
                              type="number"
                              value={e.days}
                              onChange={(ev) => updateEdit(b.boss_id, { days: ev.target.value })}
                              placeholder="일"
                            />
                            <input
                              type="number"
                              value={e.hours}
                              onChange={(ev) => updateEdit(b.boss_id, { hours: ev.target.value })}
                              placeholder="시"
                            />
                            <input
                              type="number"
                              value={e.minutes}
                              onChange={(ev) => updateEdit(b.boss_id, { minutes: ev.target.value })}
                              placeholder="분"
                            />
                            <button className="primary" onClick={() => handleApply(b)}>적용</button>
                            <button onClick={() => handleShift(b, 1)}>+1분</button>
                            <button onClick={() => handleShift(b, -1)}>-1분</button>
                            <button className="death" onClick={() => handleMarkDeath(b, false)} title="지금 사망 → 쿨타임 적용">
                              💀 사망
                            </button>
                          </div>
                        ) : (
                          <span className="auto-badge">자동 계산</span>
                        )}
                      </div>
                    </td>
                    <td className="spawn-at nowrap" data-label="등장 시간">{formatSpawnAt(b.next_spawn_at)}</td>
                    <td className="nowrap" data-label="">
                      <button className="danger ghost" onClick={() => handleDelete(b)} title="삭제">✕</button>
                    </td>
                  </tr>
                )
              })}
              {sortedBosses.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">아직 등록된 보스가 없습니다. "+ 보스 추가" 로 시작하세요.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted boss-timer-footer">
        카카오톡 봇 연동: 봇이 <code>boss_timer_due_alerts(slug, poll_token)</code> RPC 를 1분마다 폴링하면
        <strong> 🔔 알림이 켜진</strong> 보스 중 등장 5분 전인 것만 받아갑니다(가져가면 자동으로 중복 발송 방지 표시됨).
        🔕 꺼진 보스는 화면에는 계속 보이지만 봇에게는 넘어가지 않습니다. 요일고정·매일고정형은 다음 등장을 서버가
        스스로 계산하고, 쿨타임형만 "적용"이나 "💀 사망" 으로 직접 갱신하면 됩니다.
      </p>
    </div>
  )
}
