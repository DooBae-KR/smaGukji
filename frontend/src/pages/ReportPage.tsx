import { useEffect, useMemo, useState } from 'react'
import { listGenerals, listTactics } from '../api/endpoints'
import type { General, Tactic } from '../api/types'
import {
  deleteReport,
  generalRecords,
  listReports,
  saveReport,
  uploadImage,
} from '../api/battleReport'
import type { BattleReport, GeneralRecord, ReportGeneral, Side } from '../api/battleReport'
import { draftFromCells, emptyReport } from '../lib/readReport'
import { disposeOcr, readBattleImage } from '../lib/ocr'

/**
 * 전보 화면.
 *
 * <p>게임의 «전투 결과» 화면을 옮겨 적어 <b>승률</b>을 쌓는다. 카드 그림은 두지 않는다.
 * 옮겨 적는 화면이라 한 건을 빨리 넣는 것이 중요하고, 그림은 자리를 크게 먹으면서 입력에
 * 아무 도움이 안 된다. 필요한 것은 장수 이름과 전법 셋뿐이다.
 *
 * <p>전법 세 칸 중 <b>첫 칸이 장수 고유 스킬</b>이다. 게임 결과 화면이 그 순서로 보여준다.
 *
 * <p>발동 횟수·피해량 칸은 두지 않았다. 지금 목표가 승률이라 그것만 받는다. DB 열은 남겨
 * 뒀으므로 나중에 그 숫자까지 모으고 싶어지면 화면만 고치면 된다(마이그레이션이 필요 없다).
 */
export function ReportPage() {
  const [generals, setGenerals] = useState<General[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [report, setReport] = useState<BattleReport>(emptyReport)
  const [reports, setReports] = useState<BattleReport[]>([])
  const [records, setRecords] = useState<GeneralRecord[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 자동 판독이 남긴 «확인해 주세요» 목록 */
  const [warnings, setWarnings] = useState<string[]>([])
  const [reading, setReading] = useState<string | null>(null)

  const reload = async () => {
    const [r, rec] = await Promise.all([listReports(), generalRecords()])
    setReports(r)
    setRecords(rec)
  }

  useEffect(() => {
    Promise.all([listGenerals(), listTactics(), listReports(), generalRecords()])
      .then(([g, t, r, rec]) => {
        setGenerals(g)
        setTactics(t)
        setReports(r)
        setRecords(rec)
      })
      .catch((e) => setError(e.message))
  }, [])

  // 화면을 떠나면 판독기 웹워커를 정리한다. 두고 가면 메모리를 계속 잡고 있다.
  useEffect(() => () => void disposeOcr(), [])

  /**
   * 사진에서 자동으로 읽어 칸을 채운다.
   *
   * <p>브라우저 안에서 판독한다. 실측으로는 <b>전법 1·2칸과 장수 이름, 병력이 잘 잡히고
   * 3칸과 승패 글자는 자주 놓친다.</b> 그래서 채운 뒤 반드시 «확인해 주세요» 를 함께 띄운다.
   * 자동 판독만 믿고 저장하면 틀린 데이터가 조용히 쌓인다.
   */
  const readFromImage = async (picked: File) => {
    setReading('사진을 여는 중…')
    setError(null)
    setWarnings([])
    try {
      const cells = await readBattleImage(picked, setReading)
      const { draft, filled, warnings: w } = draftFromCells(cells, generals, tactics)
      setReport((prev) => ({
        ...draft,
        // 사람이 이미 손댄 값이 있으면 덮어쓰지 않는다.
        ourFormation: prev.ourFormation || draft.ourFormation,
        enemyFormation: prev.enemyFormation || draft.enemyFormation,
      }))
      setWarnings([
        `${filled}칸을 자동으로 채웠습니다. 저장 전에 화면과 대조해 주세요.`,
        ...w,
      ])
    } catch (e) {
      setError(`사진을 읽지 못했습니다: ${(e as Error).message}. 직접 입력해 주세요.`)
    } finally {
      setReading(null)
    }
  }

  const onPickFile = (picked: File | null) => {
    setFile(picked)
    if (picked) void readFromImage(picked)
    else setWarnings([])
  }

  const generalByName = useMemo(() => new Map(generals.map((g) => [g.name, g])), [generals])
  const tacticByName = useMemo(() => new Map(tactics.map((t) => [t.name, t])), [tactics])

  const sideGenerals = (side: Side) =>
    report.generals.filter((g) => g.side === side).sort((a, b) => a.position - b.position)

  const setGeneralName = (side: Side, position: number, name: string) => {
    const picked = generalByName.get(name)
    setReport((prev) => ({
      ...prev,
      generals: prev.generals.map((g) =>
        g.side === side && g.position === position
          ? {
              ...g,
              generalName: name,
              generalId: picked?.id,
              // 첫 칸은 고유 스킬이다. 장수를 고르면 아는 만큼 미리 채워 손이 덜 가게 한다.
              tactics: picked?.signatureTacticName
                ? [
                    {
                      slot: 1,
                      tacticName: picked.signatureTacticName,
                      tacticId: tacticByName.get(picked.signatureTacticName)?.id,
                    },
                    ...g.tactics.filter((t) => t.slot !== 1),
                  ].sort((a, b) => a.slot - b.slot)
                : g.tactics,
            }
          : g,
      ),
    }))
  }

  const setTacticName = (side: Side, position: number, slot: number, name: string) => {
    const picked = tacticByName.get(name)
    setReport((prev) => ({
      ...prev,
      generals: prev.generals.map((g) => {
        if (g.side !== side || g.position !== position) return g
        const rest = g.tactics.filter((t) => t.slot !== slot)
        const next = name ? [...rest, { slot, tacticName: name, tacticId: picked?.id }] : rest
        return { ...g, tactics: next.sort((a, b) => a.slot - b.slot) }
      }),
    }))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const imagePath = file ? await uploadImage(file) : undefined
      await saveReport({ ...report, imagePath })
      await reload()
      setReport(emptyReport())
      setFile(null)
      setMessage('저장했습니다.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteReport(id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const filledGenerals = report.generals.filter((g) => g.generalName.trim() !== '').length
  const ourWins = reports.filter((r) => r.outcome === 'WIN').length
  const decided = reports.filter((r) => r.outcome !== 'DRAW').length

  return (
    <div className="panel">
      <h2>전보</h2>

      <div className="notice">
        게임의 <strong>전투 결과</strong> 화면을 옮겨 적습니다. 장수 이름과 전법 셋만 넣으면
        됩니다 — <strong>전법 1번이 장수 고유 스킬</strong>입니다.
        <br />
        쌓인 승패로 어떤 장수·전법 조합이 실제로 이기는지 계산해 덱 추천에 반영합니다.
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="notice">{message}</div>}
      {reading && <div className="notice">⏳ {reading}</div>}
      {warnings.length > 0 && (
        <div className="notice">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      )}

      {/* --- 결과 · 진형 --- */}
      <div className="report-head">
        <label>
          <span className="muted">승패</span>
          <select
            value={report.outcome}
            onChange={(e) =>
              setReport({ ...report, outcome: e.target.value as BattleReport['outcome'] })
            }
          >
            <option value="WIN">승리</option>
            <option value="LOSS">패배</option>
            <option value="DRAW">무승부</option>
          </select>
        </label>
        <label>
          <span className="muted">아군 진형</span>
          <input
            value={report.ourFormation ?? ''}
            placeholder="안형진"
            onChange={(e) => setReport({ ...report, ourFormation: e.target.value })}
          />
        </label>
        <label>
          <span className="muted">적군 진형</span>
          <input
            value={report.enemyFormation ?? ''}
            placeholder="어린진"
            onChange={(e) => setReport({ ...report, enemyFormation: e.target.value })}
          />
        </label>
        <label>
          <span className="muted">사진 — 올리면 자동으로 읽습니다</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={reading !== null}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {/* --- 양편 --- */}
      <div className="report-board">
        {(['OUR', 'ENEMY'] as Side[]).map((side) => (
          <div key={side} className={`report-side ${side === 'OUR' ? 'ours' : 'theirs'}`}>
            <div className="report-side-head">
              <strong>{side === 'OUR' ? '아군' : '적군'}</strong>
              <span className="muted">
                {side === 'OUR' ? report.ourFormation : report.enemyFormation}
              </span>
            </div>

            {sideGenerals(side).map((g) => (
              <GeneralRow
                key={g.position}
                entry={g}
                generals={generals}
                tactics={tactics}
                onGeneral={(name) => setGeneralName(side, g.position, name)}
                onTactic={(slot, name) => setTacticName(side, g.position, slot, name)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <span className="muted">장수 {filledGenerals}/6</span>
        <div className="spacer" />
        <button className="primary" disabled={busy || filledGenerals === 0} onClick={save}>
          {busy ? '저장 중…' : '전보 저장'}
        </button>
      </div>

      {/* --- 승률 --- */}
      <h3>
        장수별 승률{' '}
        <span className="muted">
          (전보 {reports.length}건 · 승부 난 {decided}건 중 {ourWins}승)
        </span>
      </h3>
      {records.length === 0 ? (
        <p className="muted">
          아직 전보가 없습니다. 몇 건 쌓이면 여기에 장수별 승률이 나옵니다.
        </p>
      ) : (
        <>
          <table className="data">
            <thead>
              <tr>
                <th>장수</th>
                <th style={{ textAlign: 'right' }}>출전</th>
                <th style={{ textAlign: 'right' }}>승</th>
                <th style={{ textAlign: 'right' }}>승률</th>
              </tr>
            </thead>
            <tbody>
              {[...records]
                // 표본이 많은 쪽을 위로. 승률순으로 세우면 «1전 1승 100%» 가 맨 위에 온다.
                .sort((a, b) => b.battles - a.battles || b.wins - a.wins)
                .map((r) => (
                  <tr key={r.generalName}>
                    <td>{r.generalName}</td>
                    <td style={{ textAlign: 'right' }}>{r.battles}</td>
                    <td style={{ textAlign: 'right' }}>{r.wins}</td>
                    <td style={{ textAlign: 'right' }}>
                      {Math.round((r.wins / r.battles) * 100)}%
                      {r.battles < 5 && <span className="muted"> 표본 부족</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="muted">
            <strong>출전 수를 함께 보세요.</strong> 한두 판 이겨서 나온 100%는 승률이라고 할 수
            없습니다. 5전 미만은 «표본 부족»으로 표시하고, 덱 추천에도 반영하지 않습니다.
          </p>
        </>
      )}

      {/* --- 쌓인 전보 --- */}
      <h3>쌓인 전보 ({reports.length})</h3>
      {reports.length === 0 ? (
        <p className="muted">아직 없습니다.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>결과</th>
              <th>아군</th>
              <th>적군</th>
              <th>진형</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td className={r.outcome === 'WIN' ? 'good' : 'bad'}>
                  {r.outcome === 'WIN' ? '승리' : r.outcome === 'LOSS' ? '패배' : '무승부'}
                </td>
                <td>{r.generals.filter((g) => g.side === 'OUR').map((g) => g.generalName).join(', ')}</td>
                <td>{r.generals.filter((g) => g.side === 'ENEMY').map((g) => g.generalName).join(', ')}</td>
                <td className="muted">
                  {[r.ourFormation, r.enemyFormation].filter(Boolean).join(' vs ')}
                </td>
                <td>
                  <button onClick={() => r.id && remove(r.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * 장수 한 줄. 이름 하나 + 전법 셋.
 *
 * <p>세로로 길게 늘어놓지 않고 한 줄에 넣는다. 여섯 명을 옮겨 적어야 하는데 줄이 길어지면
 * 화면을 계속 굴려야 한다.
 */
function GeneralRow({
  entry,
  generals,
  tactics,
  onGeneral,
  onTactic,
}: {
  entry: ReportGeneral
  generals: General[]
  tactics: Tactic[]
  onGeneral: (name: string) => void
  onTactic: (slot: number, name: string) => void
}) {
  return (
    <div className="report-row">
      <select
        className="report-row-general"
        value={entry.generalName}
        onChange={(e) => onGeneral(e.target.value)}
      >
        <option value="">— 장수 {entry.position} —</option>
        {generals.map((g) => (
          <option key={g.id} value={g.name}>
            {g.name}
          </option>
        ))}
      </select>

      {[1, 2, 3].map((slot) => {
        const picked = entry.tactics.find((t) => t.slot === slot)
        return (
          <select
            key={slot}
            value={picked?.tacticName ?? ''}
            disabled={!entry.generalName}
            title={slot === 1 ? '장수 고유 스킬' : undefined}
            onChange={(e) => onTactic(slot, e.target.value)}
          >
            <option value="">{slot === 1 ? '— 고유 스킬 —' : `— 전법 ${slot} —`}</option>
            {tactics.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        )
      })}
    </div>
  )
}
