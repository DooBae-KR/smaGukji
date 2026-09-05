import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './api'
import type { BossTimerRow } from './api'
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

interface RowEditState {
  name: string
  days: string
  hours: string
  minutes: string
  intervalHours: string
  intervalMinutes: string
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
      intervalHours: String(Math.floor(b.respawn_interval_min / 60)),
      intervalMinutes: String(b.respawn_interval_min % 60),
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

  const handleApply = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    const e = editFor(b)
    const spawnAt = new Date(now + (Number(e.days) * 1440 + Number(e.hours) * 60 + Number(e.minutes)) * 60000)
    try {
      await api.upsertBoss(slug, password, {
        id: b.boss_id,
        seqLabel: b.seq_label,
        name: b.name,
        sortOrder: b.sort_order,
        isActive: b.is_active,
        notifyEnabled: b.notify_enabled,
        nextSpawnAt: spawnAt.toISOString(),
        respawnIntervalMin: b.respawn_interval_min,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleSaveName = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    const e = editFor(b)
    const name = e.name.trim()
    if (!name) {
      setError('보스 이름은 비울 수 없습니다.')
      return
    }
    try {
      await api.upsertBoss(slug, password, {
        id: b.boss_id,
        seqLabel: b.seq_label,
        name,
        sortOrder: b.sort_order,
        isActive: b.is_active,
        notifyEnabled: b.notify_enabled,
        nextSpawnAt: b.next_spawn_at,
        respawnIntervalMin: b.respawn_interval_min,
      })
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

  const handleSaveInterval = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    const e = editFor(b)
    const intervalMin = Number(e.intervalHours) * 60 + Number(e.intervalMinutes)
    try {
      await api.upsertBoss(slug, password, {
        id: b.boss_id,
        seqLabel: b.seq_label,
        name: b.name,
        sortOrder: b.sort_order,
        isActive: b.is_active,
        notifyEnabled: b.notify_enabled,
        nextSpawnAt: b.next_spawn_at,
        respawnIntervalMin: intervalMin,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleToggleActive = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    try {
      await api.upsertBoss(slug, password, {
        id: b.boss_id,
        seqLabel: b.seq_label,
        name: b.name,
        sortOrder: b.sort_order,
        isActive: !b.is_active,
        notifyEnabled: b.notify_enabled,
        nextSpawnAt: b.next_spawn_at,
        respawnIntervalMin: b.respawn_interval_min,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleToggleNotify = async (b: BossTimerRow) => {
    if (!requirePassword()) return
    try {
      await api.upsertBoss(slug, password, {
        id: b.boss_id,
        seqLabel: b.seq_label,
        name: b.name,
        sortOrder: b.sort_order,
        isActive: b.is_active,
        notifyEnabled: !b.notify_enabled,
        nextSpawnAt: b.next_spawn_at,
        respawnIntervalMin: b.respawn_interval_min,
      })
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
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
          <button className="primary" onClick={handleAdd}>+ 보스 추가</button>
          <button onClick={reload}>↻ 새로고침</button>
        </div>

        <div className="boss-timer-table-wrap">
          <table className="boss-timer-table">
            <thead>
              <tr>
                <th>상태</th>
                <th>알림</th>
                <th>보스 이름</th>
                <th>남은 시간</th>
                <th>등장 시간</th>
                <th>젠 간격</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedBosses.map((b) => {
                const e = editFor(b)
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
                    </td>
                    <td>
                      <div className="remaining-cell">
                        <span className={`remaining ${new Date(b.next_spawn_at).getTime() - now <= 5 * 60000 ? 'soon' : ''}`}>
                          {formatRemaining(b.next_spawn_at, now)}
                        </span>
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
                        </div>
                      </div>
                    </td>
                    <td className="spawn-at">{formatSpawnAt(b.next_spawn_at)}</td>
                    <td>
                      <div className="interval-cell">
                        <input
                          type="number"
                          value={e.intervalHours}
                          onChange={(ev) => updateEdit(b.boss_id, { intervalHours: ev.target.value })}
                        />
                        시
                        <input
                          type="number"
                          value={e.intervalMinutes}
                          onChange={(ev) => updateEdit(b.boss_id, { intervalMinutes: ev.target.value })}
                        />
                        분
                        <button onClick={() => handleSaveInterval(b)}>저장</button>
                      </div>
                    </td>
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
        🔕 꺼진 보스는 화면에는 계속 보이지만 봇에게는 넘어가지 않습니다.
      </p>
    </div>
  )
}
