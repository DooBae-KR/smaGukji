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

  const { roster, faction, unitType, tactics, simulation, firepower } = analysis
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

      {/*
        장점을 지적 사항보다 «위»에 둔다. 티어덱표를 만들 때 먼저 찾는 것이 «이 덱을 왜 쓰는가»
        인데, 그게 화면 맨 아래 있으면 매번 스크롤해야 한다.
      */}
      {analysis.strengths.length > 0 && (
        <>
          <h3>이 덱의 장점</h3>
          <ul className="strengths">
            {analysis.strengths.map((s) => (
              <li key={s.code}>
                <strong>{s.title}</strong>
                <span>{s.detail}</span>
              </li>
            ))}
          </ul>
          {/*
            티어덱표는 스프레드시트에 옮겨 적는다. 한 줄로 눌러 담은 요약을 같이 두면
            셀 하나에 그대로 붙일 수 있다.
          */}
          <p className="muted copyable">
            시트용 한 줄: {analysis.strengths.map((s) => s.title).join(' · ')}
          </p>
        </>
      )}

      <h3>구성 · 세력</h3>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">장수</div>
          <div className={`v ${roster.generalCount < roster.slotCapacity ? 'bad' : ''}`}>
            {roster.generalCount} / {roster.slotCapacity}
          </div>
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

      {/*
        화력은 «전법 설명문의 만렙 계수 × 수치» 로 구한다. 게임 안의 실제 피해량이 아니라
        덱끼리 견주는 값이라, 숫자 바로 아래 그 사실을 적어둔다. 이 경고가 없으면
        티어표에 «예상 피해» 로 옮겨 적히게 된다.
      */}
      {firepower.countedTactics > 0 && (
        <>
          <h3>화력 지표</h3>
          <div className="stat-grid">
            <div className="stat">
              <div className="k">턴당 피해</div>
              <div className="v">{Math.round(firepower.damagePerTurn).toLocaleString()}</div>
            </div>
            <div className="stat">
              <div className="k">턴당 회복</div>
              <div className="v">{Math.round(firepower.healPerTurn).toLocaleString()}</div>
            </div>
            <div className="stat">
              <div className="k">계수 읽음</div>
              <div className={`v ${firepower.unreadableTactics > 0 ? 'bad' : ''}`}>
                {firepower.countedTactics} / {firepower.countedTactics + firepower.unreadableTactics}
              </div>
            </div>
          </div>

          <table className="data">
            <tbody>
              {Object.entries(firepower.byGeneral)
                .sort((a, b) => b[1] - a[1])
                .map(([name, v]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(v).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p className="muted" style={{ marginTop: 8 }}>
            전법 설명문의 <strong>화살표 뒤 만렙 계수</strong>에 무력(병기)·지력(책략)을 곱하고
            대상 수와 발동확률을 반영한 값입니다. 진형·국가 강화·병종 보너스·회심·상대 통솔
            감쇄는 빠져 있어 <strong>실제 피해량이 아니라 덱끼리 견주는 값</strong>입니다.
          </p>
        </>
      )}

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
              <div className="k">계산</div>
              {/*
                화면에서 도는 계산은 무작위 반복이 아니라 분포를 그대로 구한다.
                장수를 하나 놓을 때마다 숫자가 흔들리면 무엇 때문에 바뀐 것인지 알 수 없다.
              */}
              <div className="v">
                {simulation.method === 'EXACT' || simulation.iterations === 0
                  ? '정확'
                  : `${simulation.iterations.toLocaleString()}회`}
              </div>
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
