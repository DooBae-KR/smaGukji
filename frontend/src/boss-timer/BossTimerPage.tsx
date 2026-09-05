import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './api'
import type { BossTimerRow, SpawnType } from './api'
import { BOSS_SHEET_CSV_URL, DEFAULT_BOSS_SEED, parseBossSheet } from './sheetImport'
import './boss-timer.css'

function getSlug(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('room') || 'main'
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
  name: string
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
  const [sort, setSort] = useState<'name' | 'remaining'>('name')
  const [openSchedule, setOpenSchedule] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // 방 만들기 화면용
  const [createPassword, setCreatePassword] = useState('')
  const [createPollToken, setCreatePollToken] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

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
      name: b.name,
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

  const handleSaveName = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    const name = editFor(b).name.trim()
    if (!name) {
      setError('보스 이름은 비울 수 없습니다.')
      return
    }
    await saveBoss(b, { name })
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

  const handleToggleActive = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    await saveBoss(b, { isActive: !b.is_active })
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

  const sortedBosses = useMemo(() => {
    const list = [...bosses]
    if (sort === 'remaining') {
      list.sort((a, b) => new Date(a.next_spawn_at).getTime() - new Date(b.next_spawn_at).getTime())
    } else {
      list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    }
    return list
  }, [bosses, sort])

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
          <p className="muted">"{slug}" 방이 아직 없습니다. 비밀번호와 봇 폴링용 토큰을 정해 새로 만드세요.</p>
          {error && <div className="error-box">{error}</div>}
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
      </header>

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
          <label className="sort-label">
            정렬
            <select value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'remaining')}>
              <option value="name">이름순</option>
              <option value="remaining">남은시간순</option>
            </select>
          </label>
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
            <thead>
              <tr>
                <th>상태</th>
                <th>알림</th>
                <th>보스 이름</th>
                <th>방식</th>
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
                    <td>
                      <button
                        className={`status-dot ${b.is_active ? 'on' : 'off'}`}
                        onClick={() => handleToggleActive(b)}
                        title="클릭해서 켜기/끄기"
                      >
                        {b.is_active ? 'O' : 'X'}
                      </button>
                    </td>
                    <td>
                      <button
                        className={`notify-toggle ${b.notify_enabled ? 'on' : 'off'}`}
                        onClick={() => handleToggleNotify(b)}
                        title="카카오톡 알림 켜기/끄기"
                      >
                        {b.notify_enabled ? '🔔' : '🔕'}
                      </button>
                    </td>
                    <td>
                      <div className="name-cell">
                        {b.seq_label && <span className="seq-label">{b.seq_label}</span>}
                        <input
                          className="name-input"
                          type="text"
                          value={e.name}
                          onChange={(ev) => updateEdit(b.boss_id, { name: ev.target.value })}
                          onKeyDown={(ev) => ev.key === 'Enter' && handleSaveName(b)}
                        />
                        {e.name !== b.name && (
                          <button className="save-name" onClick={() => handleSaveName(b)} title="이름 저장">
                            저장
                          </button>
                        )}
                      </div>
                      {b.location && <div className="sub-info">{b.location}{b.level ? ` · Lv${b.level}` : ''}</div>}
                    </td>
                    <td>
                      <button
                        className="schedule-badge"
                        onClick={() => setOpenSchedule(scheduling ? null : b.boss_id)}
                        title="등장 방식 설정"
                      >
                        {scheduleLabel(b)} ✎
                      </button>
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
                    <td>
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
                    <td className="spawn-at">{formatSpawnAt(b.next_spawn_at)}</td>
                    <td>
                      <button className="danger ghost" onClick={() => handleDelete(b)} title="삭제">✕</button>
                    </td>
                  </tr>
                )
              })}
              {sortedBosses.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-row">아직 등록된 보스가 없습니다. "+ 보스 추가" 로 시작하세요.</td>
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
