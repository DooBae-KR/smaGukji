import { useEffect, useState } from 'react'
import { listGenerals, listTactics, tacticCompleteness } from '../api/endpoints'
import type { Completeness, General, Tactic } from '../api/types'

interface Gap {
  label: string
  filled: number
  total: number
  why: string
  unlocks: string
}

/** 기획팀 — 무엇을 먼저 채워야 분석이 정확해지는지 정리한다. */
export function PlanningPage() {
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [generals, setGenerals] = useState<General[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([tacticCompleteness(), listGenerals(), listTactics()])
      .then(([c, g, t]) => {
        setCompleteness(c)
        setGenerals(g)
        setTactics(t)
      })
      .catch((e) => setError(e.message))
  }, [])

  const unitFilled = generals.filter((g) => g.unitTypeLabel).length
  const rateFilled = tactics.filter((t) => t.triggerRate != null).length

  const gaps: Gap[] = [
    {
      label: '전법 분류',
      filled: completeness?.filled ?? 0,
      total: completeness?.total ?? 0,
      why: '분류(지휘/액티브/패시브)를 알아야 확률 판정 대상인지 구분됩니다.',
      unlocks: '발동 시뮬레이션이 켜집니다.',
    },
    {
      label: '전법 발동확률',
      filled: rateFilled,
      total: tactics.length,
      why: '액티브·추격 계열은 발동확률 없이는 기대값을 낼 수 없습니다.',
      unlocks: '턴당 기대 발동 수와 최소 1개 발동 확률이 계산됩니다.',
    },
    {
      label: '장수 병종',
      filled: unitFilled,
      total: generals.length,
      why: '스프레드시트에 채워진 장수만 값이 있습니다. 나머지는 추측하지 않고 비워둔 상태입니다.',
      unlocks: '병종 일관성 채점(10점)과 전략팀 병종 분포가 켜집니다.',
    },
  ]

  const sorted = [...gaps].sort((a, b) => {
    const ar = a.total ? a.filled / a.total : 1
    const br = b.total ? b.filled / b.total : 1
    return ar - br
  })

  return (
    <div className="panel">
      <h2>기획팀 — 데이터 보강 우선순위</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="notice">
        분석 점수의 <strong>confidence</strong> 가 낮은 건 편성이 나쁘다는 뜻이 아니라
        <strong> 채점할 데이터가 없다</strong>는 뜻입니다. 아래를 위에서부터 채우면 신뢰도가 올라갑니다.
      </div>

      {sorted.map((g, i) => {
        const pct = g.total ? Math.round((g.filled / g.total) * 100) : 0
        return (
          <div key={g.label} className="gap-card">
            <div className="gap-head">
              <span className="gap-rank">{i + 1}</span>
              <strong>{g.label}</strong>
              <div className="spacer" />
              <span className={pct < 50 ? 'bad-text' : ''}>
                {g.filled} / {g.total} ({pct}%)
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="muted" style={{ marginBottom: 2 }}>{g.why}</p>
            <p className="muted" style={{ marginTop: 0 }}>
              → 채우면: {g.unlocks}
            </p>
          </div>
        )
      })}

      <h3>지금 할 수 있는 것</h3>
      <ul className="findings">
        <li className="INFO">
          <span className="sev">참고</span>
          <span>
            «데이터» 탭에서 전법 CSV를 붙여넣으면 분류와 발동확률이 한 번에 들어갑니다.
          </span>
        </li>
        <li className="INFO">
          <span className="sev">참고</span>
          <span>
            장수 병종은 같은 탭의 장수 CSV로 채웁니다. 값은 기병 / 보병 / 궁병 / 창병 / 병기 중 하나입니다.
          </span>
        </li>
      </ul>
    </div>
  )
}
