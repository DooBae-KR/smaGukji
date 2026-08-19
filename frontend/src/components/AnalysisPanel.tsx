import type { TeamAnalysis } from '../api/types'

const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: '신뢰도 높음',
  MEDIUM: '신뢰도 보통',
  LOW: '신뢰도 낮음',
}

const SEVERITY_LABEL: Record<string, string> = {
  ERROR: '오류',
  WARN: '주의',
  INFO: '참고',
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

export function AnalysisPanel({ analysis }: { analysis: TeamAnalysis | null }) {
  if (!analysis) {
    return (
      <div className="panel">
        <h2>편성 분석</h2>
        <p className="muted">장수를 배치하면 분석이 표시됩니다.</p>
      </div>
    )
  }

  const { cost, faction, unitType, tactics, simulation } = analysis
  const histogram = Object.entries(simulation.activationHistogram)

  return (
    <div className="panel">
      <h2>편성 분석</h2>

      <div className="score-row">
        <div className="score-big">{analysis.score}</div>
        <div className="grade">{analysis.grade}</div>
        <div className="spacer" />
        <span className={`confidence ${analysis.confidence}`}>
          {CONFIDENCE_LABEL[analysis.confidence]} · 채점 {analysis.scoreCoverage}%
        </span>
      </div>

      {analysis.confidence !== 'HIGH' && (
        <div className="notice">
          이 점수는 채점 항목의 <strong>{analysis.scoreCoverage}%</strong>만 평가한 결과입니다.
          전법 상세와 병종이 비어 있어, 편성의 우열보다 <strong>데이터 입력 상태</strong>를 더 반영합니다.
        </div>
      )}

      <h3>코스트 · 세력</h3>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">코스트</div>
          <div className={`v ${cost.overBudget ? 'bad' : ''}`}>
            {cost.total} / {cost.limit}
          </div>
        </div>
        <div className="stat">
          <div className="k">장수</div>
          <div className="v">{cost.generalCount} / 3</div>
        </div>
        <div className="stat">
          <div className="k">세력</div>
          <div className="v">{faction.dominantFaction ?? '-'}</div>
        </div>
        <div className="stat">
          <div className="k">병종</div>
          <div className="v">
            {unitType.unknownCount > 0 ? `미입력 ${unitType.unknownCount}` : unitType.uniform ? '단일' : '혼성'}
          </div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>{faction.note}</p>

      <h3>전법</h3>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">장착</div>
          <div className="v">
            {tactics.equippedCount} / {tactics.slotCapacity}
          </div>
        </div>
        <div className="stat">
          <div className="k">데이터 입력률</div>
          <div className={`v ${tactics.dataCompleteness < 50 ? 'bad' : ''}`}>
            {tactics.dataCompleteness}%
          </div>
        </div>
        <div className="stat">
          <div className="k">평균 발동확률</div>
          <div className="v">
            {tactics.averageTriggerRate != null ? `${tactics.averageTriggerRate}%` : '—'}
          </div>
        </div>
      </div>

      {tactics.missingDataNames.length > 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          상세 미입력: {tactics.missingDataNames.join(', ')}
        </p>
      )}

      <h3>발동 시뮬레이션 ({simulation.turns}턴)</h3>
      {simulation.evaluatedTactics === 0 ? (
        <p className="muted">
          발동확률이 입력된 전법이 없어 시뮬레이션을 수행하지 못했습니다.
          «데이터» 탭에서 전법 상세를 채우면 계산됩니다.
        </p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="k">턴당 기대 발동</div>
              <div className="v">{simulation.expectedPerTurn.toFixed(2)}회</div>
            </div>
            <div className="stat">
              <div className="k">최소 1개 발동</div>
              <div className="v">{pct(simulation.probAtLeastOne)}</div>
            </div>
            <div className="stat">
              <div className="k">반복</div>
              <div className="v">{simulation.iterations.toLocaleString()}</div>
            </div>
          </div>

          <h3>한 턴 발동 개수 분포</h3>
          <table className="data">
            <thead>
              <tr>
                <th>발동 수</th>
                <th>확률</th>
                <th style={{ width: '45%' }} />
              </tr>
            </thead>
            <tbody>
              {histogram.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}회</td>
                  <td>{pct(v)}</td>
                  <td>
                    <div className="bar">
                      <span style={{ width: `${Math.min(100, v * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>전법별 총 기대 발동</h3>
          <table className="data">
            <tbody>
              {Object.entries(simulation.perTacticExpected).map(([name, v]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td style={{ textAlign: 'right' }}>{v.toFixed(2)}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {analysis.findings.length > 0 && (
        <>
          <h3>지적 사항</h3>
          <ul className="findings">
            {analysis.findings.map((f, i) => (
              <li key={`${f.code}-${i}`} className={f.severity}>
                <span className="sev">{SEVERITY_LABEL[f.severity]}</span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
