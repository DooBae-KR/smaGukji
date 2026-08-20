import { useEffect, useState } from 'react'
import {
  assetCount,
  importGeneralsCsv,
  importTacticsCsv,
  syncSheets,
  tacticCompleteness,
} from '../api/endpoints'
import type { SheetSyncResult } from '../api/endpoints'
 import type { Completeness } from '../api/types'

const TACTIC_HEADER =
  'name,category,abilityType,quality,triggerRate,targetCount,source,roleTags,effectText'
const GENERAL_HEADER =
  'name,unitType,camp,dispositions,might,intellect,leadership,initiative,statLevel,signatureTacticName,note'

const TACTIC_SAMPLE = `${TACTIC_HEADER}
강습,액티브,병기,보라,80,1,전수,딜_병기,"일반 공격 후 랜덤 적군 단일에게 이번 공격 80%의 피해를 준다"
기문둔갑,액티브,책략,황금,50,,전수,딜_책략,"1턴 준비 후 전체 적군에게 250%의 책략 피해"`

const GENERAL_SAMPLE = `${GENERAL_HEADER}
관우,기병,후열,병기,257.5,153.5,210.5,200.5,50,화하진압,
전위,창병,전열,방어|병기,245,59,193,169,50,,`

type ImportResult = { updated: number; skipped: number; notFound: string[]; errors: string[] }

export function DataPage() {
  const [completeness, setCompleteness] = useState<Completeness | null>(null)
  const [assets, setAssets] = useState<Record<string, number> | null>(null)
  const [tacticCsv, setTacticCsv] = useState('')
  const [generalCsv, setGeneralCsv] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sync, setSync] = useState<SheetSyncResult | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refresh = () => {
    tacticCompleteness().then(setCompleteness).catch((e) => setError(e.message))
    assetCount().then(setAssets).catch(() => undefined)
  }

  useEffect(refresh, [])

  /** 시트를 다시 읽어 장수·전법을 채운다. 여러 번 눌러도 안전하다. */
  const runSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      setSync(await syncSheets())
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

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
        <strong>구글 시트에서 바로 불러오기</strong>
        <br />
        스프레드시트의 «무장» 시트와 «이름 마스터» 시트를 읽어 장수·전법 데이터를 채웁니다.
        시트를 고친 뒤 아무 때나 다시 눌러도 안전합니다.
        <br />
        <span className="muted">
          이름이 이미 있는 장수만 갱신하고, 모르는 분류 값을 만나면 그 행을 건너뛰고 알려줍니다.
          추측으로 채우지 않습니다.
        </span>
      </div>

      <div className="toolbar">
        <button className="primary" disabled={syncing} onClick={runSync}>
          {syncing ? '불러오는 중…' : '📥 시트에서 장수·전법 불러오기'}
        </button>
        {sync && (
          <span className="muted">
            장수 {sync.general.updated}명 갱신 · 전법 신규 {sync.roster.createdTactics.length}개
          </span>
        )}
      </div>

      {sync && (
        <div className="panel" style={{ background: 'var(--bg-panel-2)', marginBottom: 14 }}>
          <div className="stat-grid">
            <div className="stat">
              <div className="k">무장 시트</div>
              <div className="v">{sync.general.sheetRows}행</div>
            </div>
            <div className="stat">
              <div className="k">장수 갱신</div>
              <div className="v">{sync.general.updated}명</div>
            </div>
            <div className="stat">
              <div className="k">마스터 목록</div>
              <div className="v">
                장수 {sync.roster.sheetGenerals} · 전법 {sync.roster.sheetTactics}
              </div>
            </div>
            <div className="stat">
              <div className="k">전법 신규 생성</div>
              <div className="v">{sync.roster.createdTactics.length}개</div>
            </div>
          </div>

          {sync.warnings.length > 0 && (
            <>
              <h3>확인이 필요한 항목</h3>
              <ul className="findings">
                {sync.warnings.map((w, i) => (
                  <li key={i} className="WARN">
                    <span className="sev">주의</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {sync.warnings.length === 0 && (
            <p className="muted">모든 행이 정상 반영되었습니다.</p>
          )}
        </div>
      )}

      <div className="notice">
        <strong>CSV로 직접 채우기</strong>
        <br />
        시트에 없는 값은 아래 CSV로 넣을 수 있습니다. 전법 상세(분류·발동확률·효과)가
        채워져야 발동 시뮬레이션이 동작합니다.
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
        병종은 <code>방패병 / 창병 / 궁병 / 기병</code>, 진영은 <code>전열 / 균형 / 후열</code> 중 하나입니다.
        <br />
        성향은 여러 개일 수 있어 <code>|</code> 로 구분합니다 (예: <code>방어|병기</code>).
        값은 <code>치유 · 보조 · 방어 · 보조방어 · 문무보조 · 책략 · 병기</code> 입니다.
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
