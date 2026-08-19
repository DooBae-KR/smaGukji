import { useEffect, useState } from 'react'
import {
  assetCount,
  importGeneralsCsv,
  importTacticsCsv,
  tacticCompleteness,
} from '../api/endpoints'
import type { Completeness } from '../api/types'

const TACTIC_HEADER =
  'name,category,abilityType,quality,triggerRate,targetCount,source,roleTags,effectText'
const GENERAL_HEADER =
  'name,unitType,attack,defense,intelligence,command,speed,signatureTacticName,note'

const TACTIC_SAMPLE = `${TACTIC_HEADER}
강습,액티브,병기,보라,80,1,전수,딜_병기,"일반 공격 후 랜덤 적군 단일에게 이번 공격 80%의 피해를 준다"
기문둔갑,액티브,책략,황금,50,,전수,딜_책략,"1턴 준비 후 전체 적군에게 250%의 책략 피해"`

const GENERAL_SAMPLE = `${GENERAL_HEADER}
관우,기병,,,,,,,
장비,창병,,,,,,,`

type ImportResult = { updated: number; skipped: number; notFound: string[]; errors: string[] }

export function DataPage() {
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [assets, setAssets] = useState<Record<string, number> | null>(null)
  const [tacticCsv, setTacticCsv] = useState('')
  const [generalCsv, setGeneralCsv] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    tacticCompleteness().then(setCompleteness).catch((e) => setError(e.message))
    assetCount().then(setAssets).catch(() => undefined)
  }

  useEffect(refresh, [])

  const run = async (fn: () => Promise<ImportResult>) => {
    setBusy(true)
    setError(null)
    try {
      setResult(await fn())
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h2>데이터 입력</h2>

      <div className="notice">
        <strong>왜 비어 있나요?</strong> 장수 이름·세력·코스트는 카드 이미지에서 읽어 채웠지만,
        전법 상세(분류·발동확률·효과)와 장수 병종은 이미지에 없거나 판독이 불가능해 비워두었습니다.
        추측으로 채우면 분석 결과가 그럴듯하게 틀리기 때문에 일부러 넣지 않았습니다.
        아래 CSV로 채우면 그때부터 발동 시뮬레이션이 동작합니다.
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <div className="stat">
          <div className="k">전법 상세 입력률</div>
          <div className={`v ${completeness && completeness.percent < 50 ? 'bad' : ''}`}>
            {completeness ? `${completeness.percent}%` : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="k">입력 완료 / 전체</div>
          <div className="v">
            {completeness ? `${completeness.filled} / ${completeness.total}` : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="k">카드 이미지</div>
          <div className="v">
            {assets ? `${(assets.GENERAL ?? 0) + (assets.TACTIC ?? 0)}장` : '—'}
          </div>
        </div>
      </div>

      <h3>전법 CSV</h3>
      <p className="muted">
        헤더: <code>{TACTIC_HEADER}</code>
        <br />
        이름이 기존 전법과 일치하는 행만 갱신합니다. 빈 칸은 «변경 없음»입니다.
        한글 값(액티브·병기·황금·전수)도 그대로 인식합니다. 여러 태그는 <code>|</code>로 구분하세요.
      </p>
      <textarea
        className="csv"
        value={tacticCsv}
        placeholder={TACTIC_SAMPLE}
        onChange={(e) => setTacticCsv(e.target.value)}
      />
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="primary" disabled={busy || !tacticCsv.trim()} onClick={() => run(() => importTacticsCsv(tacticCsv))}>
          전법 CSV 적용
        </button>
        <button onClick={() => setTacticCsv(TACTIC_SAMPLE)}>예시 채우기</button>
      </div>

      <h3>장수 CSV</h3>
      <p className="muted">
        헤더: <code>{GENERAL_HEADER}</code>
        <br />
        병종은 <code>기병 / 보병 / 궁병 / 창병 / 병기</code> 중 하나입니다.
      </p>
      <textarea
        className="csv"
        value={generalCsv}
        placeholder={GENERAL_SAMPLE}
        onChange={(e) => setGeneralCsv(e.target.value)}
      />
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="primary" disabled={busy || !generalCsv.trim()} onClick={() => run(() => importGeneralsCsv(generalCsv))}>
          장수 CSV 적용
        </button>
        <button onClick={() => setGeneralCsv(GENERAL_SAMPLE)}>예시 채우기</button>
      </div>

      {result && (
        <>
          <h3>적용 결과</h3>
          <div className="stat-grid">
            <div className="stat">
              <div className="k">갱신</div>
              <div className="v">{result.updated}</div>
            </div>
            <div className="stat">
              <div className="k">변경 없음</div>
              <div className="v">{result.skipped}</div>
            </div>
            <div className="stat">
              <div className="k">이름 미발견</div>
              <div className={`v ${result.notFound.length ? 'bad' : ''}`}>{result.notFound.length}</div>
            </div>
            <div className="stat">
              <div className="k">오류</div>
              <div className={`v ${result.errors.length ? 'bad' : ''}`}>{result.errors.length}</div>
            </div>
          </div>
          {result.notFound.length > 0 && (
            <p className="muted">미발견 이름: {result.notFound.join(', ')}</p>
          )}
          {result.errors.length > 0 && (
            <ul className="findings" style={{ marginTop: 8 }}>
              {result.errors.map((e, i) => (
                <li key={i} className="ERROR">
                  <span className="sev">오류</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
