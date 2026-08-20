import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeDraft, listGenerals, listTactics } from '../api/endpoints'
import { assetImageUrl } from '../api/client'
import { EMPTY_OWNED, loadOwned } from '../api/collection'
import type { OwnedCards } from '../api/collection'
import type { General, Tactic, TeamAnalysis, TeamRequest } from '../api/types'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { CollectionModal } from './CollectionModal'

const SLOT_COUNT = 3
const TACTICS_PER_SLOT = 2

interface SlotState {
  generalName: string
  tacticNames: (string | '')[]
}

const EMPTY_SLOT: SlotState = { generalName: '', tacticNames: ['', ''] }

export function BuilderPage() {
  const [generals, setGenerals] = useState<General[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: SLOT_COUNT }, () => ({ ...EMPTY_SLOT, tacticNames: ['', ''] })),
  )
  const [costLimit, setCostLimit] = useState(15)
  const [turns, setTurns] = useState(8)
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 보유 목록. 등록해 둔 것이 있으면 그것만 고르게 하는 편이 실제 편성에 가깝다.
  const [owned, setOwned] = useState<OwnedCards>(EMPTY_OWNED)
  const [showCollection, setShowCollection] = useState(false)
  const [onlyOwned, setOnlyOwned] = useState(false)

  useEffect(() => {
    Promise.all([listGenerals(), listTactics(), loadOwned()])
      .then(([g, t, o]) => {
        setGenerals(g)
        setTactics(t)
        setOwned(o)
        // 아직 아무것도 등록하지 않았다면 걸러봐야 빈 목록만 나온다.
        // 하나라도 등록해 뒀다면 그걸 쓰려고 등록한 것이므로 기본으로 켠다.
        setOnlyOwned(o.generals.size > 0 || o.tactics.size > 0)
      })
      .catch((e) => setError(e.message))
  }, [])

  const generalByName = useMemo(
    () => new Map(generals.map((g) => [g.name, g])),
    [generals],
  )

  const request: TeamRequest = useMemo(
    () => ({
      name: '편성 미리보기',
      costLimit,
      slots: slots
        .map((s, i) => ({
          position: i + 1,
          generalName: s.generalName,
          tacticNames: s.tacticNames.filter((n): n is string => n !== ''),
        }))
        .filter((s) => s.generalName !== ''),
    }),
    [slots, costLimit],
  )

  // 편성이 바뀔 때마다 서버에 분석을 요청한다. 연타를 막기 위해 짧게 디바운스한다.
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (request.slots.length === 0) {
      setAnalysis(null)
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      analyzeDraft(request, turns)
        .then((a) => {
          setAnalysis(a)
          setError(null)
        })
        .catch((e) => setError(e.message))
    }, 250)
    return () => window.clearTimeout(timer.current)
  }, [request, turns])

  const setSlot = useCallback((index: number, next: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)))
  }, [])

  /** 이미 다른 슬롯에 배치된 장수는 고를 수 없다. 백엔드도 같은 규칙으로 거절한다. */
  const usedGenerals = new Set(slots.map((s) => s.generalName).filter(Boolean))

  /**
   * 선택지를 보유한 것으로 좁힌다.
   *
   * 이미 골라둔 것은 보유 목록에 없더라도 남긴다. 빼버리면 select 가 빈칸이 되어
   * 편성이 조용히 지워진 것처럼 보인다.
   */
  const visibleGenerals = useMemo(() => {
    if (!onlyOwned) return generals
    return generals.filter((g) => owned.generals.has(g.id) || usedGenerals.has(g.name))
    // usedGenerals 는 slots 에서 파생되므로 slots 를 의존성으로 둔다.
  }, [generals, owned, onlyOwned, slots])

  const visibleTactics = useMemo(() => {
    if (!onlyOwned) return tactics
    const picked = new Set(slots.flatMap((s) => s.tacticNames).filter(Boolean))
    return tactics.filter((t) => owned.tactics.has(t.id) || picked.has(t.name))
  }, [tactics, owned, onlyOwned, slots])

  return (
    <div className="builder">
      <div>
        {error && <div className="error-box">{error}</div>}

        <div className="toolbar">
          <label>
            <span className="field-label">코스트 상한</span>
            <input
              type="number"
              value={costLimit}
              min={1}
              max={60}
              step={0.5}
              onChange={(e) => setCostLimit(Number(e.target.value))}
              style={{ width: 90 }}
            />
          </label>
          <label>
            <span className="field-label">시뮬레이션 턴</span>
            <input
              type="number"
              value={turns}
              min={1}
              max={50}
              onChange={(e) => setTurns(Number(e.target.value))}
              style={{ width: 90 }}
            />
          </label>
          <div className="spacer" />
          <label className="checkline" title="등록해 둔 보유 카드만 선택지에 보여줍니다">
            <input
              type="checkbox"
              checked={onlyOwned}
              onChange={(e) => setOnlyOwned(e.target.checked)}
            />
            보유한 것만
          </label>
          <button onClick={() => setShowCollection(true)}>
            📦 보유 등록
            <span className="muted"> ({owned.generals.size + owned.tactics.size})</span>
          </button>
          <button
            onClick={() =>
              setSlots(Array.from({ length: SLOT_COUNT }, () => ({ ...EMPTY_SLOT, tacticNames: ['', ''] })))
            }
          >
            초기화
          </button>
        </div>

        {onlyOwned && owned.generals.size === 0 && (
          <p className="muted">
            보유 장수가 하나도 등록돼 있지 않습니다. «📦 보유 등록» 에서 가진 카드를 켜주세요.
          </p>
        )}

        <div className="slots">
          {slots.map((slot, i) => {
            const general = slot.generalName ? generalByName.get(slot.generalName) : undefined
            return (
              <div key={i} className={`slot ${i === 0 ? 'leader' : ''}`}>
                <div className="slot-head">
                  <span>{i === 0 ? '대장' : `부장 ${i}`}</span>
                  {general && (
                    <span className={`faction-chip faction-${general.faction}`}>
                      {general.factionLabel}
                    </span>
                  )}
                </div>

                {general ? (
                  <img
                    className="card-img"
                    src={assetImageUrl('GENERAL', general.name)}
                    alt={general.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="card-img empty">장수 미선택</div>
                )}

                <div>
                  <span className="field-label">장수</span>
                  <select
                    value={slot.generalName}
                    onChange={(e) => setSlot(i, { generalName: e.target.value })}
                  >
                    <option value="">— 선택 —</option>
                    {visibleGenerals.map((g) => (
                      <option
                        key={g.id}
                        value={g.name}
                        disabled={usedGenerals.has(g.name) && g.name !== slot.generalName}
                      >
                        {g.name} ({g.factionLabel} · {g.cost})
                      </option>
                    ))}
                  </select>
                </div>

                {Array.from({ length: TACTICS_PER_SLOT }, (_, t) => (
                  <div key={t}>
                    <span className="field-label">전법 {t + 1}</span>
                    <select
                      value={slot.tacticNames[t] ?? ''}
                      disabled={!slot.generalName}
                      onChange={(e) => {
                        const next = [...slot.tacticNames]
                        next[t] = e.target.value
                        setSlot(i, { tacticNames: next })
                      }}
                    >
                      <option value="">— 없음 —</option>
                      {visibleTactics.map((tc) => (
                        <option
                          key={tc.id}
                          value={tc.name}
                          disabled={
                            slot.tacticNames.includes(tc.name) && slot.tacticNames[t] !== tc.name
                          }
                        >
                          {tc.name}
                          {tc.dataComplete ? '' : ' (상세 미입력)'}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <AnalysisPanel analysis={analysis} />

      {showCollection && (
        <CollectionModal
          generals={generals}
          tactics={tactics}
          owned={owned}
          onChanged={setOwned}
          onClose={() => setShowCollection(false)}
        />
      )}
    </div>
  )
}
