import { useEffect, useMemo, useState } from 'react'
import { listGenerals } from '../api/endpoints'
import type { General } from '../api/types'

/** 전략팀 — 보유 장수 풀의 세력·병종 구성을 집계한다. 전부 실제 DB 값이다. */
export function StrategyPage() {
  const [generals, setGenerals] = useState<General[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listGenerals().then(setGenerals).catch((e) => setError(e.message))
  }, [])

  const stats = useMemo(() => {
    const byFaction = new Map<string, number>()
    const byUnit = new Map<string, number>()
    const byCamp = new Map<string, number>()
    // 성향은 복수라 장수 한 명이 여러 항목에 잡힌다. 합계가 인원수와 다를 수 있다.
    const byDisposition = new Map<string, number>()
    let unitUnknown = 0
    // 등급은 사람이 알려준 것만 채워져 있다. 카드 이미지로는 구분되지 않는다.
    let legend = 0
    let hero = 0

    for (const g of generals) {
      byFaction.set(g.factionLabel, (byFaction.get(g.factionLabel) ?? 0) + 1)
      if (g.unitTypeLabel) byUnit.set(g.unitTypeLabel, (byUnit.get(g.unitTypeLabel) ?? 0) + 1)
      else unitUnknown++
      if (g.campLabel) byCamp.set(g.campLabel, (byCamp.get(g.campLabel) ?? 0) + 1)
      for (const d of g.dispositionLabels) {
        byDisposition.set(d, (byDisposition.get(d) ?? 0) + 1)
      }
      if (g.rarity === 'LEGEND') legend++
      else if (g.rarity === 'HERO') hero++
    }
    const desc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
    return {
      byFaction: desc(byFaction),
      byUnit: desc(byUnit),
      byCamp: desc(byCamp),
      byDisposition: desc(byDisposition),
      unitUnknown,
      classified: generals.filter((g) => g.campLabel).length,
      legend,
      hero,
    }
  }, [generals])

  const max = Math.max(1, ...stats.byFaction.map(([, n]) => n))

  return (
    <div className="panel">
      <h2>전략팀 — 세력 · 병종 구성</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <div className="stat">
          <div className="k">보유 장수</div>
          <div className="v">{generals.length}명</div>
        </div>
        <div className="stat">
          <div className="k">등급</div>
          <div className={`v ${stats.legend + stats.hero === 0 ? 'bad' : ''}`}>
            {stats.legend + stats.hero === 0
              ? '미확인'
              : `전설 ${stats.legend} · 영웅 ${stats.hero}`}
          </div>
        </div>
        <div className="stat">
          <div className="k">분류 입력 완료</div>
          <div className={`v ${stats.classified < generals.length ? 'bad' : ''}`}>
            {stats.classified} / {generals.length}
          </div>
        </div>
        <div className="stat">
          <div className="k">병종 미입력</div>
          <div className={`v ${stats.unitUnknown > 0 ? 'bad' : ''}`}>{stats.unitUnknown}명</div>
        </div>
      </div>

      <h3>진영 분포</h3>
      {stats.byCamp.length === 0 ? (
        <p className="muted">진영이 입력된 장수가 없습니다.</p>
      ) : (
        <table className="data">
          <tbody>
            {stats.byCamp.map(([label, n]) => (
              <tr key={label}>
                <td style={{ width: 60 }}>{label}</td>
                <td style={{ textAlign: 'right' }}>{n}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>성향 분포</h3>
      {stats.byDisposition.length === 0 ? (
        <p className="muted">성향이 입력된 장수가 없습니다.</p>
      ) : (
        <>
          <p className="muted">
            한 장수가 여러 성향을 가질 수 있어 합계가 인원수와 다를 수 있습니다.
          </p>
          <table className="data">
            <tbody>
              {stats.byDisposition.map(([label, n]) => (
                <tr key={label}>
                  <td style={{ width: 90 }}>{label}</td>
                  <td style={{ textAlign: 'right' }}>{n}명</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>세력 분포</h3>
      <table className="data">
        <tbody>
          {stats.byFaction.map(([label, n]) => (
            <tr key={label}>
              <td style={{ width: 60 }}>{label}</td>
              <td style={{ width: 60, textAlign: 'right' }}>{n}명</td>
              <td>
                <div className="bar">
                  <span style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>병종 분포</h3>
      {stats.byUnit.length === 0 ? (
        <p className="muted">
          병종이 한 명도 입력되지 않았습니다. 카드 이미지의 병종 아이콘은 20px 남짓이라 판독하지
          않고 비워둔 값입니다. «데이터» 탭에서 장수 CSV로 채우면 여기에 집계됩니다.
        </p>
      ) : (
        <table className="data">
          <tbody>
            {stats.byUnit.map(([label, n]) => (
              <tr key={label}>
                <td style={{ width: 60 }}>{label}</td>
                <td style={{ textAlign: 'right' }}>{n}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>동세력 3인 편성 가능 여부</h3>
      <p className="muted">
        부대는 장수 3명이므로, 세력별 보유가 3명 이상이면 «PURE» 편성이 가능합니다.
      </p>
      <ul className="findings">
        {stats.byFaction.map(([label, n]) => (
          <li key={label} className={n >= 3 ? 'INFO' : 'WARN'}>
            <span className="sev">{n >= 3 ? '가능' : '부족'}</span>
            <span>
              {label} — {n}명 보유{n >= 3 ? '' : ` (동세력 3인 편성에 ${3 - n}명 부족)`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
