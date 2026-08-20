import { useCallback, useEffect, useRef, useState } from 'react'
import * as hr from '../../api/hr'
import type { CautionEntry } from '../../api/hr'

/** 주의 화면. 유저를 검색해서 그 사람의 주의 사유 이력을 본다. */
export function CautionBoard({
  allianceId,
  onChanged,
}: {
  /** 조회 결과에서 받은 동맹 id. 실제 접근 가능 여부는 DB 정책이 판단한다. */
  allianceId: string
  onChanged?: () => void
}) {
  const [entries, setEntries] = useState<CautionEntry[]>([])
  const [query, setQuery] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 빠르게 타이핑하면 응답이 순서를 바꿔 도착할 수 있다. 최신 요청 결과만 반영한다.
  const seqRef = useRef(0)

  const reload = useCallback(() => {
    const seq = ++seqRef.current
    setBusy(true)
    hr.listCautions(allianceId, query || undefined, onlyOpen)
      .then((e) => {
        if (seq !== seqRef.current) return
        setEntries(e)
        setError(null)
      })
      .catch((e) => {
        if (seq !== seqRef.current) return
        setError(e.message)
      })
      .finally(() => {
        if (seq === seqRef.current) setBusy(false)
      })
  }, [allianceId, query, onlyOpen])

  // 검색어 입력마다 서버를 때리지 않도록 짧게 지연시킨다.
  useEffect(() => {
    const t = window.setTimeout(reload, 250)
    return () => window.clearTimeout(t)
  }, [reload])

  const resolve = async (noteId: string) => {
    try {
      await hr.resolveCaution(noteId)
      reload()
      // 그리드의 미해제 배지·주의 표시도 함께 갱신한다.
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (noteId: string, reason: string) => {
    // 되돌릴 수 없으므로 한 번 확인한다.
    const preview = reason.length > 30 ? `${reason.slice(0, 30)}…` : reason
    if (!window.confirm(`이 주의 사유를 완전히 삭제할까요?\n\n"${preview}"\n\n되돌릴 수 없습니다.`)) {
      return
    }
    try {
      await hr.deleteCaution(noteId)
      reload()
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="panel">
      <h2>주의 목록</h2>

      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="멤버명 또는 cid 로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="checkline">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          미해제만
        </label>
        <div className="spacer" />
        <span className="muted">{busy ? '조회 중…' : `${entries.length}명`}</span>
      </div>

      {entries.length === 0 && !busy && (
        <p className="muted">
          {query ? '검색 결과가 없습니다.' : '주의 기록이 없습니다. 그리드에서 주의 버튼을 켜면 여기에 쌓입니다.'}
        </p>
      )}

      <div className="caution-list">
        {entries.map((e) => (
          <div key={e.cid} className="caution-card">
            <div className="caution-head">
              <span className="marker-dot" style={{ background: '#e8863a' }} />
              <strong>{e.memberName}</strong>
              <code>{e.cid}</code>
              <div className="spacer" />
              {e.markerEnabled ? (
                <span className="chip on">주의 켜짐</span>
              ) : (
                <span className="chip">주의 꺼짐</span>
              )}
              <span className="chip">미해제 {e.openCount}</span>
            </div>

            <ul className="note-list">
              {e.notes.map((n) => (
                <li key={n.id} className={n.resolved ? 'resolved' : ''}>
                  <div className="note-body">
                    <span className="note-reason">{n.reason}</span>
                    <span className="note-meta">
                      {new Date(n.createdAt).toLocaleString('ko-KR')}
                      {n.createdBy && ` · ${n.createdBy}`}
                      {n.resolved && ' · 해제됨'}
                    </span>
                  </div>
                  <div className="note-actions">
                    {!n.resolved && (
                      <button onClick={() => resolve(n.id)} title="기록은 남기고 해제 처리합니다">
                        해제
                      </button>
                    )}
                    <button
                      className="danger"
                      onClick={() => remove(n.id, n.reason)}
                      title="사유를 완전히 삭제합니다. 되돌릴 수 없습니다"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
