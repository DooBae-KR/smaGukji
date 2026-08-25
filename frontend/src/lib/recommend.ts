import type { OwnedCards } from '../api/collection'
import type { General, Tactic } from '../api/types'
import { perTurnTriggerProbability } from '../api/labels'
import { areTierPartners, resolveAll, tierEvidence } from './tier'
import type { ResolvedTierDeck } from './tier'

/**
 * 덱 편성 추천.
 *
 * <p>«덱 편성» 버튼이 부르는 계산이다. 서버가 아니라 화면에서 돈다. 무료 인스턴스가 잠든
 * 동안에도 편성은 짤 수 있어야 하기 때문이다. 조회는 Supabase, 계산은 Render 라는 원칙에서
 * 이것만 예외로 두는데, 입력이 이미 화면에 다 올라와 있어 서버를 깨울 이유가 없어서다.
 *
 * <p>추천 기준은 지어내지 않았다. 둘을 함께 따른다.
 *
 * <ol>
 *   <li>백엔드 채점표(TeamAnalysisService.score) — 세력 25점, 전법 발동력 15점, 병종 10점.
 *       그래야 여기서 고른 편성이 오른쪽 분석 패널에서도 높게 나온다.
 *   <li>실제 전투 로그에서 읽은 규칙 — 아래 «전투 흐름» 참고.
 * </ol>
 *
 * <h3>전투 흐름 (전투 기록 화면에서 확인)</h3>
 *
 * <p><b>포진</b> 단계가 먼저 있고, 그 다음 턴이 돈다. 포진에서 붙는 강화가 순서대로 이렇다.
 * 공급 수치 → 진형 → 국가(세력) 강화 → 병종 강화 → 병종 보너스 → 병종 진급(특성·정통)
 * → 건물 기술 → 무장 개별 강화 → 병법(전법 획득). 여기서 두 가지가 확인된다.
 *
 * <ul>
 *   <li><b>국가 강화</b>가 부대 전원의 무력·지력·통솔·선공을 한꺼번에 올린다.
 *       세력을 섞으면 이 덩어리를 통째로 잃는다. 채점표가 세력에 25점을 준 이유다.
 *   <li><b>병종 보너스</b>가 같은 병종끼리 주는 피해를 올린다. 병종을 맞추는 값이 여기 있다.
 * </ul>
 *
 * <p>턴마다 맨 앞에 «행동 순서 판단»이 다시 돈다. 순서는 <b>선공</b>이 정한다. 슬롯 번호가
 * 아니다. 그래서 선공은 단순한 스탯이 아니라 «먼저 때리는가»를 가르는 값이라 따로 취급한다.
 *
 * <p>전법은 두 갈래로 들어온다. 장수가 원래 가진 <b>선본</b>과, 편성에서 끼우는 <b>수기</b>다.
 * 로그의 결과 화면을 보면 장수 한 명당 전법 3개가 잡히는데, 고유전법 1 + 장착 2 다.
 * 그래서 고유전법을 또 끼우면 한 칸을 버리는 셈이 된다.
 *
 * <p>전투는 스택이 쌓이며 세지는 구조다. 연전연승 8스택, 세금 과징수 4스택, 구전 5스택처럼
 * 턴이 갈수록 값이 커지는 전법이 실제 피해의 대부분을 냈다. 반대로 «대신 피해를 받습니다»
 * (호위)와 «방어 횟수 1 소모»로 후열을 지키는 장수가 없으면 그 스택이 쌓이기 전에 무너진다.
 * 그래서 한 부대 안에 <b>버티는 쪽과 때리는 쪽</b>이 같이 있어야 한다.
 */

export const TEAM_COUNT = 5
export const SLOT_COUNT = 3
export const TACTICS_PER_SLOT = 2

export interface SlotState {
  generalName: string
  tacticNames: (string | '')[]
}

export function emptySlot(): SlotState {
  return { generalName: '', tacticNames: Array.from({ length: TACTICS_PER_SLOT }, () => '') }
}

export function emptyTeam(): SlotState[] {
  return Array.from({ length: SLOT_COUNT }, emptySlot)
}

export function emptyDeck(): SlotState[][] {
  return Array.from({ length: TEAM_COUNT }, emptyTeam)
}

export interface Recommendation {
  deck: SlotState[][]
  /** 사람이 알아야 할 것. 카드가 모자라 못 채운 자리 같은 것 */
  notes: string[]
  /** 부대별 출처. 티어표에서 가져온 것인지, 우리가 조합한 것인지 */
  sources: (string | null)[]
}

// ---------------------------------------------------------------
// 장수 점수
// ---------------------------------------------------------------

/** 버티는 역할. 호위와 방어 횟수로 후열이 스택을 쌓을 시간을 번다. */
const TANK_DISPOSITIONS = new Set(['DEFENSE', 'SUPPORT_DEFENSE'])
/** 때리는 역할. 실제 피해가 여기서 나온다. */
const DAMAGE_DISPOSITIONS = new Set(['STRATEGY', 'WEAPON', 'CIVIL_MARTIAL'])
/** 살리는 역할. 없어도 되지만 있으면 전투가 길어지고, 길수록 스택이 유리하다. */
const SUPPORT_DISPOSITIONS = new Set(['HEAL', 'SUPPORT', 'SUPPORT_DEFENSE', 'CIVIL_MARTIAL_SUPPORT'])

function hasRole(g: General, roles: Set<string>): boolean {
  return g.dispositions.some((d) => roles.has(d))
}

/**
 * 장수의 세기.
 *
 * <p>비어 있는 수치는 0 으로 «메우지» 않고 그대로 둔다. 추정치를 넣으면 데이터가 없는 장수가
 * 있는 장수보다 앞설 수 있어서다. 대신 수치가 비면 자연히 뒤로 밀린다.
 */
function power(g: General): number {
  const stat = (g.might ?? 0) + (g.intellect ?? 0) + (g.leadership ?? 0)
  // 선공은 값의 폭이 좁아 같은 무게로 더하면 묻힌다. 하지만 턴마다 행동 순서를 정하는
  // 값이라 무시할 수도 없다. 절반만 싣는다.
  return stat + (g.initiative ?? 0) * 0.5 + (g.rarity === 'LEGEND' ? 5 : 0)
}

/** 세력 응집도. 백엔드 배점(PURE 25 / PAIR 14 / SCATTERED 5)과 같은 값이다. */
function factionPoints(gs: General[]): number {
  if (gs.length === 0) return 0
  const counts = new Map<string, number>()
  for (const g of gs) counts.set(g.faction, (counts.get(g.faction) ?? 0) + 1)
  const top = Math.max(...counts.values())
  if (top === gs.length && gs.length >= 2) return 25
  if (top >= 2) return 14
  return 5
}

/** 병종 일관성. 하나라도 미입력이면 백엔드가 이 항목을 아예 채점하지 않으므로 0 이다. */
function unitTypePoints(gs: General[]): number {
  if (gs.length === 0) return 0
  if (gs.some((g) => !g.unitType)) return 0
  return new Set(gs.map((g) => g.unitType)).size === 1 ? 10 : 5
}

/**
 * 티어표가 뒷받침하는 정도.
 *
 * <p>이 항목의 배점이 가장 크다. 수치와 세력만 보면 «세력 통일 + 높은 스탯» 이라는 이유로
 * 실제로는 아무도 안 쓰는 조합이 최상위로 올라온다. 실제로 그렇게 나온 등애·장합·전위
 * 조합은 티어표 22개 덱 어디에도 없다(장합·전위는 한 번도, 등애는 티어 표기가 없는 덱에
 * 한 번). 사람이 붙어 보고 매긴 표가 우리 산수보다 낫다는 뜻이라 그쪽에 무게를 싣는다.
 *
 * <p>다만 «표에 없다 = 나쁘다» 로 깎지는 않는다. 표는 상위권만 적은 것이지 못 쓰는 장수를
 * 적어 둔 목록이 아니다. 표에 있는 쪽에 <b>가산점</b>을 줄 뿐이고, 낼 수 있는 장수가
 * 그것뿐이면 표에 없는 장수로도 부대를 짠다.
 */
function tierPoints(gs: General[]): number {
  let points = 0
  for (const g of gs) {
    const evidence = tierEvidence(g.name)
    if (!evidence) continue
    // 상위 티어일수록 높게. T0.3 이 T1.2 보다 크게 쳐진다.
    points += evidence.bestTier == null ? 4 : Math.max(4, 20 - evidence.bestTier * 12)
  }
  // 같은 덱에 함께 나온 적이 있는 짝은 실제로 맞물려 돌아간다는 증거다.
  for (let i = 0; i < gs.length; i++) {
    for (let j = i + 1; j < gs.length; j++) {
      if (areTierPartners(gs[i].name, gs[j].name)) points += 12
    }
  }
  return points
}

/**
 * 역할 조합.
 *
 * <p>백엔드 채점표에는 없는 항목이다. 전투 로그에서 읽은 것이라 배점을 작게 둔다 —
 * 세력·병종을 뒤집을 만큼 확신할 근거는 아직 없다.
 */
function rolePoints(gs: General[]): number {
  const tank = gs.some((g) => hasRole(g, TANK_DISPOSITIONS))
  const damage = gs.some((g) => hasRole(g, DAMAGE_DISPOSITIONS))
  const support = gs.some((g) => hasRole(g, SUPPORT_DISPOSITIONS))
  return (tank && damage ? 8 : 0) + (support ? 4 : 0)
}

// ---------------------------------------------------------------
// 전법 점수
// ---------------------------------------------------------------

/** 확률 판정 없이 늘 걸려 있는 전법. 발동력 15점을 확실히 가져가는 쪽이다. */
function isAlwaysOn(t: Tactic): boolean {
  return perTurnTriggerProbability(t.category, t.triggerRate) === 1
}

/**
 * 전법의 값어치.
 *
 * <p>발동력 15점이 «매 턴 하나라도 발동할 확률»로 채점되므로 발동확률이 가장 무겁다.
 * 확률을 알 수 없는 전법은 시뮬레이션에서 통째로 제외되니 맨 뒤로 민다.
 */
function tacticValue(t: Tactic): number {
  const p = perTurnTriggerProbability(t.category, t.triggerRate)
  if (p == null) return -1
  const quality = { GOLD: 0.3, PURPLE: 0.2, BLUE: 0.1, GREEN: 0 }[t.quality ?? ''] ?? 0
  // 대상이 많을수록 한 번 발동의 값이 크다. 다만 발동확률을 뒤집을 만큼은 아니다.
  const reach = Math.min(t.targetCount ?? 1, 5) * 0.02
  return p + quality + reach
}

/**
 * 이 장수가 쓰기 좋은 전법인지.
 *
 * <p>로그를 보면 같은 «연전연승»이 마초에게는 무력으로, 주유에게는 지력으로 붙었다.
 * 게임이 알아서 축을 고른다는 뜻이라 큰 손해는 없지만, 그래도 주력 수치에 맞는 계열을
 * 주는 편이 낫다. 그래서 순위를 바꿀 정도가 아닌 작은 가산점으로만 쓴다.
 */
function affinity(g: General, t: Tactic): number {
  if (!t.abilityType) return 0
  const might = g.might ?? 0
  const intellect = g.intellect ?? 0
  const leadership = g.leadership ?? 0
  const best = Math.max(might, intellect, leadership)
  if (best === 0) return 0
  if (best === might && t.abilityType === 'WEAPON') return 0.15
  if (best === intellect && t.abilityType === 'STRATEGY') return 0.15
  if (best === leadership && t.abilityType === 'DEFENSE') return 0.15
  return 0
}

// ---------------------------------------------------------------
// 부대 짜기
// ---------------------------------------------------------------

/**
 * 남은 장수에서 부대 하나를 뽑는다.
 *
 * <p>후보를 «세력+병종이 같은 묶음», «세력만 같은 묶음», «그냥 센 순서» 세 갈래로 만들고
 * 채점표로 견줘 가장 나은 하나를 고른다. 모든 조합을 훑지 않는 이유는, 배점이 세력과 병종
 * 두 축에만 걸려 있어서 그 축으로 묶은 후보 바깥에 더 나은 답이 없기 때문이다.
 */
function pickTeam(pool: General[], maxPower: number): General[] {
  const byPower = [...pool].sort((a, b) => power(b) - power(a))

  const buckets = new Map<string, General[]>()
  const add = (key: string, g: General) => {
    const list = buckets.get(key)
    if (list) list.push(g)
    else buckets.set(key, [g])
  }
  for (const g of byPower) {
    add(`F:${g.faction}`, g)
    if (g.unitType) add(`FU:${g.faction}:${g.unitType}`, g)
  }

  const candidates: General[][] = []
  for (const list of buckets.values()) {
    if (list.length >= SLOT_COUNT) candidates.push(list.slice(0, SLOT_COUNT))
  }

  // 티어표에 나오는 장수끼리 묶은 후보도 함께 올린다. 위 묶음은 «세력·병종» 축으로만
  // 만들어져서, 표에 나오는 장수가 세력 안에서 수치 상위 3인이 아니면 후보에 아예 못 든다.
  const proven = byPower.filter((g) => tierEvidence(g.name))
  if (proven.length >= SLOT_COUNT) {
    candidates.push(proven.slice(0, SLOT_COUNT))
    // 표에서 실제로 함께 나온 짝을 씨앗으로 삼아 부대를 키운다.
    for (const seed of proven.slice(0, 6)) {
      const together = proven.filter(
        (g) => g.id === seed.id || areTierPartners(seed.name, g.name),
      )
      if (together.length >= SLOT_COUNT) candidates.push(together.slice(0, SLOT_COUNT))
    }
  }

  // 어느 세력도 3명이 안 될 때를 위한 마지막 후보. 세력 점수는 잃어도 자리는 채운다.
  candidates.push(byPower.slice(0, SLOT_COUNT))

  const score = (gs: General[]) => {
    // 자리를 못 채우면 채움 배점 35점을 그만큼 잃는다. 이 손해가 세력·병종보다 크다.
    const fill = (gs.length / SLOT_COUNT) * 35
    const strength =
      maxPower > 0 ? (gs.reduce((s, g) => s + power(g), 0) / (maxPower * SLOT_COUNT)) * 30 : 0
    return (
      fill + tierPoints(gs) + factionPoints(gs) + unitTypePoints(gs) + rolePoints(gs) + strength
    )
  }

  let best = candidates[0]
  for (const c of candidates) {
    if (score(c) > score(best)) best = c
  }
  return best
}

/**
 * 부대 안에서 자리를 정한다.
 *
 * <p>행동 순서는 슬롯이 아니라 선공이 정하므로, 이 순서는 화면에서 «누가 주장인가»를
 * 보여주는 뜻만 있다. 가장 센 장수를 대장에 둔다.
 */
function orderSlots(team: General[]): General[] {
  return [...team].sort((a, b) => power(b) - power(a))
}

// ---------------------------------------------------------------
// 전체 편성
// ---------------------------------------------------------------

/**
 * 티어덱을 지금 쓸 수 있는 순서로 세운다.
 *
 * <p>1순위는 <b>티어</b>다. 시트는 실제로 붙어 본 사람들이 매긴 표라, 우리가 수치로 계산한
 * 것보다 낫다. 우리 계산은 티어가 같을 때만 순서를 가른다.
 *
 * <p>2순위가 <b>장수 수치</b>다. 같은 T0.5 라도 내 장수가 더 센 쪽을 앞에 둔다.
 * 여기서 «장수탭 스탯» 이 실제로 쓰인다.
 */
function rankTierDecks(
  candidates: ResolvedTierDeck[],
  maxPower: number,
): ResolvedTierDeck[] {
  const strength = (r: ResolvedTierDeck) =>
    maxPower > 0 && r.generals.length > 0
      ? r.generals.reduce((s, g) => s + power(g), 0) / (maxPower * r.generals.length)
      : 0
  return [...candidates].sort(
    (a, b) => (a.deck.tier ?? 99) - (b.deck.tier ?? 99) || strength(b) - strength(a),
  )
}

/**
 * 5부대를 한 번에 짠다.
 *
 * <p>먼저 <b>시즌2 티어표</b>에서 지금 낼 수 있는 덱을 위 티어부터 가져온다. 그 표는 실제로
 * 붙어 본 결과라 우리가 수치로 짜맞춘 것보다 믿을 만하다. 티어덱으로 채우지 못한 자리만
 * 남은 카드로 직접 조합한다.
 *
 * <p>장수도 전법도 «한 번 쓰면 끝»이다. 같은 카드를 두 부대에 넣을 수 없으므로 배치한 것은
 * 후보에서 곧바로 빼고 다음 부대를 짠다. 그래서 앞 부대가 좋은 카드를 먼저 가져간다 —
 * 1부대가 주력이 되도록 일부러 이 순서로 뒀다.
 */
export function recommendDeck(
  generals: General[],
  tactics: Tactic[],
  owned: OwnedCards,
): Recommendation {
  const notes: string[] = []
  const sources: (string | null)[] = Array.from({ length: TEAM_COUNT }, () => null)

  // 편성은 «가진 것 중에서» 고르는 일이다. 등록이 하나도 없으면 전체를 후보로 삼되 그
  // 사실을 알려준다. 조용히 남의 카드로 짜주면 쓸 수 없는 덱이 나온다.
  let generalPool = generals.filter((g) => owned.generals.has(g.id))
  let tacticPool = tactics.filter((t) => owned.tactics.has(t.id))
  if (generalPool.length === 0) {
    generalPool = [...generals]
    notes.push('보유 장수가 등록되지 않아 전체 장수로 짰습니다. «장수» 버튼에서 가진 카드를 켜주세요.')
  }
  if (tacticPool.length === 0) {
    tacticPool = [...tactics]
    notes.push('보유 전법이 등록되지 않아 전체 전법으로 짰습니다. «전법» 버튼에서 가진 카드를 켜주세요.')
  }

  const maxPower = generalPool.reduce((m, g) => Math.max(m, power(g)), 0)
  const poolIds = new Set(generalPool.map((g) => g.id))

  // --- 1단계: 티어표에서 낼 수 있는 덱을 위 티어부터 ---
  const deck = emptyDeck()
  const usedGeneralIds = new Set<string>()
  const usedTactics = new Set<string>()
  const teams: General[][] = []

  const ranked = rankTierDecks(
    resolveAll(generals, tactics, owned).filter((r) => r.missingGenerals.length === 0),
    maxPower,
  )
  let tierUsed = 0
  for (const entry of ranked) {
    if (teams.length >= TEAM_COUNT) break
    // 이미 다른 부대에 들어간 장수가 하나라도 있으면 이 덱은 못 짠다. 겹치는 자리를
    // 다른 장수로 메우면 그건 더 이상 그 티어덱이 아니다.
    if (entry.generals.some((g) => usedGeneralIds.has(g.id) || !poolIds.has(g.id))) continue

    const slotIndex = teams.length
    entry.generals.forEach((general, si) => {
      usedGeneralIds.add(general.id)
      const picked: string[] = []
      for (const t of entry.tacticsByGeneral[si] ?? []) {
        if (usedTactics.has(t.name) || picked.length >= TACTICS_PER_SLOT) continue
        usedTactics.add(t.name)
        picked.push(t.name)
      }
      deck[slotIndex][si] = {
        generalName: general.name,
        tacticNames: [
          ...picked,
          ...Array.from({ length: TACTICS_PER_SLOT - picked.length }, () => '' as const),
        ],
      }
    })
    sources[slotIndex] = entry.deck.title
    teams.push(entry.generals)
    tierUsed++
  }
  if (tierUsed > 0) {
    notes.push(`시즌2 티어표에서 ${tierUsed}개 부대를 그대로 가져왔습니다.`)
  }
  const tierTeamCount = teams.length

  // --- 2단계: 티어덱을 «부분» 으로라도 살린다 ---
  //
  // 앞 부대가 장수를 가져가면 남은 티어덱은 대부분 한두 명이 겹쳐 통째로는 못 쓴다. 그렇다고
  // 곧장 우리 계산으로 넘어가면 «관우 + 서서 + 관평» 처럼 표에 없는 장수를 세력만 맞춰 붙인
  // 조합이 나온다. 검증된 뼈대 2명을 살리고 한 자리만 메우는 편이 통째로 지어내는 것보다 낫다.
  let remaining = generalPool.filter((g) => !usedGeneralIds.has(g.id))

  for (const entry of ranked) {
    if (teams.length >= TEAM_COUNT || remaining.length === 0) break
    const available = entry.generals.filter((g) => remaining.some((r) => r.id === g.id))
    if (available.length < SLOT_COUNT - 1) continue // 최소 2명은 남아 있어야 «그 덱» 이라 할 수 있다

    const core = available.slice(0, SLOT_COUNT)
    const filled = [...core]
    // 빈 자리는 남은 장수 중 티어표에 나오는 쪽을 먼저, 그중 세력이 맞는 쪽을 먼저 고른다.
    const faction = core[0]?.faction
    const fillers = remaining
      .filter((g) => !filled.some((f) => f.id === g.id))
      .sort((a, b) => {
        const provenDiff = (tierEvidence(b.name) ? 1 : 0) - (tierEvidence(a.name) ? 1 : 0)
        if (provenDiff !== 0) return provenDiff
        const factionDiff = (b.faction === faction ? 1 : 0) - (a.faction === faction ? 1 : 0)
        if (factionDiff !== 0) return factionDiff
        return power(b) - power(a)
      })
    while (filled.length < SLOT_COUNT && fillers.length > 0) filled.push(fillers.shift()!)
    if (filled.length < SLOT_COUNT) continue

    const slotIndex = teams.length
    orderSlots(filled).forEach((general, si) => {
      usedGeneralIds.add(general.id)
      // 뼈대로 남은 장수는 시트에 적힌 전법을 그대로 가져간다. 메운 자리는 비워두고
      // 아래 전법 배치가 채운다.
      const coreIndex = entry.generals.findIndex((g) => g.id === general.id)
      const picked: string[] = []
      for (const t of coreIndex >= 0 ? (entry.tacticsByGeneral[coreIndex] ?? []) : []) {
        if (usedTactics.has(t.name) || picked.length >= TACTICS_PER_SLOT) continue
        usedTactics.add(t.name)
        picked.push(t.name)
      }
      deck[slotIndex][si] = {
        generalName: general.name,
        tacticNames: [
          ...picked,
          ...Array.from({ length: TACTICS_PER_SLOT - picked.length }, () => '' as const),
        ],
      }
    })
    sources[slotIndex] = `${entry.deck.title} (${core.length}/${SLOT_COUNT} 부분)`
    teams.push(orderSlots(filled))
    remaining = remaining.filter((g) => !usedGeneralIds.has(g.id))
  }
  const tierBasedCount = teams.length

  // --- 3단계: 그래도 남으면 직접 조합 ---
  //
  // 여기서 나오는 부대는 «검증된 조합» 이 아니다. 세력·병종·수치로 짜맞춘 것이라 실제로
  // 쓰는 사람이 없는 조합일 수 있다. 그래서 화면에 그렇다고 밝힌다.
  for (let i = teams.length; i < TEAM_COUNT && remaining.length > 0; i++) {
    const picked = orderSlots(pickTeam(remaining, maxPower))
    if (picked.length === 0) break
    teams.push(picked)
    const taken = new Set(picked.map((g) => g.id))
    remaining = remaining.filter((g) => !taken.has(g.id))
  }
  if (teams.length > tierBasedCount) {
    notes.push(
      `${tierBasedCount + 1}부대부터는 티어표에 없는 조합입니다. 세력·병종·수치로 짜맞춘 것이라 ` +
        '실제로 검증된 편성이 아닙니다. 참고용으로만 보세요.',
    )
  }

  const placed = teams.reduce((s, t) => s + t.length, 0)
  const needed = TEAM_COUNT * SLOT_COUNT
  if (placed < needed) {
    notes.push(
      `장수가 ${needed}명 필요한데 ${generalPool.length}명뿐이라 ${needed - placed}자리를 비웠습니다.`,
    )
  }

  // --- 전법 배치 ---
  //
  // 티어표에서 온 전법은 이미 들어가 있다. 그걸 우리 계산으로 덮어쓰면 티어덱이 아니게
  // 되므로 «빈 칸만» 채운다. 부분 티어덱은 뼈대에만 시트 전법이 있고 메운 자리가 비어
  // 있는데, 그 자리가 여기서 채워진다.
  for (let ti = tierTeamCount; ti < teams.length; ti++) {
    const team = teams[ti]
    // 고유전법은 끼우지 않아도 전투에 들어간다(로그의 «선본»). 또 넣으면 한 칸을 버리는
    // 셈이고 분석에서도 «중복 장착» 경고가 뜬다.
    const signatures = new Set(
      team.map((g) => g.signatureTacticName).filter((n): n is string => !!n),
    )

    // 부대마다 상시 전법을 최소 하나 확보한다. 상시 전법이 하나라도 있으면 «매 턴 하나는
    // 발동»이 보장돼 발동력 15점을 온전히 가져간다. 확률 전법만 모으면 운에 맡기게 된다.
    // 이미 들어 있는 전법 중에 상시 전법이 있으면 그 조건은 이미 채워진 것이다.
    let alwaysOnSecured = deck[ti].some((s) =>
      s.tacticNames.some((n) => {
        const t = n ? tacticPool.find((x) => x.name === n) : undefined
        return t ? isAlwaysOn(t) : false
      }),
    )

    for (let si = 0; si < team.length; si++) {
      const general = team[si]
      const existing = deck[ti][si]?.tacticNames ?? []
      const chosen = existing.filter((n): n is string => n !== '')
      if (chosen.length >= TACTICS_PER_SLOT) continue

      const available = tacticPool.filter(
        (t) => !usedTactics.has(t.name) && !signatures.has(t.name),
      )
      const byValue = [...available].sort(
        (a, b) => tacticValue(b) + affinity(general, b) - (tacticValue(a) + affinity(general, a)),
      )

      while (chosen.length < TACTICS_PER_SLOT) {
        const lastChanceForAlwaysOn =
          !alwaysOnSecured && si === team.length - 1 && chosen.length === TACTICS_PER_SLOT - 1

        const next = byValue.find(
          (t) =>
            !usedTactics.has(t.name) && (!lastChanceForAlwaysOn || isAlwaysOn(t)),
        )
        // 상시 전법이 하나도 안 남았으면 그 조건을 포기하고 아무거나 채운다.
        // 자리를 비우는 쪽이 더 나쁘다.
        const pick = next ?? byValue.find((t) => !usedTactics.has(t.name))
        if (!pick) break

        usedTactics.add(pick.name)
        if (isAlwaysOn(pick)) alwaysOnSecured = true
        chosen.push(pick.name)
      }

      deck[ti][si] = {
        generalName: general.name,
        tacticNames: [
          ...chosen,
          ...Array.from({ length: TACTICS_PER_SLOT - chosen.length }, () => '' as const),
        ],
      }
    }
  }

  const tacticsNeeded = placed * TACTICS_PER_SLOT
  const shortfall = tacticsNeeded - usedTactics.size
  if (shortfall > 0) {
    // 원인이 둘이라 구분해서 말한다. 보유가 모자란 것과, 티어표가 같은 전법을 여러 덱에
    // 겹쳐 쓰는데 우리 규칙이 «한 번 쓰면 끝» 인 것은 전혀 다른 문제다.
    notes.push(
      tacticPool.length < tacticsNeeded
        ? `전법이 ${tacticsNeeded}개 필요한데 ${tacticPool.length}개뿐이라 ${shortfall}칸을 비웠습니다.`
        : `전법 ${shortfall}칸이 비었습니다. 티어표가 같은 전법을 여러 덱에 겹쳐 쓰는데 ` +
          '한 전법은 한 곳에만 넣을 수 있어, 뒤 부대에서 그 자리가 남습니다. ' +
          '대체 전법을 참고해 직접 채워주세요.',
    )
  }

  return { deck, notes, sources }
}
