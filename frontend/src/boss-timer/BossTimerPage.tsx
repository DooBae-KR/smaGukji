import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from './api'
import type { BossTimerRow, SpawnType } from './api'
import { BOSS_SHEET_CSV_URL, DEFAULT_BOSS_SEED, parseBossSheet } from './sheetImport'
import { getMyEndpoint, getSubscriptionState, subscribeToPush, unsubscribeFromPush } from './webPush'
import { OverlayView } from './OverlayView'
import { drawOverlayFrame } from './mobileOverlayCanvas'
import './boss-timer.css'

/** 데스크톱 크롬(116+)에만 있는 실험적 API. 게임 창 위에 계속 떠 있는 작은 창을 만든다. */
interface DocumentPictureInPictureWindow extends EventTarget {
  document: Document
  close: () => void
}
interface DocumentPictureInPicture {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<DocumentPictureInPictureWindow>
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

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
  return `${sign}${days}일 ${hours}시 ${minutes}분`
}

function formatSpawnAt(nextSpawnAt: string): string {
  const d = new Date(nextSpawnAt)
  return `${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토']

/** 방 slug(URL에 쓰는 영문 이름) 대신 화면에 보여줄 서버 이름. 없는 slug는 그대로 보여준다. */
const ROOM_DISPLAY_NAME: Record<string, string> = {
  hera2: '헤라 2서버',
}
function roomLabel(slug: string): string {
  return ROOM_DISPLAY_NAME[slug] ?? slug
}

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
  const isOverlay = useMemo(() => new URLSearchParams(window.location.search).get('overlay') === '1', [])
  const [pipWindow, setPipWindow] = useState<DocumentPictureInPictureWindow | null>(null)
  const [mobilePipActive, setMobilePipActive] = useState(false)
  const mobilePipCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mobilePipVideoRef = useRef<HTMLVideoElement | null>(null)
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
  const [myEndpoint, setMyEndpoint] = useState<string | null>(null)
  const [myMutes, setMyMutes] = useState<Set<string>>(new Set())
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [showHoursEditor, setShowHoursEditor] = useState(false)
  const [quietStart, setQuietStart] = useState('0')
  const [quietEnd, setQuietEnd] = useState('24')
  const [showLevelEditor, setShowLevelEditor] = useState(false)
  const [levelThreshold, setLevelThreshold] = useState('')
  const [levelApplying, setLevelApplying] = useState(false)

  // 이 화면을 켜놓고 보고 있을 때, 등장 시각이 되면 직접 끄기 전까지 진동+소리를 반복한다.
  // (푸시 알림의 vibrate 패턴은 한 번만 울리고 끝나서 "끄기 전까지 계속" 은 안 됨 — 이건
  // 탭이 열려 있을 때만 동작하는 별도의 보조 알람이다.) 여러 보스가 겹쳐서 동시에 등장하면
  // 알람도 여러 개 겹치는데, 이때 "알람 끄기" 한 번으로 겹친 것 전부를 한꺼번에 끈다.
  const [ringingBosses, setRingingBosses] = useState<BossTimerRow[]>([])
  const alarmIntervalRef = useRef<number | null>(null)
  const alarmAudioCtxRef = useRef<AudioContext | null>(null)
  const dismissedSpawnRef = useRef<Record<string, string>>({})

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current !== null) {
      window.clearInterval(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
    if (alarmAudioCtxRef.current) {
      alarmAudioCtxRef.current.close().catch(() => {})
      alarmAudioCtxRef.current = null
    }
    try {
      navigator.vibrate?.(0)
    } catch {
      // 진동 미지원 기기는 무시
    }
    setRingingBosses((current) => {
      for (const b of current) dismissedSpawnRef.current[b.boss_id] = b.next_spawn_at
      return []
    })
  }, [])

  useEffect(() => {
    // 오버레이(PiP 창/팝업)를 켜놓은 동안은 오버레이 자체가 남은시간을 보여주고 있으니
    // 진동+비프음 알람은 잠깐 꺼둔다. 오버레이를 끄면 다시 정상적으로 울린다.
    if (pipWindow || mobilePipActive) return
    const due = bosses.filter(
      (b) =>
        b.notify_enabled &&
        !myMutes.has(b.boss_id) &&
        new Date(b.next_spawn_at).getTime() <= now &&
        dismissedSpawnRef.current[b.boss_id] !== b.next_spawn_at,
    )
    if (due.length === 0) return

    setRingingBosses((current) => {
      const known = new Set(current.map((b) => b.boss_id))
      const additions = due.filter((b) => !known.has(b.boss_id))
      return additions.length === 0 ? current : [...current, ...additions]
    })

    if (alarmIntervalRef.current !== null) return // 이미 울리는 중이면 인터벌만 계속 쓴다.
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    const beep = () => {
      try {
        navigator.vibrate?.([500, 300])
      } catch {
        // 진동 미지원 기기는 무시
      }
      if (!AudioCtx) return
      try {
        const ctx = alarmAudioCtxRef.current ?? new AudioCtx()
        alarmAudioCtxRef.current = ctx
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        gain.gain.value = 0.2
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
      } catch {
        // 오디오 재생이 막힌 브라우저(자동재생 정책 등)는 진동만으로 대신한다.
      }
    }
    beep()
    alarmIntervalRef.current = window.setInterval(beep, 1200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, bosses, myMutes, pipWindow, mobilePipActive])

  useEffect(() => stopAlarm, [stopAlarm])

  // 오버레이를 켜는 순간 이미 울리고 있던 알람도 즉시 끈다.
  useEffect(() => {
    if (pipWindow || mobilePipActive) stopAlarm()
  }, [pipWindow, mobilePipActive, stopAlarm])

  useEffect(() => {
    if (!pipWindow) return
    return () => pipWindow.close()
  }, [pipWindow])

  // 방 만들기 화면용
  const [createPassword, setCreatePassword] = useState('')
  const [createPollToken, setCreatePollToken] = useState('')
  const [joinRoomInput, setJoinRoomInput] = useState('')

  /** 서버 이름만 알면 URL을 몰라도 그 방으로 바로 들어간다. */
  const goToRoom = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const url = new URL(window.location.href)
    url.searchParams.set('room', trimmed)
    window.location.href = url.toString()
  }

  const stopMobilePip = useCallback(() => {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {})
    }
    const video = mobilePipVideoRef.current
    if (video) {
      const stream = video.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
      video.remove()
      mobilePipVideoRef.current = null
    }
    mobilePipCanvasRef.current = null
    setMobilePipActive(false)
  }, [])

  /**
   * 안드로이드는 임의의 HTML 을 PiP로 못 띄우고 <video> 에 대한 PiP만 지원한다. 그래서
   * 보스 목록을 캔버스에 그림으로 그려서 동영상 스트림으로 바꾼 뒤, 그 동영상에 PiP를
   * 걸어서 "다른 앱 위에 계속 뜨는 작은 창"처럼 우회한다.
   */
  const startMobilePip = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 220
    canvas.height = 240
    drawOverlayFrame(canvas, bosses, now)
    mobilePipCanvasRef.current = canvas

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true') // 구형 iOS 사파리용
    // 화면에 안 보이게 하되, display:none 이면 일부 브라우저가 PiP 를 거부해서 투명하게만 둔다.
    Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none', left: '0', top: '0' })
    document.body.appendChild(video)
    video.srcObject = canvas.captureStream(2)
    mobilePipVideoRef.current = video

    try {
      // iOS(사파리/아이폰의 크롬도 내부는 똑같이 사파리 엔진) 는 video 의 크기 정보(메타데이터)가
      // 준비되기 전에 PiP 를 요청하면 조용히 실패한다. loadedmetadata 를 기다렸다가 요청해야
      // 사용자 클릭으로 시작된 동작으로 인정받는다(안드로이드 크롬은 이 순서 없이도 되지만
      // 똑같이 해도 문제없다).
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true })
          video.addEventListener('error', () => reject(new Error('오버레이 영상 준비 실패')), { once: true })
        })
      }
      await video.play()
      await video.requestPictureInPicture()
      video.addEventListener('leavepictureinpicture', () => stopMobilePip(), { once: true })
      setMobilePipActive(true)
    } catch (err) {
      stopMobilePip()
      setError(
        `오버레이를 시작하지 못했습니다: ${(err as Error).message}` +
          ' (아이폰은 크롬을 설치해도 내부적으로는 사파리와 같은 엔진을 씁니다 — 사파리에서도 안 되면 이 기기는 이 기능 자체를 지원하지 않는 것입니다)',
      )
    }
  }

  useEffect(() => {
    if (!mobilePipActive || !mobilePipCanvasRef.current) return
    drawOverlayFrame(mobilePipCanvasRef.current, bosses, now)
  }, [mobilePipActive, bosses, now])

  useEffect(() => stopMobilePip, [stopMobilePip])

  /**
   * "오버레이" 버튼: 데스크톱 크롬은 Document Picture-in-Picture로 게임 창 위에 계속
   * 떠 있는 작은 창을 만든다(같은 화면 상태를 그대로 그 창에 그려 넣는다, 새로고침 없음).
   * 안드로이드 등 동영상 PiP만 지원하는 브라우저는 캔버스→동영상 우회 방식을 쓴다.
   * 둘 다 안 되면 같은 페이지를 &overlay=1 을 붙여 새 팝업 창으로 띄운다 — 이건
   * "항상 위" 는 아니고 사용자가 직접 배치해야 한다.
   */
  const handleOpenOverlay = async () => {
    if (window.documentPictureInPicture) {
      try {
        const win = await window.documentPictureInPicture.requestWindow({ width: 170, height: 360 })
        win.document.title = '보스 오버레이'
        win.addEventListener('pagehide', () => setPipWindow(null))
        setPipWindow(win)
        return
      } catch (err) {
        setError((err as Error).message)
        return
      }
    }
    if (document.pictureInPictureEnabled) {
      await startMobilePip()
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set('overlay', '1')
    window.open(url.toString(), 'boss-overlay', 'width=300,height=460')
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    getSubscriptionState().then(setPushState)
  }, [])

  // 개인별 "이 보스만 알림 끄기" · "이 시간대에만 알림" 상태. 구독 중일 때만 의미가 있다.
  useEffect(() => {
    if (pushState !== 'subscribed') return
    getMyEndpoint().then((ep) => {
      setMyEndpoint(ep)
      if (!ep) return
      api.getMyMutes(ep).then((ids) => setMyMutes(new Set(ids))).catch(() => {})
      api.getPushHours(ep).then((h) => {
        if (h) {
          setQuietStart(String(h.quiet_start))
          setQuietEnd(String(h.quiet_end))
        }
      }).catch(() => {})
    })
  }, [pushState])

  const handleSaveQuietHours = async () => {
    if (!myEndpoint) {
      setError('먼저 상단의 "🔔 이 폰으로 알림 받기" 를 눌러주세요.')
      return
    }
    const start = Number(quietStart)
    const end = Number(quietEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 24 || end < 0 || end > 24) {
      setError('시간은 0~24 사이의 정수로 입력하세요.')
      return
    }
    try {
      await api.setPushHours(myEndpoint, start, end)
      setShowHoursEditor(false)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleTogglePersonalMute = async (b: BossTimerRow) => {
    if (!myEndpoint) {
      setError('먼저 상단의 "🔔 이 폰으로 알림 받기" 를 눌러주세요.')
      return
    }
    const nowMuted = myMutes.has(b.boss_id)
    try {
      await api.setPushMute(myEndpoint, b.boss_id, !nowMuted)
      setMyMutes((prev) => {
        const next = new Set(prev)
        if (nowMuted) next.delete(b.boss_id)
        else next.add(b.boss_id)
        return next
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  /** 지정한 레벨 이하 보스만 내 폰 알림을 켜고, 그보다 높은 레벨은 끈다(레벨 없는 보스는 그대로 둔다). */
  const handleApplyLevelThreshold = async () => {
    if (!myEndpoint) {
      setError('먼저 상단의 "🔔 이 폰으로 알림 받기" 를 눌러주세요.')
      return
    }
    const threshold = Number(levelThreshold)
    if (!Number.isFinite(threshold)) {
      setError('레벨을 숫자로 입력하세요.')
      return
    }
    setLevelApplying(true)
    try {
      const targets = bosses.filter((b) => b.level != null)
      for (const b of targets) {
        const shouldMute = (b.level as number) > threshold
        if (myMutes.has(b.boss_id) === shouldMute) continue
        await api.setPushMute(myEndpoint, b.boss_id, shouldMute)
      }
      setMyMutes((prev) => {
        const next = new Set(prev)
        for (const b of targets) {
          if ((b.level as number) > threshold) next.add(b.boss_id)
          else next.delete(b.boss_id)
        }
        return next
      })
      setShowLevelEditor(false)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLevelApplying(false)
    }
  }

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

  // 레벨 낮은 순. 레벨이 같으면 등장이 빠른 순으로 정렬한다.
  // "심연의 틈"은 등장 시각이 항상 고정이라 정렬에 안 섞이게 맨 뒤로 뺀다.
  const sortedBosses = useMemo(() => {
    return [...bosses].sort((a, b) => {
      const isFixedA = a.name === '심연의 틈'
      const isFixedB = b.name === '심연의 틈'
      if (isFixedA !== isFixedB) return isFixedA ? 1 : -1
      const levelA = a.level ?? Number.MAX_SAFE_INTEGER
      const levelB = b.level ?? Number.MAX_SAFE_INTEGER
      if (levelA !== levelB) return levelA - levelB
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

  // 오버레이 창(팝업/PiP)은 별도 URL(...&overlay=1)로 자기 자신을 새로 열어서 쓴다.
  // 안드로이드는 이 방식(팝업 창)으로, 데스크톱은 아래 "🪟 오버레이" 버튼이 여는
  // Document Picture-in-Picture 창도 이 컴포넌트를 그대로 재사용한다.
  if (isOverlay) {
    return <OverlayView bosses={bosses} now={now} />
  }

  return (
    <div className="boss-timer-app">
      {ringingBosses.length > 0 && (
        <div className="alarm-banner">
          <span>🔔 {ringingBosses.map((b) => b.name).join(', ')} 등장!</span>
          <button onClick={stopAlarm}>알람 끄기{ringingBosses.length > 1 ? ` (${ringingBosses.length})` : ''}</button>
        </div>
      )}
      <header className="boss-timer-header">
        <h1>⚡ 보스 타이머</h1>
        <span className="boss-timer-room-name">방: {roomLabel(slug)}</span>
        <button className="switch-room" onClick={() => { const n = prompt('들어갈 서버 이름을 입력하세요', slug); if (n) goToRoom(n) }}>
          다른 서버로
        </button>
        <div className="spacer" />
        {pushState === 'subscribed' && (
          <>
            <button className="ok" onClick={handleDisablePush}>🔔 폰 알림 켜짐</button>
            <button onClick={() => setShowHoursEditor((v) => !v)}>🕐 알림 시간대</button>
            <button onClick={() => setShowLevelEditor((v) => !v)}>🎚 레벨 기준 알림</button>
          </>
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
        <button
          onClick={mobilePipActive ? stopMobilePip : handleOpenOverlay}
          disabled={!!pipWindow}
          title="게임/다른 앱 위에 띄워두는 작은 알림 창 (데스크톱 크롬, 안드로이드 크롬 지원)"
        >
          🪟 {pipWindow || mobilePipActive ? '오버레이 켜짐(끄려면 클릭)' : '오버레이'}
        </button>
      </header>

      {pipWindow && createPortal(<OverlayView bosses={bosses} now={now} />, pipWindow.document.body)}

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

      {showHoursEditor && (
        <div className="boss-timer-card install-help">
          <b>이 시간대에만 알림 받기 (내 폰만)</b>
          <p className="muted">
            예: 06 ~ 24 로 두면 새벽 0시~6시에는 보스가 등장해도 알림이 안 옵니다. 0 ~ 24 는 "제한 없음"입니다.
            시작이 종료보다 크면(예: 22 ~ 06) 자정을 넘는 구간으로 처리됩니다.
          </p>
          <p className="muted">
            <b>아이폰</b>도 됩니다 — 데스크톱·안드로이드와 동일하게 여기서 설정하면 됩니다. 다만 아이폰은
            "홈 화면에 추가"로 먼저 알림을 구독해둬야 알림 자체가 오니(iOS 16.4 이상), 아직 안 하셨다면
            위쪽 "📲 홈 화면에 추가" 안내부터 따라 해주세요.
          </p>
          <div className="join-row">
            <input
              type="number"
              min={0}
              max={24}
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
            <span>시 ~</span>
            <input
              type="number"
              min={0}
              max={24}
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
            <span>시</span>
            <button className="primary" onClick={handleSaveQuietHours}>저장</button>
            <button onClick={() => setShowHoursEditor(false)}>닫기</button>
          </div>
        </div>
      )}

      {showLevelEditor && (
        <div className="boss-timer-card install-help">
          <b>레벨 기준으로 알림 받기 (내 폰만)</b>
          <p className="muted">
            예: 30 을 입력하면 레벨 30 이하 보스만 내 폰 알림이 켜지고, 그보다 높은 레벨은 꺼집니다.
            레벨이 없는 보스는 건드리지 않습니다. 적용 후에도 보스별 🔔 버튼으로 개별 조정할 수 있습니다.
          </p>
          <div className="join-row">
            <input
              type="number"
              placeholder="레벨"
              value={levelThreshold}
              onChange={(e) => setLevelThreshold(e.target.value)}
            />
            <span>이하만 알림</span>
            <button className="primary" onClick={handleApplyLevelThreshold} disabled={levelApplying}>
              {levelApplying ? '적용 중…' : '적용'}
            </button>
            <button onClick={() => setShowLevelEditor(false)}>닫기</button>
          </div>
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
            {unlocked ? '✓ 확인됨(관리자)' : '확인'}
          </button>
          {unlocked && (
            <>
              <div className="spacer" />
              <input
                type="password"
                placeholder="비밀번호 변경"
                value={newPassword}
                onChange={(e) => setNewPasswordInput(e.target.value)}
              />
              <button onClick={handleChangePassword}>비밀번호 저장</button>
              <button className="danger" onClick={handleDestroy}>방 폭파</button>
            </>
          )}
        </div>
      </div>

      <div className="boss-timer-card">
        <div className="boss-timer-card-title">📢 공지</div>
        <textarea
          className="boss-timer-notice"
          value={notice}
          onChange={(e) => setNoticeText(e.target.value)}
          readOnly={!unlocked}
          rows={3}
        />
        {unlocked && (
          <div className="boss-timer-card-actions">
            <button className="primary" onClick={handleSaveNotice}>공지 저장</button>
          </div>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="boss-timer-card">
        <div className="boss-timer-toolbar">
          <span className="muted sort-label">레벨 낮은 순</span>
          <div className="spacer" />
          {unlocked && (
            <>
              <button onClick={handleImportSheet} disabled={importing}>
                {importing ? '불러오는 중…' : '📄 시트에서 불러오기'}
              </button>
              <button className="primary" onClick={handleAdd}>+ 보스 추가</button>
            </>
          )}
          <button onClick={reload}>↻ 새로고침</button>
        </div>
        {unlocked && importMsg && <p className="muted import-msg">{importMsg}</p>}

        <div className="boss-timer-table-wrap">
          <table className="boss-timer-table">
            {unlocked ? (
              <colgroup>
                <col className="col-status" />
                <col className="col-name" />
                <col className="col-remaining" />
                <col className="col-spawn-at" />
                <col className="col-delete" />
              </colgroup>
            ) : (
              <colgroup>
                <col className="col-simple" />
              </colgroup>
            )}
            <thead>
              {unlocked ? (
                <tr>
                  <th>상태</th>
                  <th>보스 이름</th>
                  <th>남은 시간</th>
                  <th>등장 시간</th>
                  <th></th>
                </tr>
              ) : (
                <tr>
                  <th>레벨 · 보스 이름 · 알림</th>
                </tr>
              )}
            </thead>
            <tbody>
              {sortedBosses.map((b) => {
                if (!unlocked) {
                  const muted = myMutes.has(b.boss_id)
                  return (
                    <tr key={b.boss_id}>
                      <td data-label="보스">
                        <div className="simple-row">
                          <span className="name-text">
                            {b.level != null && <span className="level-tag">Lv{b.level}</span>}
                            {b.name}
                          </span>
                          <span className={`remaining ${new Date(b.next_spawn_at).getTime() - now <= 5 * 60000 ? 'soon' : ''}`}>
                            {formatRemaining(b.next_spawn_at, now)}
                          </span>
                          <button
                            className={`notify-toggle ${muted ? 'off' : 'on'}`}
                            onClick={() => handleTogglePersonalMute(b)}
                            title="내 폰에서만 이 보스 알림 켜기/끄기"
                          >
                            {muted ? '🔕' : '🔔'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

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
                          title="방 전체 알림 켜기/끄기(관리자)"
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
                  <td colSpan={unlocked ? 5 : 1} className="empty-row">아직 등록된 보스가 없습니다. "+ 보스 추가" 로 시작하세요.</td>
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
