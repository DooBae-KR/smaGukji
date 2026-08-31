/**
 * 전보 OCR 원문 → 턴별 전법 발동 기록.
 *
 * 이 파일에는 브라우저도 OCR 도 없다. 전부 «문자열 → 값» 순수 함수라, 인식이 틀렸을 때
 * 화면을 띄우지 않고 원문만 가지고 규칙을 고쳐볼 수 있다. 전보 문구는 게임 업데이트로
 * 바뀌므로, 바뀌는 부분은 전부 아래 상수에 모아 두었다.
 *
 * ⚠️ 전제: 실제 전보의 정확한 문구를 아직 확인하지 못해, «전법 이름이 적힌 줄 = 그 전법이
 * 발동한 줄» 로 센다. 원문에 발동을 뜻하는 낱말({@link TRIGGER_HINTS})이 한 번이라도
 * 보이면 그 낱말이 있는 줄만 센다(= auto). 실제 문구를 확인하면 상수만 고치면 된다.
 */

/** 이름으로 찾아낼 전법. 화면이 DB 에서 읽어 넘겨준다. */
export interface TacticRef {
  id: string
  name: string
}

/** 턴 머리글. «3턴», «턴 3», «Turn 3», «[3턴]» 을 모두 받는다. */
const TURN_PATTERNS: RegExp[] = [
  /(\d{1,2})\s*턴/,
  /턴\s*[:.]?\s*(\d{1,2})/,
  /turn\s*[:.]?\s*(\d{1,2})/i,
]

/** 이 낱말이 있는 줄만 «발동» 으로 센다. 원문에 하나도 없으면 이 조건을 쓰지 않는다. */
const TRIGGER_HINTS = ['발동', '시전', '사용', '펼쳤', '펼친']

/** 턴 수 상한. 천하결전 전투는 8턴이지만, 잘못 읽은 큰 숫자를 걸러내는 용도로 여유를 둔다. */
const MAX_TURN = 30

export interface MatchedLine {
  /** OCR 이 읽은 줄 그대로. 화면에서 사람이 대조할 수 있어야 한다 */
  raw: string
  /** 이 줄이 속한 턴. 턴 머리글을 아직 못 만났으면 null */
  turn: number | null
  tacticId: string | null
  tacticName: string | null
  /** 이름이 얼마나 맞았는지. 1 이면 글자가 그대로 맞았다 */
  score: number
  /** 발동으로 셌는지. 이름은 찾았지만 힌트 낱말이 없으면 false */
  counted: boolean
}

export interface ParsedReport {
  /** 원문에서 읽어낸 마지막 턴. 턴 머리글이 없으면 0 */
  turns: number
  lines: MatchedLine[]
  /** 전법 id → 발동 줄 수 */
  triggers: Map<string, number>
  /** 힌트 낱말이 있는데 전법을 못 찾은 줄. 규칙을 고칠 단서가 된다 */
  unmatched: string[]
  /** 힌트 낱말로 걸러냈는지. 화면에서 «어떻게 셌는지» 를 알려주기 위해 남긴다 */
  usedHints: boolean
}

export interface ParseOptions {
  /**
   * 발동 낱말이 있는 줄만 셀지.
   *   'auto'(기본) 원문에 낱말이 보이면 쓰고, 없으면 안 쓴다
   *   true         항상 쓴다 — 문구를 아는 경우
   *   false        쓰지 않는다 — 이름만 보고 센다
   */
  requireHint?: 'auto' | boolean
  /** 이름이 이만큼은 맞아야 같은 전법으로 본다(0~1). 낮추면 오인식이 늘어난다 */
  minScore?: number
}

const DEFAULT_MIN_SCORE = 0.72

/**
 * 비교용으로 다듬는다.
 *
 * <p>OCR 은 띄어쓰기와 문장부호를 제멋대로 넣는다. 「청룡 언월도」 와 「청룡언월도」 가
 * 다른 이름이 되면 안 되므로, 한글·영숫자만 남기고 전부 버린다.
 */
export function normalize(text: string): string {
  return text.replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase()
}

/** 편집 거리. 이름이 짧아 O(nm) 로 충분하다. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    prev = curr.slice()
  }
  return prev[b.length]
}

/** 이름이 줄 안에 얼마나 맞아 들어가는지(0~1). 글자가 그대로 들어 있으면 1. */
export function matchScore(normalizedLine: string, normalizedName: string): number {
  if (normalizedName.length === 0) return 0
  if (normalizedLine.includes(normalizedName)) return 1

  // 줄 전체와 재는 것이 아니라, 이름 길이만 한 창을 밀어가며 가장 잘 맞는 자리를 찾는다.
  // 줄 전체와 비교하면 «누가 무엇을 발동했다» 같은 나머지 글자 때문에 항상 멀어진다.
  const width = normalizedName.length
  if (normalizedLine.length < width) {
    return 1 - editDistance(normalizedLine, normalizedName) / width
  }

  let best = 0
  // 창 길이를 이름 ±1 로 둔다. OCR 이 글자를 하나 더 넣거나 빠뜨리는 일이 잦다.
  for (const w of [width - 1, width, width + 1]) {
    if (w <= 0) continue
    for (let i = 0; i + w <= normalizedLine.length; i++) {
      const window = normalizedLine.slice(i, i + w)
      const score = 1 - editDistance(window, normalizedName) / width
      if (score > best) best = score
      if (best === 1) return 1
    }
  }
  return best
}

interface Candidate {
  tactic: TacticRef
  score: number
}

/** 줄 하나에서 가장 그럴듯한 전법 하나. 없으면 null. */
export function bestMatch(line: string, tactics: TacticRef[], minScore: number): Candidate | null {
  const normalized = normalize(line)
  if (normalized.length < 2) return null

  let best: Candidate | null = null
  for (const tactic of tactics) {
    const name = normalize(tactic.name)
    // 두 글자 이름은 아무 줄에나 걸린다. 정확히 들어 있을 때만 인정한다.
    if (name.length < 3) {
      if (normalized.includes(name)) return { tactic, score: 1 }
      continue
    }
    const score = matchScore(normalized, name)
    if (score >= minScore && (best === null || score > best.score)) {
      best = { tactic, score }
    }
  }
  return best
}

/** 턴 머리글이면 그 번호. 아니면 null. */
export function readTurn(line: string): number | null {
  for (const pattern of TURN_PATTERNS) {
    const m = pattern.exec(line)
    if (!m) continue
    const turn = Number(m[1])
    if (turn >= 1 && turn <= MAX_TURN) return turn
  }
  return null
}

function hasHint(line: string): boolean {
  return TRIGGER_HINTS.some((hint) => line.includes(hint))
}

/**
 * OCR 원문을 턴별 발동 기록으로 바꾼다.
 *
 * <p>같은 줄에 같은 전법이 두 번 나와도 한 번으로 센다. OCR 이 한 줄을 겹쳐 읽는 일이
 * 있어서, 그것까지 세면 발동 수가 부풀려진다.
 */
export function parseReport(
  text: string,
  tactics: TacticRef[],
  options: ParseOptions = {},
): ParsedReport {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)

  const requireHint = options.requireHint ?? 'auto'
  const usedHints = requireHint === 'auto' ? rawLines.some(hasHint) : requireHint

  const lines: MatchedLine[] = []
  const triggers = new Map<string, number>()
  const unmatched: string[] = []
  let turn: number | null = null
  let maxTurn = 0

  for (const raw of rawLines) {
    const readAt = readTurn(raw)
    if (readAt !== null) {
      turn = readAt
      maxTurn = Math.max(maxTurn, readAt)
    }

    const hinted = hasHint(raw)
    const match = bestMatch(raw, tactics, minScore)

    if (!match) {
      // 발동 줄처럼 보이는데 이름을 못 찾았다면, 규칙이나 인식이 틀린 것이다. 남겨서 보여준다.
      if (hinted) unmatched.push(raw)
      continue
    }

    const counted = usedHints ? hinted : true
    if (counted) {
      triggers.set(match.tactic.id, (triggers.get(match.tactic.id) ?? 0) + 1)
    }

    lines.push({
      raw,
      turn,
      tacticId: match.tactic.id,
      tacticName: match.tactic.name,
      score: match.score,
      counted,
    })
  }

  return { turns: maxTurn, lines, triggers, unmatched, usedHints }
}
