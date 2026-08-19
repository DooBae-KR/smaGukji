import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeDraft, listGenerals, listTactics } from '../api/endpoints'
import { assetImageUrl } from '../api/client'
import type { General, Tactic, TeamAnalysis, TeamRequest } from '../api/types'
import { AnalysisPanel } from '../components/AnalysisPanel'

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

  useEffect(() => {
    Promise.all([listGenerals(), listTactics()])
      .then(([g, t]) => {
        setGenerals(g)
        setTactics(t)
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
          <button
            onClick={() =>
              setSlots(Array.from({ length: SLOT_COUNT }, () => ({ ...EMPTY_SLOT, tacticNames: ['', ''] })))
            }
          >
            초기화
          </button>
        </div>

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
                    {generals.map((g) => (
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
                      {tactics.map((tc) => (
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
    </div>
  )
}
