import type { General, Tactic } from '../api/types'
import type { BattleReport, ReportGeneral, Side } from '../api/battleReport'
import type { BattleCells } from './ocr'

/**
 * 전보 사진에서 읽은 글자를 전보 한 건으로 맞춘다.
 *
 * <p>글자를 읽는 일은 {@link ../lib/ocr} 이 하고, 여기서는 그 결과를 우리가 아는 장수·전법
 * 이름에 맞춰 «전보 초안» 으로 바꾼다. 둘을 나눈 이유는 판독기는 나중에 갈아치울 수 있어도
 * 맞추는 규칙은 그대로 쓰기 때문이다.
 *
 * <h3>화면 구조를 이용한다</h3>
 *
 * <p>실제 판독 결과를 보면 <b>한 줄에 아군과 적군이 함께</b> 들어온다. 게임 화면이 좌우로
 * 나란히 놓여 있어서다. 예를 들어 전법 두 번째 칸은 이렇게 한 줄로 나온다.
 *
 * <pre>연전연승  난공불락  준비 완료        연전연승  난공불락  신의 가호</pre>
 *
 * <p>앞의 셋이 아군 장수 1·2·3, 뒤의 셋이 적군 장수 1·2·3 이다. 장수 이름 줄도 마찬가지다.
 * 그래서 «줄에서 아는 이름을 순서대로 뽑아 앞 셋/뒤 셋으로 나눈다» 는 규칙 하나로 여섯 자리가
 * 한꺼번에 채워진다. 줄을 무시하고 순서대로 3개씩 나눠 담던 예전 방식보다 훨씬 잘 맞는다.
 *
 * <h3>확신이 없으면 비워 둔다</h3>
 *
 * <p>사람이 확인하고 고치는 것을 전제로 만든 화면이라, 애매한 것을 그럴듯하게 채워 넣으면
 * 사람이 그냥 저장해 버린다. 틀린 데이터가 조용히 쌓이는 것이 빈칸이 남는 것보다 훨씬 나쁘다.
 */

export interface ReadResult {
  draft: BattleReport
  /** 자동으로 채운 칸 수 */
  filled: number
  /** 사람이 반드시 확인해야 하는 것 */
  warnings: string[]
}

/** 공백·가운뎃점·마침표를 지우고 견준다. 판독기가 이름 사이에 잡음을 흘린다. */
const norm = (s: string) => s.replace(/[\s·,.'"`|:;~^]/g, '')

/**
 * 한 줄에서 아는 이름을 <b>나온 순서대로</b> 모두 찾는다.
 *
 * <p>판독기는 이름을 자주 잘라 먹는다 — «불굴의 의지» 가 «흘굴의 의» 로, «세금 과징수» 가
 * «세금과징» 으로 나온다. 그래서 완전 일치만 보면 절반을 놓친다. 앞에서부터 훑으며 아는
 * 이름의 «앞부분» 과 겹치는 조각을 찾는다.
 *
 * <p>겹치는 후보가 여럿이면 가장 긴 이름을 고른다. «난공» 이 «난공불락» 과 «난공» 둘 다에
 * 걸릴 때 긴 쪽이 맞다.
 */
/**
 * 두 글자열이 얼마나 닮았는지 0~1 로.
 *
 * <p>공통 부분수열(LCS)의 길이를 짧은 쪽 길이로 나눈다. 판독기가 <b>글자를 바꿔 읽는</b>
 * 것을 견디기 위해서다. 실측에서 «불굴의 의지» 가 «흘굴의 의» 로, «군웅 집결» 이
 * «군응 집결» 로 나왔다. 앞글자부터 맞춰 보는 방식은 첫 글자가 틀리는 순간 무너지지만,
 * 이 방식은 «굴의의» 와 «군집결» 이 남아 있어 알아본다.
 */
function similarity(a: string, b: string): { covered: number; overall: number } {
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  if (short.length === 0) return { covered: 0, overall: 0 }

  // LCS 길이만 필요하므로 한 줄짜리 표만 굴린다.
  let prev = new Array<number>(long.length + 1).fill(0)
  for (let i = 1; i <= short.length; i++) {
    const cur = new Array<number>(long.length + 1).fill(0)
    for (let j = 1; j <= long.length; j++) {
      cur[j] =
        short[i - 1] === long[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  const lcs = prev[long.length]

  // 두 가지로 나눠 본다. 둘 다 필요하다.
  //   covered — 짧은 쪽이 얼마나 덮였나. 판독기가 이름을 잘라 먹어도 알아본다.
  //   overall — 긴 쪽까지 보면 얼마나 맞나. 이게 없으면 «기병 돌격» 이 «철기병 돌격» 과
  //             똑같이 1.0 이 되어 어느 쪽인지 못 고른다(실제로 겪은 문제다).
  return { covered: lcs / short.length, overall: lcs / long.length }
}

/** 잘려 나온 이름을 알아보는 선. 이보다 덜 덮이면 후보로 치지 않는다. */
const SIMILAR_ENOUGH = 0.7

/**
 * 한 줄을 «칸» 으로 쪼갠다.
 *
 * <p>게임 화면이 표라서 칸 사이가 넓게 벌어진다. 판독기도 그 간격을 공백 여러 개로 남긴다.
 * 이 간격으로 쪼개면 칸마다 이름 하나가 들어 있어 견주기가 쉬워진다. 줄 전체에서 이름을
 * 찾으면 옆 칸 글자와 뒤섞여 엉뚱한 이름에 걸린다.
 */
function splitColumns(line: string): { text: string; at: number }[] {
  const out: { text: string; at: number }[] = []
  // 끝의 «\s*» 가 중요하다. 이게 없으면 줄 끝에 공백이 하나라도 붙어 있을 때 마지막 칸이
  // 통째로 사라진다(실측에서 «[ 48.주태 0» 의 주태를 놓쳤다).
  const re = /\S(?:.*?\S)?(?=\s{2,}|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m[0].trim()) out.push({ text: m[0], at: m.index })
  }
  return out
}

/**
 * 한 줄에서 아는 이름을 <b>나온 순서대로</b> 찾는다.
 *
 * <p>칸으로 쪼갠 뒤 칸마다 가장 닮은 이름을 고른다. 숫자와 «×12» 는 이름이 아니므로 먼저
 * 걷어낸다. 어느 이름도 충분히 닮지 않은 칸은 <b>비워 둔다</b> — 억지로 갖다 붙이면 통계가
 * 엉뚱한 장수에게 쌓인다.
 */
function findAllKnown(line: string, names: string[]): { name: string; at: number }[] {
  const keys = names.map((name) => ({ name, key: norm(name) }))
  const kept: { name: string; at: number }[] = []

  for (const column of splitColumns(line)) {
    // 발동 횟수·피해량·잡음을 뗀다. 한글과 숫자 아닌 것만 남긴다.
    const text = norm(column.text.replace(/[×xX※@*]\s*[\d,]+/g, '')).replace(/[^가-힣]/g, '')
    if (text.length < 2) continue

    // 충분히 덮인 후보만 모아 «전체가 얼마나 맞는가» 로 순위를 매긴다.
    const scored: { name: string; overall: number }[] = []
    for (const { name, key } of keys) {
      if (key.length < 2) continue
      const { covered, overall } = similarity(text, key)
      if (covered >= SIMILAR_ENOUGH) scored.push({ name, overall })
    }
    scored.sort((a, b) => b.overall - a.overall)

    const best = scored[0]
    const runnerUp = scored[1]?.overall ?? 0
    // 1등과 2등이 비슷하면 어느 쪽인지 확신할 수 없다. 그럴 때는 비워 둔다 —
    // 억지로 갖다 붙이면 통계가 엉뚱한 전법에 쌓인다.
    if (!best || best.overall - runnerUp < 0.08) continue
    if (kept.some((k) => k.name === best.name)) continue
    kept.push({ name: best.name, at: column.at })
  }

  return kept
}

/** 줄에서 «×12» 를 나온 순서대로. 판독기가 ×를 x·※·＊ 로 흘리기도 한다. */
function findCounts(line: string): number[] {
  return [...line.replace(/,/g, '').matchAll(/[×xX※*]\s*(\d{1,3})/g)].map((m) => Number(m[1]))
}

/**
 * 줄에서 피해·회복 값을 순서대로.
 *
 * <p>화면에서 붉은 숫자가 피해, 초록 숫자가 회복인데 판독기는 색을 모른다. 대신 회복 앞에는
 * 하트가 붙어 «@» 나 «6» 으로 읽히는 일이 많다. 그것만으로는 확신할 수 없어 종류를 나누지 않고
 * 값만 돌려준다 — 어느 쪽인지는 사람이 화면을 보고 정한다.
 */
function findValues(line: string): number[] {
  return [...line.replace(/,/g, '').matchAll(/[×xX※@]\s*(\d{3,7})\b/g)].map((m) => Number(m[1]))
}

/** «0/18364» → [0, 18364] */
function findTroopPairs(line: string): [number, number][] {
  return [...line.replace(/,/g, '').matchAll(/(\d{1,6})\s*\/\s*(\d{3,6})/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ])
}

/**
 * 칸 단위로 읽은 결과를 전보 초안으로.
 *
 * <p>{@link readBattleImage} 가 격자를 따라 칸마다 읽어 오므로 «어느 장수의 몇 번째 전법인가»
 * 가 이미 정해져 있다. 여기서는 판독한 글자를 우리가 아는 이름에 맞추기만 하면 된다.
 * 줄 전체를 읽고 순서로 추측하던 방식과 달리 자리가 어긋날 일이 없다.
 */
export function draftFromCells(
  cells: BattleCells,
  generals: General[],
  tactics: Tactic[],
): ReadResult {
  const generalNames = generals.map((g) => g.name)
  const tacticNames = tactics.map((t) => t.name)
  const generalByName = new Map(generals.map((g) => [g.name, g]))
  const tacticByName = new Map(tactics.map((t) => [t.name, t]))

  const warnings: string[] = []
  let filled = 0

  const reportGenerals: ReportGeneral[] = []
  const missing: string[] = []

  cells.generals.forEach((cell, index) => {
    const side: Side = index < 3 ? 'OUR' : 'ENEMY'
    const position = (index % 3) + 1

    // 이름 앞에 «49» 같은 레벨이 붙는다. 숫자를 떼고 견준다.
    const matched = matchOne(cell.name.replace(/\d+/g, ''), generalNames)
    if (!matched) {
      missing.push(`${side === 'OUR' ? '아군' : '적군'} ${position}번`)
      reportGenerals.push({ side, position, generalName: '', tactics: [] })
      return
    }
    filled++

    const level = cell.name.match(/(\d{2,3})/)?.[1]
    const general = generalByName.get(matched)
    const entry: ReportGeneral = {
      side,
      position,
      generalId: general?.id,
      generalName: matched,
      level: level ? Number(level) : undefined,
      tactics: [],
    }

    cell.tactics.forEach((t, slotIndex) => {
      const name = matchOne(t.name, tacticNames)
      if (!name) return
      const tactic = tacticByName.get(name)
      entry.tactics.push({
        slot: slotIndex + 1,
        tacticId: tactic?.id,
        tacticName: name,
        activations: t.activations,
        // 판독기는 색을 못 본다. 화면에서 붉은 값이 피해, 초록이 회복인데 구분할 수 없으므로
        // 일단 피해로 담는다. 회복인 전법은 사람이 옮겨 주면 된다.
        damage: t.value,
      })
      filled++
    })
    reportGenerals.push(entry)
  })

  if (missing.length > 0) {
    warnings.push(`장수를 못 읽은 자리: ${missing.join(', ')}. 직접 골라주세요.`)
  }
  const tacticCount = reportGenerals.reduce((s, g) => s + g.tactics.length, 0)
  if (tacticCount < 18) {
    warnings.push(`전법 ${tacticCount}/18개를 읽었습니다. 빈 칸을 확인해 주세요.`)
  }

  // --- 진형 ---
  const ourFormation = cells.ourFormation.match(/[가-힣]{1,3}[형자행월린]진/)?.[0]
  const enemyFormation = cells.enemyFormation.match(/[가-힣]{1,3}[형자행월린]진/)?.[0]
  if (ourFormation) filled++
  if (enemyFormation) filled++
  if (!ourFormation || !enemyFormation) {
    warnings.push('진형을 다 읽지 못했습니다. 화면 위쪽의 «○○진» 을 확인해 주세요.')
  }

  // --- 병력 ---
  const ours = findTroopPairs(cells.ourTroops)[0]
  const theirs = findTroopPairs(cells.enemyTroops)[0]
  if (ours) filled++
  if (theirs) filled++

  // --- 승패 ---
  //
  // 화면 한가운데의 «패배/승리» 는 장식이 심한 글씨라 판독이 거의 안 된다(실측에서
  // «까비»·«매직» 으로 나왔다). 대신 병력으로 가린다 — 아군 병력이 0 이면 진 것이다.
  let outcome: BattleReport['outcome'] | undefined
  if (ours && theirs) {
    if (ours[0] === 0 && theirs[0] > 0) outcome = 'LOSS'
    else if (theirs[0] === 0 && ours[0] > 0) outcome = 'WIN'
    if (outcome) {
      warnings.push(
        `승패는 병력으로 «${outcome === 'WIN' ? '승리' : '패배'}» 로 봤습니다. 확인해 주세요.`,
      )
      filled++
    }
  }
  if (!outcome) warnings.push('승패를 읽지 못했습니다. 직접 골라주세요.')

  return {
    draft: {
      outcome: outcome ?? 'LOSS',
      ourFormation,
      enemyFormation,
      ourTroopsLeft: ours?.[0],
      ourTroopsMax: ours?.[1],
      enemyTroopsLeft: theirs?.[0],
      enemyTroopsMax: theirs?.[1],
      generals: reportGenerals,
    },
    filled,
    warnings,
  }
}

/** 글자 하나를 아는 이름 하나에 맞춘다. 확신이 없으면 undefined. */
function matchOne(text: string, names: string[]): string | undefined {
  const found = findAllKnown(text, names)
  return found[0]?.name
}

export function draftFromLines(
  lines: string[],
  generals: General[],
  tactics: Tactic[],
): ReadResult {
  const generalNames = generals.map((g) => g.name)
  const tacticNames = tactics.map((t) => t.name)
  const generalByName = new Map(generals.map((g) => [g.name, g]))
  const tacticByName = new Map(tactics.map((t) => [t.name, t]))

  const warnings: string[] = []
  let filled = 0
  const joined = lines.join(' ')

  // --- 진형 ---
  // «안형진 / 어린진» 처럼 «...진» 으로 끝난다. 화면 맨 위에 아군·적군 것이 차례로 나온다.
  const formations = [...joined.matchAll(/([가-힣]{1,3}[형자행월린]진)/g)].map((m) => m[1])
  const ourFormation = formations[0]
  const enemyFormation = formations.find((f, i) => i > 0 && f !== undefined)
  if (ourFormation) filled++
  if (enemyFormation) filled++
  if (!ourFormation) warnings.push('진형을 읽지 못했습니다. 화면 위쪽의 «○○진» 을 확인해 주세요.')

  // --- 병력 ---
  // 부대 병력은 화면 맨 위 좌우에 있고, 값이 크다(만 단위). 장수 개인 병력(0/6,122)과
  // 섞이지 않도록 «가장 큰 두 개» 를 고른다.
  const pairs = findTroopPairs(joined)
    .filter(([, max]) => max >= 1000)
    .sort((a, b) => b[1] - a[1])
  const ourTroops = pairs[0]
  const enemyTroops = pairs[1]

  // --- 장수 ---
  // 아는 장수가 가장 많이 들어 있는 줄이 이름 띠다. 6명이 한 줄에 오는 것이 정상이지만
  // 판독기가 줄을 나눠 놓을 수도 있어, 3명 이상 잡힌 줄을 위에서부터 모은다.
  const nameHits: string[] = []
  for (const line of lines) {
    const found = findAllKnown(line, generalNames)
    if (found.length < 2) continue
    for (const f of found) {
      if (!nameHits.includes(f.name)) nameHits.push(f.name)
    }
    if (nameHits.length >= 6) break
  }

  const reportGenerals: ReportGeneral[] = []
  const put = (name: string, side: Side, position: number) => {
    const general = generalByName.get(name)
    reportGenerals.push({
      side,
      position,
      generalId: general?.id,
      generalName: name,
      tactics: [],
    })
    filled++
  }
  nameHits.slice(0, 3).forEach((n, i) => put(n, 'OUR', i + 1))
  nameHits.slice(3, 6).forEach((n, i) => put(n, 'ENEMY', i + 1))

  if (nameHits.length < 6) {
    warnings.push(
      `장수를 ${nameHits.length}명만 읽었습니다(6명이어야 합니다). 빠진 자리를 직접 골라주세요.`,
    )
  }

  // --- 전법 ---
  //
  // 전법 이름이 2개 이상 들어 있는 줄을 «칸 한 줄» 로 본다. 그런 줄이 위에서부터 차례로
  // 전법 1칸·2칸·3칸이다. 각 줄에서 앞 셋이 아군, 뒤 셋이 적군이다.
  //
  // 숫자는 이름 줄의 바로 앞줄(발동 횟수)과 바로 뒷줄(누적 피해)에 있다. 이 숫자는 나중에
  // «장수 스탯과 전법으로 피해가 어떻게 정해지는가» 를 역산할 때 쓸 재료라 함께 담는다.
  const tacticRows: { names: string[]; counts: number[]; values: number[] }[] = []
  for (let i = 0; i < lines.length; i++) {
    const found = findAllKnown(lines[i], tacticNames)
    if (found.length < 2) continue
    tacticRows.push({
      names: found.map((f) => f.name),
      counts: findCounts(lines[i - 1] ?? ''),
      values: findValues(lines[i + 1] ?? ''),
    })
    if (tacticRows.length >= 3) break
  }

  tacticRows.forEach((row, slotIndex) => {
    const slot = slotIndex + 1
    row.names.forEach((name, k) => {
      const side: Side = k < 3 ? 'OUR' : 'ENEMY'
      const position = (k % 3) + 1
      const target = reportGenerals.find((g) => g.side === side && g.position === position)
      if (!target || target.tactics.some((t) => t.slot === slot)) return
      const tactic = tacticByName.get(name)
      target.tactics.push({
        slot,
        tacticId: tactic?.id,
        tacticName: name,
        activations: row.counts[k],
        damage: row.values[k],
      })
      filled++
    })
  })

  if (tacticRows.length === 0) {
    warnings.push('전법을 읽지 못했습니다. 직접 골라주세요.')
  } else if (tacticRows.length < 3) {
    warnings.push(`전법 칸 ${tacticRows.length}줄만 읽었습니다(3줄이어야 합니다).`)
  }

  // --- 승패 ---
  //
  // 화면 한가운데의 «패배/승리» 는 장식이 심한 글씨라 판독이 거의 안 된다(실측에서
  // «까비»·«매직» 으로 나왔다). 대신 병력으로 가린다 — 아군 병력이 0 이면 진 것이다.
  // 이것도 확신할 수 없으므로 무엇을 근거로 정했는지 사람에게 알린다.
  let outcome: BattleReport['outcome'] | undefined
  if (/승리/.test(joined)) outcome = 'WIN'
  else if (/패배/.test(joined)) outcome = 'LOSS'

  if (!outcome && ourTroops && enemyTroops) {
    if (ourTroops[0] === 0 && enemyTroops[0] > 0) outcome = 'LOSS'
    else if (enemyTroops[0] === 0 && ourTroops[0] > 0) outcome = 'WIN'
    if (outcome) {
      warnings.push(
        `승패 글자를 읽지 못해 병력으로 «${outcome === 'WIN' ? '승리' : '패배'}» 로 봤습니다. 확인해 주세요.`,
      )
    }
  }
  if (outcome) filled++
  else warnings.push('승패를 읽지 못했습니다. 직접 골라주세요.')

  const draft: BattleReport = {
    outcome: outcome ?? 'LOSS',
    ourFormation,
    enemyFormation,
    ourTroopsLeft: ourTroops?.[0],
    ourTroopsMax: ourTroops?.[1],
    enemyTroopsLeft: enemyTroops?.[0],
    enemyTroopsMax: enemyTroops?.[1],
    generals: reportGenerals,
  }

  return { draft, filled, warnings }
}

/** 빈 전보. 자동 판독을 안 쓰거나 실패했을 때 이걸로 시작한다. */
export function emptyReport(): BattleReport {
  const side = (s: Side): ReportGeneral[] =>
    [1, 2, 3].map((position) => ({ side: s, position, generalName: '', tactics: [] }))
  return { outcome: 'WIN', generals: [...side('OUR'), ...side('ENEMY')] }
}
