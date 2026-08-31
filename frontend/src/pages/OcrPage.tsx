import { Fragment, useEffect, useMemo, useState } from 'react'
import { listTactics } from '../api/endpoints'
import { readBattleReport } from '../api/ocr'
import { perTurnTriggerProbability } from '../api/labels'
import type { Tactic } from '../api/types'
import { type MatchedLine, parseReport } from '../ocr/parse'
import { aggregate, type Comparison, type ReportSample, type Verdict } from '../ocr/verify'

/** 전보 한 장을 인식한 결과. 사람이 원문과 대조할 수 있도록 텍스트를 들고 있는다. */
interface ReportEntry {
  id: string
  fileName: string
  text: string
  turns: number
  lines: MatchedLine[]
  unmatched: string[]
}

const VERDICT_LABEL: Record<Verdict, string> = {
  OK: '일치',
  HIGH: '실제가 더 높음',
  LOW: '실제가 더 낮음',
  THIN: '표본 부족',
  NO_RATE: '발동확률 미입력',
}

const VERDICT_CLASS: Record<Verdict, string> = {
  OK: '',
  HIGH: 'bad-text',
  LOW: 'bad-text',
  THIN: 'muted',
  NO_RATE: 'muted',
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

/**
 * 전보 검증.
 *
 * <p>전보 스크린샷 여러 장을 올리면, 턴별로 어떤 전법이 발동했는지 읽어 시뮬레이션이
 * 가정하는 발동확률과 맞는지 비교한다. 시뮬레이션(부대 편성 화면의 몬테카를로 계산)이
 * 실제 게임과 맞는지 확인하는 용도다.
 *
 * <p>흐름은 세 단계로 나뉜다.
 * <ol>
 *   <li>인식 — 이미지를 서버로 올려 텍스트를 받는다(NVIDIA 비전 모델, 서버 경유).</li>
 *   <li>해석 — 텍스트에서 턴과 전법 이름을 찾는다({@code ocr/parse.ts}, 오프라인 규칙).</li>
 *   <li>대조 — 여러 전보를 합쳐 시뮬레이션의 발동확률과 비교한다({@code ocr/verify.ts}).</li>
 * </ol>
 * 두 번째·세 번째는 순수 계산이라 전보를 다시 올리지 않아도 즉시 다시 돌릴 수 있다.
 */
export function OcrPage() {
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [reports, setReports] = useState<ReportEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    listTactics().then(setTactics).catch((e) => setError((e as Error).message))
  }, [])

  const tacticRefs = useMemo(
    () => tactics.map((t) => ({ id: t.id, name: t.name })),
    [tactics],
  )

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const text = await readBattleReport(file)
        const parsed = parseReport(text, tacticRefs)
        setReports((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            fileName: file.name,
            text,
            turns: parsed.turns,
            lines: parsed.lines,
            unmatched: parsed.unmatched,
          },
        ])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const removeReport = (id: string) => setReports((prev) => prev.filter((r) => r.id !== id))

  // 전보 목록이나 카드 데이터가 바뀔 때마다 다시 계산한다. 전보를 다시 올릴 필요는 없다.
  const comparisons: Comparison[] = useMemo(() => {
    const samples: ReportSample[] = reports.map((r) => ({
      turns: r.turns,
      triggers: new Map(
        Object.entries(
          r.lines.reduce<Record<string, number>>((acc, line) => {
            if (line.counted && line.tacticId) acc[line.tacticId] = (acc[line.tacticId] ?? 0) + 1
            return acc
          }, {}),
        ),
      ),
    }))
    const rates = tactics.map((t) => ({
      id: t.id,
      name: t.name,
      perTurnRate: perTurnTriggerProbability(t.category ?? null, t.triggerRate ?? null),
    }))
    return aggregate(samples, rates)
  }, [reports, tactics])

  return (
    <div className="panel">
      <h2>전보 검증</h2>
      <div className="notice">
        전보(전투 결과) 스크린샷을 올리면 턴별 전법 발동을 읽어, 편성 화면의 시뮬레이션이
        가정하는 발동확률과 실제가 맞는지 비교합니다.
        <br />
        인식은 서버가 NVIDIA 비전 모델을 대신 불러 처리합니다 — 열쇠가 없으면 관리자에게
        <code>NVIDIA_API_KEY</code> 설정을 요청하세요.
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <label><span className="field-label">전보 스크린샷 업로드 (여러 장 가능)</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <div className="spacer" />
        {busy && <span className="muted">인식 중…</span>}
      </div>

      <h3>올린 전보 ({reports.length})</h3>
      {reports.length === 0 ? (
        <p className="muted">아직 올린 전보가 없습니다.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>파일</th>
              <th>인식된 턴 수</th>
              <th>매칭된 발동 줄</th>
              <th>못 찾은 줄</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>
                    <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {r.fileName}
                    </button>
                  </td>
                  <td>{r.turns || '?'}</td>
                  <td>{r.lines.filter((l) => l.counted).length}</td>
                  <td className={r.unmatched.length > 0 ? 'bad-text' : ''}>
                    {r.unmatched.length > 0 ? `⚠️ ${r.unmatched.length}` : '-'}
                  </td>
                  <td>
                    <button onClick={() => removeReport(r.id)}>삭제</button>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={5}>
                      <div className="ocr-detail">
                        <h4>인식된 원문</h4>
                        <pre className="ocr-raw">{r.text}</pre>
                        <h4>줄별 해석</h4>
                        <ul className="ocr-lines">
                          {r.lines.map((line, i) => (
                            <li key={i} className={line.counted ? undefined : 'muted'}>
                              {line.turn != null ? `[${line.turn}턴] ` : ''}
                              {line.raw}
                              {line.tacticName && (
                                <span className="muted">
                                  {' '}→ {line.tacticName} (일치 {pct(line.score)}
                                  {line.counted ? '' : ', 미집계'})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {r.unmatched.length > 0 && (
                          <>
                            <h4>발동 낱말은 있는데 전법을 못 찾은 줄</h4>
                            <ul className="ocr-lines">
                              {r.unmatched.map((line, i) => (
                                <li key={i} className="bad-text">{line}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <h3>시뮬레이션과 대조</h3>
      {comparisons.length === 0 ? (
        <p className="muted">전보를 올리면 여기에 비교표가 나옵니다.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>전법</th>
              <th>기회(턴)</th>
              <th>실제 발동</th>
              <th>실제 발동률 (95% 구간)</th>
              <th>시뮬레이션 발동률</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.tacticId}>
                <td>{c.tacticName}</td>
                <td>{c.opportunities}</td>
                <td>{c.observed}</td>
                <td>
                  {pct(c.rate)} ({pct(c.low)} ~ {pct(c.high)})
                </td>
                <td>{c.perTurnRate == null ? '-' : pct(c.perTurnRate)}</td>
                <td className={VERDICT_CLASS[c.verdict]}>{VERDICT_LABEL[c.verdict]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
