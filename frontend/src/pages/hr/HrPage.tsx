import { useCallback, useEffect, useRef, useState } from 'react'
import * as hr from '../../api/hr'
import type {
  DirectorySnapshot,
  ImportResult,
  LoginResult,
  MarkerCode,
  MarkerMeta,
  MemberRow,
} from '../../api/hr'
import { CautionBoard } from './CautionBoard'
import { CautionModal } from './CautionModal'
import { HrLogin } from './HrLogin'
import { MemberGrid } from './MemberGrid'

type View = 'grid' | 'caution'

/**
 * 인사팀 화면. 세션은 App 이 소유한다.
 * 로그인/로그아웃이 상단 메뉴 구성(관리자 전용 메뉴 노출)에 영향을 주기 때문이다.
 */
export function HrPage({
  session,
  onSession,
}: {
  session: LoginResult | null
  onSession: (s: LoginResult | null) => void
}) {
  const [view, setView] = useState<View>('grid')

  const [server, setServer] = useState('')
  const [alliance, setAlliance] = useState('')
  const [snapshot, setSnapshot] = useState<DirectorySnapshot | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [meta, setMeta] = useState<MarkerMeta[]>([])
  const [busyCid, setBusyCid] = useState<string | null>(null)
  // 업로드 중 버튼을 잠근다. 두 번 눌리면 같은 주차가 동시에 들어와 409 가 난다.
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingCaution, setPendingCaution] = useState<MemberRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    hr.markerMeta()
      .then(setMeta)
      .catch((e) => setError(`마커 설정을 불러오지 못했습니다: ${(e as Error).message}`))
  }, [])

  // 로그인 결과에 동맹 정보가 있으면 조회 폼을 채우고 바로 조회까지 한다.
  useEffect(() => {
    if (session?.server) setServer(session.server)
    if (session?.allianceName) setAlliance(session.allianceName)
  }, [session])

  // 응답이 순서를 바꿔 도착해도 최신 요청 결과만 반영한다.
  const reqSeq = useRef(0)

  const load = useCallback(
    async (date?: string) => {
      if (!server || !alliance) return
      const seq = ++reqSeq.current
      try {
        const s = await hr.loadGrid(server, alliance, date || undefined)
        if (seq !== reqSeq.current) return
        setSnapshot(s)
        setSelectedDate(s.snapshotDate ?? '')
        setError(null)
      } catch (e) {
        if (seq !== reqSeq.current) return
        setError((e as Error).message)
        setSnapshot(null)
      }
    },
    [server, alliance],
  )

  // 세션의 동맹이 채워지면 자동으로 한 번 조회한다.
  // 이게 없으면 앱이 이미 아는 값인데도 사용자가 «조회»를 눌러야 한다.
  const autoLoaded = useRef(false)
  useEffect(() => {
    if (!autoLoaded.current && server && alliance) {
      autoLoaded.current = true
      load()
    }
  }, [server, alliance, load])

  if (!session) {
    return <HrLogin onLoggedIn={onSession} />
  }

  const logout = async () => {
    await hr.logout().catch(() => undefined)
    hr.clearToken()
    onSession(null)
    setSnapshot(null)
  }

  /**
   * 쓰기 작업은 «화면에 실제로 떠 있는» 스냅샷의 동맹으로 보낸다.
   * 입력칸(server/alliance)은 사용자가 언제든 바꿀 수 있어서, 그대로 쓰면
   * 그리드는 A동맹을 보여주는데 마커는 B동맹에 찍히는 사고가 난다.
   */
  const scope = () => ({
    server: snapshot?.server ?? server,
    alliance: snapshot?.allianceName ?? alliance,
  })

  /** 관리자만 동맹을 바꿔가며 볼 수 있다. */
  const canPickAlliance = hr.can.manageSystem(session.role)
  const lockedStyle = { opacity: 0.7, cursor: 'not-allowed' as const }

  const toggle = async (row: MemberRow, code: MarkerCode, next: boolean) => {
    // 사유가 필요한 마커를 «켤» 때만 모달을 띄운다. 끌 때는 사유가 필요 없다.
    const needsReason = meta.find((m) => m.code === code)?.requiresReason ?? false
    if (needsReason && next) {
      setPendingCaution(row)
      return
    }
    const s = scope()
    setBusyCid(row.cid)
    try {
      await hr.toggleMarker(s.server, s.alliance, {
        cid: row.cid,
        markerType: code,
        enabled: next,
      })
      await load(selectedDate)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyCid(null)
    }
  }

  const upload = async (file: File) => {
    // 입력칸이 아니라 세션/스냅샷의 동맹으로 올린다.
    // 입력칸 값을 쓰면 사용자가 고쳐놓은 다른 동맹으로 요청이 가서 거부당한다.
    const s = scope()
    if (!s.server || !s.alliance) {
      setError('서버와 동맹을 먼저 확인하세요.')
      return
    }
    if (uploading) {
      return
    }
    setUploading(true)
    try {
      const r: ImportResult = await hr.importSheet(s.server, s.alliance, file)
      setNotice(
        `${r.snapshotDate} 적재 완료 — ${r.imported}명` +
          (r.replaced > 0 ? ` (기존 ${r.replaced}명 교체)` : '') +
          (r.skipped > 0 ? `, 건너뜀 ${r.skipped}` : '') +
          (r.errors.length ? ` / 오류 ${r.errors.length}건` : ''),
      )
      setError(r.errors.length ? r.errors.join('\n') : null)
      await load(r.snapshotDate)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {/*
            관리자만 다른 동맹을 조회할 수 있다. 간부진은 자기 동맹으로 고정한다.
            열어두면 세션의 동맹과 다른 값을 넣게 되고, 그 상태로 시트를 올리면
            «본인 소속 동맹만 관리할 수 있습니다» 로 거부당한다.
          */}
          <label>
            <span className="field-label">서버</span>
            <input
              value={server}
              readOnly={!canPickAlliance}
              title={canPickAlliance ? '' : '본인 소속 동맹으로 고정됩니다'}
              onChange={(e) => canPickAlliance && setServer(e.target.value)}
              style={{ width: 100, ...(canPickAlliance ? {} : lockedStyle) }}
            />
          </label>
          <label>
            <span className="field-label">동맹</span>
            <input
              value={alliance}
              readOnly={!canPickAlliance}
              title={canPickAlliance ? '' : '본인 소속 동맹으로 고정됩니다'}
              onChange={(e) => canPickAlliance && setAlliance(e.target.value)}
              style={{ width: 150, ...(canPickAlliance ? {} : lockedStyle) }}
            />
          </label>
          <label>
            <span className="field-label">주차</span>
            <select
              value={selectedDate}
              disabled={!snapshot || snapshot.availableDates.length === 0}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                load(e.target.value)
              }}
            >
              {snapshot?.availableDates.length ? (
                snapshot.availableDates.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))
              ) : (
                <option value="">— 없음 —</option>
              )}
            </select>
          </label>

          <button className="primary" disabled={!server || !alliance} onClick={() => load(selectedDate)}>
            조회
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="MemberWeek20260814.xlsx 형식 (파일명에서 기준일을 읽습니다)"
          >
            {uploading ? '업로드 중…' : '시트 업로드'}
          </button>

          <div className="spacer" />
          <span className="muted">{session.displayName} ({hr.ROLE_LABEL[session.role]})</span>
          <button onClick={logout}>로그아웃</button>
        </div>
      </div>

      <nav className="tabs" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={view === 'grid'} onClick={() => setView('grid')}>
          동맹원 그리드
        </button>
        <button role="tab" aria-selected={view === 'caution'} onClick={() => setView('caution')}>
          주의
        </button>
      </nav>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error-box" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}

      {view === 'grid' ? (
        !snapshot ? (
          <div className="panel">
            <p className="muted">
              서버와 동맹을 입력하고 «조회»를 누르세요. 데이터가 없으면
              «시트 업로드»로 <code>MemberWeek20260814.xlsx</code> 를 올리면 됩니다.
              기준일은 파일명에서 자동으로 읽습니다.
            </p>
          </div>
        ) : (
          <div className="panel">
            <h2>
              {snapshot.server} · {snapshot.allianceName}
              {snapshot.snapshotDate && <span className="muted"> — {snapshot.snapshotDate} 기준</span>}
            </h2>
            <MemberGrid snapshot={snapshot} meta={meta} busyCid={busyCid} onToggle={toggle} />
          </div>
        )
      ) : (
        server && alliance && (
          <CautionBoard
            server={scope().server}
            alliance={scope().alliance}
            // 주의를 해제하면 그리드의 미해제 배지도 같이 갱신되어야 한다.
            onChanged={() => load(selectedDate)}
          />
        )
      )}

      {pendingCaution && (
        <CautionModal
          cid={pendingCaution.cid}
          memberName={pendingCaution.memberName}
          onCancel={() => setPendingCaution(null)}
          onSubmit={async (reason) => {
            const s = scope()
            setBusyCid(pendingCaution.cid)
            try {
              await hr.toggleMarker(s.server, s.alliance, {
                cid: pendingCaution.cid,
                markerType: 'CAUTION',
                enabled: true,
                reason,
              })
              setPendingCaution(null)
              await load(selectedDate)
            } finally {
              setBusyCid(null)
            }
          }}
        />
      )}
    </div>
  )
}
