import raw from '../generated/tier-decks.json'
import type { General, Tactic } from '../api/types'
import type { OwnedCards } from '../api/collection'

/**
 * 시즌2 티어표.
 *
 * <p>구글 시트의 «시즌2 티어표» 탭을 그대로 옮겨 온 것이다. 시트 CSV 주소는 CORS 를 열어주지
 * 않아 브라우저에서 직접 못 읽고, Render 에 맡기면 무료 인스턴스가 잠든 동안 티어표가 비어
 * 보인다. 그래서 카드 이미지와 같은 방법을 쓴다 — {@code tools/export-tier-decks.js} 가 미리
 * 뽑아 둔 JSON 을 읽는다. 시트가 바뀌면 그 도구를 다시 돌려 커밋한다.
 *
 * <p>티어 숫자는 <b>작을수록 강하다</b>(T0.3 이 T1.2 보다 위). 시트 표기를 그대로 따른다.
 */

export interface TierDeckGeneral {
  name: string
  /** 전법 칸별 후보. 한 칸에 «허점 공략 / 고요한 제압» 처럼 둘이 적힌 경우가 있다 */
  tactics: string[][]
  alternativeTactics: string[]
  /** 시트의 병종 표기. «전직_중방패병» 처럼 앱의 병종 분류보다 잘게 나뉜다 */
  unitType: string
  unitSpecialty: string
  /** 병서 세 줄. 첫 줄이 주 병서, 아래 두 줄이 세부 항목이다 */
  books: string[]
  /** «무력선공» 처럼 어떤 수치를 올리는 장비를 낄지 */
  gearAttribute: string
  gear: string[]
  mount: string[]
  /** 스탯 투자 지침. «선공 230 나머지 무력» 같은 사람 말이라 그대로 보여준다 */
  statPlan: string
}

export interface TierDeck {
  /** 시트에 적힌 원래 제목. «T0.3 쌍방패 초원마» */
  title: string
  name: string
  note: string
  /** 작을수록 강하다. 시트에 표기가 없으면 null */
  tier: number | null
  description: string
  formation: string
  generals: TierDeckGeneral[]
}

export const TIER_DECKS: TierDeck[] = (raw as { decks: TierDeck[] }).decks

/**
 * 시트 이름과 DB 이름을 맞춘다.
 *
 * <p>시트는 사람이 손으로 적은 표라 띄어쓰기가 들쭉날쭉하다 — «요새함락» / «요새 함락»,
 * «청낭치료» / «청낭 치료». 공백을 지우고 견주면 대부분 붙는다. 그래도 안 붙는 것은
 * 조용히 버리지 않고 세어서 화면에 알린다(시트 오타일 수 있다).
 */
function normalize(name: string): string {
  return name.replace(/\s+/g, '')
}

function indexByName<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) map.set(normalize(item.name), item)
  return map
}

export interface ResolvedTierDeck {
  deck: TierDeck
  /** 우리 DB 에서 찾은 장수. 순서는 시트와 같다 */
  generals: General[]
  /** 장수별로 고른 전법. 칸마다 후보 중 우리가 가진 것을 고른다 */
  tacticsByGeneral: Tactic[][]
  /** 시트에 있으나 DB 에 없는 이름 */
  missingGenerals: string[]
  missingTactics: string[]
  /** 보유 목록에 있는 장수 수 */
  ownedGenerals: number
  ownedTactics: number
  /** 이 덱을 지금 그대로 짤 수 있는가 */
  fieldable: boolean
}

/**
 * 티어덱 하나를 우리 데이터에 붙인다.
 *
 * <p>전법 칸에 후보가 여럿이면 <b>보유한 것</b>을 먼저 고른다. 둘 다 없으면 첫 번째를 두고
 * 못 가진 것으로 표시한다. 대체 전법은 여기서 쓰지 않는다 — 사람이 상황을 보고 고르라고
 * 적어둔 것이라 자동으로 바꾸면 시트 작성자의 의도를 넘어선다.
 */
export function resolveTierDeck(
  deck: TierDeck,
  generals: General[],
  tactics: Tactic[],
  owned: OwnedCards,
): ResolvedTierDeck {
  const generalIndex = indexByName(generals)
  const tacticIndex = indexByName(tactics)

  const found: General[] = []
  const missingGenerals: string[] = []
  const missingTactics: string[] = []
  const tacticsByGeneral: Tactic[][] = []
  let ownedGenerals = 0
  let ownedTactics = 0

  for (const entry of deck.generals) {
    const general = generalIndex.get(normalize(entry.name))
    if (!general) {
      missingGenerals.push(entry.name)
      tacticsByGeneral.push([])
      continue
    }
    found.push(general)
    if (owned.generals.has(general.id)) ownedGenerals++

    const picked: Tactic[] = []
    for (const options of entry.tactics) {
      const resolved = options
        .map((n) => tacticIndex.get(normalize(n)))
        .filter((t): t is Tactic => t !== undefined)
      if (resolved.length === 0) {
        missingTactics.push(options[0])
        continue
      }
      // 후보 중 보유한 것 우선. 없으면 첫 번째를 둔다.
      const chosen = resolved.find((t) => owned.tactics.has(t.id)) ?? resolved[0]
      picked.push(chosen)
      if (owned.tactics.has(chosen.id)) ownedTactics++
    }
    tacticsByGeneral.push(picked)
  }

  return {
    deck,
    generals: found,
    tacticsByGeneral,
    missingGenerals,
    missingTactics,
    ownedGenerals,
    ownedTactics,
    fieldable: missingGenerals.length === 0 && ownedGenerals === deck.generals.length,
  }
}

/**
 * 티어표가 그 장수에 대해 말해 주는 것.
 *
 * <p>추천이 «세력 통일 + 높은 수치» 만 보면 실제로는 아무도 안 쓰는 조합이 나온다. 실제로
 * 장합·전위는 티어표 22개 덱 어디에도 없고 등애는 티어 표기조차 없는 덱 하나에만 나오는데,
 * 수치만 보면 상위권이라 추천에 올라왔다. 그래서 «표에 나오는가» 를 근거로 함께 본다.
 *
 * <p>이건 지어낸 규칙이 아니라 실제로 붙어 본 사람들이 남긴 표를 읽은 것이다. 반대로
 * «표에 없다 = 나쁘다» 라고 단정하지도 않는다 — 표에 없는 장수는 가산점이 없을 뿐이고,
 * 낼 수 있는 장수가 그것뿐이면 그대로 쓴다.
 */
export interface TierEvidence {
  /** 이 장수가 나오는 가장 높은 티어(숫자가 작을수록 강함). 표에 없으면 null */
  bestTier: number | null
  /** 표에 나온 횟수 */
  appearances: number
  /** 같은 덱에 함께 나온 장수 이름 */
  partners: Set<string>
}

const EVIDENCE = (() => {
  const map = new Map<string, TierEvidence>()
  for (const deck of TIER_DECKS) {
    for (const entry of deck.generals) {
      const key = normalize(entry.name)
      const cur = map.get(key) ?? { bestTier: null, appearances: 0, partners: new Set<string>() }
      cur.appearances++
      if (deck.tier != null && (cur.bestTier == null || deck.tier < cur.bestTier)) {
        cur.bestTier = deck.tier
      }
      for (const other of deck.generals) {
        if (other.name !== entry.name) cur.partners.add(normalize(other.name))
      }
      map.set(key, cur)
    }
  }
  return map
})()

export function tierEvidence(generalName: string): TierEvidence | undefined {
  return EVIDENCE.get(normalize(generalName))
}

/** 두 장수가 티어표에서 같은 덱에 함께 나온 적이 있는가. */
export function areTierPartners(a: string, b: string): boolean {
  return EVIDENCE.get(normalize(a))?.partners.has(normalize(b)) ?? false
}

export function resolveAll(
  generals: General[],
  tactics: Tactic[],
  owned: OwnedCards,
): ResolvedTierDeck[] {
  return TIER_DECKS.map((d) => resolveTierDeck(d, generals, tactics, owned))
}
