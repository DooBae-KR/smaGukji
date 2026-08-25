import type { General, Tactic, TeamAnalysis } from '../api/types'
import {
  FACTION_LABEL,
  TACTIC_CATEGORY_LABEL,
  TACTIC_QUALITY_LABEL,
  UNIT_TYPE_LABEL,
  label,
  perTurnTriggerProbability,
} from '../api/labels'
import type { SlotState } from './recommend'
import { tacticPower } from './effect'

/**
 * 편성 분석. 화면에서 돈다.
 *
 * <p>예전에는 이 계산을 Render 의 {@code POST /api/teams/analyze} 가 했다. 그런데 무료
 * 인스턴스는 유휴 15분 뒤 잠들고 깨는 데 수십 초가 걸린다. 편성 화면은 장수를 한 명 놓을
 * 때마다 분석을 부르므로, 그 화면을 여는 것만으로 서버를 깨우게 된다. 무중단이 최우선이면
 * 편성 화면은 Render 를 아예 부르지 않아야 한다.
 *
 * <p>그래서 조회(Supabase) · 카드 이미지(정적 파일) · 분석(여기) 셋만으로 편성 화면이
 * 완결된다. Render 는 시트 파싱과 저장처럼 «버튼을 눌러서 하는 일» 에만 남는다.
 *
 * <p>⚠️ 채점 규칙은 백엔드 {@code TeamAnalysisService} 와 «반드시» 같아야 한다. 저장된 부대를
 * 서버가 분석할 때 다른 점수가 나오면 어느 쪽이 맞는지 알 수 없게 된다. 바꿀 일이 생기면
 * 양쪽을 함께 고친다.
 *   backend/src/main/java/com/smagukji/backend/service/analysis/TeamAnalysisService.java
 *
 * <p>한 가지는 일부러 다르게 했다. 서버는 몬테카를로로 발동을 흉내 내지만 여기서는 <b>정확히</b>
 * 계산한다. 전법이 최대 9개뿐이라 분포를 그냥 구할 수 있고, 무작위를 쓰면 장수를 하나 놓을
 * 때마다 숫자가 미세하게 흔들려 «내가 바꾼 것 때문인지» 알 수 없게 되기 때문이다.
 */

const MAX_SLOTS = 3
const MAX_TACTICS_PER_SLOT = 2

/** 백엔드 채점표의 만점. coverage 계산의 분모다. */
const FULL_WEIGHT = 100

function round(value: number, scale: number): number {
  const f = 10 ** scale
  return Math.round(value * f) / f
}

interface ResolvedSlot {
  general: General
  /** 장착한 전법. 고유전법은 여기 들어가지 않는다 */
  tactics: Tactic[]
}

/** 이름으로 짜인 편성을 실제 카드로 바꾼다. 모르는 이름은 조용히 버린다. */
function resolve(
  slots: SlotState[],
  generalByName: Map<string, General>,
  tacticByName: Map<string, Tactic>,
): ResolvedSlot[] {
  const out: ResolvedSlot[] = []
  for (const slot of slots) {
    const general = slot.generalName ? generalByName.get(slot.generalName) : undefined
    if (!general) continue
    const tactics = slot.tacticNames
      .filter((n): n is string => n !== '')
      .map((n) => tacticByName.get(n))
      .filter((t): t is Tactic => t !== undefined)
    out.push({ general, tactics })
  }
  return out
}

/**
 * 채점에 들어가는 전법 전체.
 *
 * <p>고유전법은 장착하지 않아도 전투에 들어간다(전투 로그의 «선본»). 백엔드
 * {@code collectTactics} 도 같은 규칙이라 여기서도 더한다.
 */
function collectTactics(slots: ResolvedSlot[], tacticByName: Map<string, Tactic>): Tactic[] {
  const out: Tactic[] = []
  for (const slot of slots) {
    const signature = slot.general.signatureTacticName
      ? tacticByName.get(slot.general.signatureTacticName)
      : undefined
    if (signature) out.push(signature)
    out.push(...slot.tactics)
  }
  return out
}

// ---------------------------------------------------------------
// 발동 분포 — 정확 계산
// ---------------------------------------------------------------

/**
 * 서로 다른 확률을 가진 전법들이 한 턴에 몇 개나 발동하는지의 분포.
 *
 * <p>포아송 이항분포다. 앞에서부터 전법을 하나씩 더하며 «지금까지 k개 발동할 확률»을
 * 갱신한다. 전법이 아홉 개를 넘지 않으므로 이 정도 계산은 즉시 끝난다.
 */
function activationDistribution(probs: number[]): number[] {
  let dist = [1]
  for (const p of probs) {
    const next = new Array<number>(dist.length + 1).fill(0)
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p)
      next[k + 1] += dist[k] * p
    }
    dist = next
  }
  return dist
}

// ---------------------------------------------------------------
// 화력 — 설명문 계수 × 수치
// ---------------------------------------------------------------

/**
 * 부대의 화력·회복 지표.
 *
 * <p>전법 설명문의 «X%→Y%» 에서 만렙 계수 Y 를 읽어 그 전법을 든 장수의 무력(병기) 또는
 * 지력(책략)에 곱하고, 대상 수와 발동확률까지 반영해 더한다.
 *
 * <p>⚠️ 게임 안의 실제 피해량이 아니다. 진형·국가 강화·병종 보너스·회심·상대 통솔 감쇄가
 * 빠져 있다. 같은 식을 두 덱에 똑같이 적용하므로 <b>덱끼리 견주는 데는 쓸 수 있지만</b>
 * 절대값을 예상 피해로 읽으면 안 된다.
 */
function measureFirepower(
  slots: ResolvedSlot[],
  tacticByName: Map<string, Tactic>,
): TeamAnalysis['firepower'] {
  let damagePerTurn = 0
  let healPerTurn = 0
  let counted = 0
  let unreadable = 0
  const byGeneral: Record<string, number> = {}

  for (const slot of slots) {
    const signature = slot.general.signatureTacticName
      ? tacticByName.get(slot.general.signatureTacticName)
      : undefined
    const mine = signature ? [signature, ...slot.tactics] : slot.tactics

    let own = 0
    for (const t of mine) {
      const p = perTurnTriggerProbability(t.category, t.triggerRate)
      // 발동확률을 모르는 전법은 «0 회 발동» 이 아니라 «모른다» 다. 세지 않고 따로 센다.
      if (p == null) {
        unreadable++
        continue
      }
      const power = tacticPower(slot.general, t, p)
      own += power.perTurn
      healPerTurn += power.healPerActivation * p
      if (power.parsed) counted++
      else unreadable++
    }
    damagePerTurn += own
    byGeneral[slot.general.name] = round(own, 1)
  }

  return {
    damagePerTurn: round(damagePerTurn, 1),
    healPerTurn: round(healPerTurn, 1),
    byGeneral,
    countedTactics: counted,
    unreadableTactics: unreadable,
  }
}

// ---------------------------------------------------------------
// 장점
// ---------------------------------------------------------------

/** 버티는 역할. 전투 로그의 호위(«대신 피해를 받습니다»)와 방어 횟수가 여기서 나온다. */
const TANK_DISPOSITIONS = new Set(['DEFENSE', 'SUPPORT_DEFENSE'])
/** 때리는 역할. 실제 피해가 여기서 나온다. */
const DAMAGE_DISPOSITIONS = new Set(['STRATEGY', 'WEAPON', 'CIVIL_MARTIAL'])
/** 살리는 역할. 전투가 길어질수록 스택형 전법이 유리해진다. */
const SUPPORT_DISPOSITIONS = new Set([
  'HEAL',
  'SUPPORT',
  'SUPPORT_DEFENSE',
  'CIVIL_MARTIAL_SUPPORT',
])

function withRole(gs: General[], roles: Set<string>): General[] {
  return gs.filter((g) => g.dispositions.some((d) => roles.has(d)))
}

type Strength = TeamAnalysis['strengths'][number]

/**
 * 이 편성이 가진 장점.
 *
 * <p>지적 사항이 «고쳐야 할 것»을 말한다면 이쪽은 «이미 잘 되어 있는 것»을 말한다. 티어덱표에
 * 덱마다 «왜 이 덱을 쓰는가»를 한 줄로 적으려면 지적 사항만으로는 쓸 수 없어서 따로 뒀다.
 *
 * <p>⚠️ 근거 없는 칭찬은 넣지 않는다. 모든 항목은 실제 데이터에서 확인된 것만 나오고,
 * 데이터가 비어 있으면 «장점이 없다»가 아니라 «판단하지 않는다»로 처리한다. 병종이 하나라도
 * 미입력이면 병종 장점을 아예 만들지 않는 것이 그래서다. 빈 값을 좋게 읽으면 데이터를 안 채운
 * 덱이 채운 덱보다 좋아 보이게 된다.
 */
function findStrengths(
  slots: ResolvedSlot[],
  equipped: Tactic[],
  analysis: {
    faction: TeamAnalysis['faction']
    unitType: TeamAnalysis['unitType']
    tactics: TeamAnalysis['tactics']
    simulation: TeamAnalysis['simulation']
    firepower: TeamAnalysis['firepower']
  },
  pool: General[],
): Strength[] {
  const out: Strength[] = []
  const generals = slots.map((s) => s.general)
  if (generals.length === 0) return out

  // --- 포진 단계에서 붙는 것 ---

  if (analysis.faction.tier === 'PURE') {
    out.push({
      code: 'FACTION_PURE',
      title: `${analysis.faction.dominantFaction} 단일 세력`,
      detail:
        `${generals.length}명 전원이 ${analysis.faction.dominantFaction}입니다. ` +
        '포진에서 붙는 국가 강화가 부대 전원의 무력·지력·통솔·선공을 한꺼번에 올리므로, ' +
        '세력을 섞은 편성이 잃는 부분을 온전히 가져갑니다.',
    })
  }

  if (analysis.unitType.unknownCount === 0 && analysis.unitType.uniform) {
    const only = Object.keys(analysis.unitType.countByUnitType)[0]
    out.push({
      code: 'UNIT_TYPE_UNIFORM',
      title: `${only} 단일 병종`,
      detail:
        `전원이 ${only}입니다. 포진의 병종 보너스가 세 명에게 모두 겹쳐 ` +
        '주는 피해가 함께 올라갑니다.',
    })
  }

  // --- 전법 ---

  const alwaysOn = equipped.filter(
    (t) => perTurnTriggerProbability(t.category, t.triggerRate) === 1,
  )
  if (alwaysOn.length > 0) {
    out.push({
      code: 'ALWAYS_ON_TACTIC',
      title: `상시 전법 ${alwaysOn.length}개`,
      detail:
        `${alwaysOn.map((t) => t.name).join(', ')} 은(는) 확률 판정 없이 늘 걸립니다. ` +
        '운에 관계없이 매 턴 최소 하나는 발동한다는 뜻이라, 전법이 하나도 안 터지는 턴이 없습니다.',
    })
  }

  if (analysis.simulation.evaluatedTactics > 0 && analysis.simulation.expectedPerTurn >= 2) {
    out.push({
      code: 'HIGH_ACTIVATION',
      title: `턴당 ${analysis.simulation.expectedPerTurn.toFixed(2)}회 발동`,
      detail:
        `발동확률이 확인된 전법 ${analysis.simulation.evaluatedTactics}개 기준으로 ` +
        `한 턴에 평균 ${analysis.simulation.expectedPerTurn.toFixed(2)}회가 발동합니다.`,
    })
  }

  // 화력이 어느 장수에게 몰려 있는지. 한 명에게 쏠린 것 자체는 나쁘지 않지만, 그 장수가
  // 먼저 죽으면 덱이 통째로 무너진다는 뜻이기도 해서 «누가 주포인가»를 밝혀 적는다.
  if (analysis.firepower.damagePerTurn > 0) {
    const top = Object.entries(analysis.firepower.byGeneral).sort((a, b) => b[1] - a[1])[0]
    out.push({
      code: 'FIREPOWER',
      title: `화력 지표 ${Math.round(analysis.firepower.damagePerTurn)}`,
      detail:
        `전법 설명문의 만렙 계수에 각 장수의 무력·지력을 곱해 더한 값입니다. ` +
        `주포는 ${top[0]}(${Math.round(top[1])})입니다. ` +
        '진형·병종 보너스·회심·상대 통솔은 빠져 있어 실제 피해량이 아니라 덱끼리 견주는 값입니다.' +
        (analysis.firepower.healPerTurn > 0
          ? ` 회복 지표는 ${Math.round(analysis.firepower.healPerTurn)}입니다.`
          : ''),
    })
  }

  // 전투 로그에서 실제 피해의 대부분은 스택이 쌓이며 커지는 전법에서 나왔다
  // (연전연승 8스택, 세금 과징수 4스택, 구전 5스택). 설명문에 그 성질이 적혀 있으면 짚어준다.
  const stacking = equipped.filter((t) => t.effectText?.includes('중첩'))
  if (stacking.length > 0) {
    out.push({
      code: 'STACKING',
      title: `누적형 전법 ${stacking.length}개`,
      detail:
        `${stacking.map((t) => t.name).join(', ')} 은(는) 중첩으로 커집니다. ` +
        '턴이 갈수록 세지는 구성이라 전투가 길어질수록 유리합니다.',
    })
  }

  const gold = equipped.filter((t) => t.quality === 'GOLD')
  if (gold.length >= 2) {
    out.push({
      code: 'GOLD_TACTICS',
      title: `황금 전법 ${gold.length}개`,
      detail: `${gold.map((t) => t.name).join(', ')}. 최상위 등급 전법이 여러 개 들어갑니다.`,
    })
  }

  if (
    analysis.tactics.slotCapacity > 0 &&
    analysis.tactics.equippedCount >= analysis.tactics.slotCapacity &&
    analysis.tactics.duplicateNames.length === 0
  ) {
    out.push({
      code: 'TACTIC_SLOTS_FULL',
      title: '전법 칸 전부 사용',
      detail:
        `${analysis.tactics.slotCapacity}칸을 중복 없이 모두 채웠습니다. ` +
        '고유전법은 장착하지 않아도 들어가므로 한 칸도 버리지 않았습니다.',
    })
  }

  // --- 역할 ---

  const tanks = withRole(generals, TANK_DISPOSITIONS)
  const damage = withRole(generals, DAMAGE_DISPOSITIONS)
  const support = withRole(generals, SUPPORT_DISPOSITIONS)
  if (tanks.length > 0 && damage.length > 0) {
    out.push({
      code: 'ROLE_BALANCE',
      title: '버팀 · 화력 양립',
      detail:
        `${tanks.map((g) => g.name).join(', ')} 이(가) 버티고 ` +
        `${damage.map((g) => g.name).join(', ')} 이(가) 피해를 냅니다. ` +
        '전투는 스택이 쌓이며 세지는 구조라, 그때까지 버텨줄 장수가 있어야 화력이 값을 합니다.' +
        (support.length > 0 ? ` 회복·보조는 ${support.map((g) => g.name).join(', ')}.` : ''),
    })
  }

  // --- 선공 ---
  //
  // 턴마다 «행동 순서 판단»이 다시 도는데 그 순서를 정하는 것이 선공이다. 다만 «선공이 높다»는
  // 비교 대상이 있어야 뜻이 생기므로, 보유 장수 전체와 견줘 상위권일 때만 장점으로 적는다.
  const withInitiative = generals.filter((g) => g.initiative != null)
  const poolInitiative = pool
    .map((g) => g.initiative)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)
  if (withInitiative.length === generals.length && poolInitiative.length >= 5) {
    const avg =
      withInitiative.reduce((s, g) => s + (g.initiative ?? 0), 0) / withInitiative.length
    const below = poolInitiative.filter((v) => v < avg).length
    const percentile = Math.round((below / poolInitiative.length) * 100)
    if (percentile >= 70) {
      out.push({
        code: 'INITIATIVE',
        title: `선공 상위 ${100 - percentile}%`,
        detail:
          `평균 선공 ${avg.toFixed(1)} — 보유 장수의 ${percentile}%보다 높습니다. ` +
          '행동 순서는 턴마다 선공으로 다시 정해지므로 먼저 때릴 가능성이 큽니다.',
      })
    }
  }

  return out
}

// ---------------------------------------------------------------
// 본체
// ---------------------------------------------------------------

/**
 * 편성 하나를 분석한다.
 *
 * @param pool 보유·전체 장수 목록. 선공을 견줄 기준으로만 쓴다
 */
export function analyzeTeam(
  teamName: string,
  slots: SlotState[],
  generals: General[],
  tactics: Tactic[],
  turns: number,
  pool: General[] = generals,
): TeamAnalysis {
  const generalByName = new Map(generals.map((g) => [g.name, g]))
  const tacticByName = new Map(tactics.map((t) => [t.name, t]))

  const resolved = resolve(slots, generalByName, tacticByName)
  const teamGenerals = resolved.map((s) => s.general)
  const all = collectTactics(resolved, tacticByName)
  const findings: TeamAnalysis['findings'] = []

  // --- 구성 ---
  if (teamGenerals.length < MAX_SLOTS) {
    findings.push({
      severity: 'INFO',
      code: 'SLOT_EMPTY',
      message: `장수 자리가 ${MAX_SLOTS - teamGenerals.length}칸 비어 있습니다.`,
    })
  }
  const roster = { generalCount: teamGenerals.length, slotCapacity: MAX_SLOTS }

  // --- 세력 ---
  const countByFaction: Record<string, number> = {}
  for (const g of teamGenerals) {
    const key = label(FACTION_LABEL, g.faction) ?? g.faction
    countByFaction[key] = (countByFaction[key] ?? 0) + 1
  }
  let dominantFaction: string | undefined
  let dominantCount = 0
  for (const [k, v] of Object.entries(countByFaction)) {
    if (v > dominantCount) {
      dominantFaction = k
      dominantCount = v
    }
  }
  let factionTier: string
  let factionNote: string
  if (teamGenerals.length === 0) {
    factionTier = 'NONE'
    factionNote = '장수가 없습니다.'
  } else if (dominantCount === teamGenerals.length && teamGenerals.length >= 2) {
    factionTier = 'PURE'
    factionNote = `${dominantFaction} 단일 세력입니다. 동세력 보너스를 온전히 받습니다.`
  } else if (dominantCount >= 2) {
    factionTier = 'PAIR'
    factionNote = `${dominantFaction} ${dominantCount}명 + 타 세력 ${teamGenerals.length - dominantCount}명 구성입니다.`
    findings.push({
      severity: 'WARN',
      code: 'FACTION_MIXED',
      message: `세력이 섞여 있어 동세력 보너스가 줄어듭니다. ${factionNote}`,
    })
  } else {
    factionTier = 'SCATTERED'
    factionNote = '장수 전원의 세력이 다릅니다.'
    findings.push({
      severity: 'WARN',
      code: 'FACTION_SCATTERED',
      message: '세력이 모두 달라 동세력 보너스를 받지 못합니다.',
    })
  }
  const faction = {
    countByFaction,
    dominantFaction,
    dominantCount,
    tier: factionTier,
    note: factionNote,
  }

  // --- 병종 ---
  const countByUnitType: Record<string, number> = {}
  let unknownUnitType = 0
  for (const g of teamGenerals) {
    if (!g.unitType) {
      unknownUnitType++
    } else {
      const key = label(UNIT_TYPE_LABEL, g.unitType) ?? g.unitType
      countByUnitType[key] = (countByUnitType[key] ?? 0) + 1
    }
  }
  const uniformUnitType =
    unknownUnitType === 0 && Object.keys(countByUnitType).length === 1 && teamGenerals.length > 0
  let unitTypeNote: string
  if (unknownUnitType > 0) {
    unitTypeNote = `병종 미입력 ${unknownUnitType}명.`
    findings.push({
      severity: 'WARN',
      code: 'UNIT_TYPE_MISSING',
      message: `장수 ${unknownUnitType}명의 병종이 비어 있어 병종 분석을 신뢰할 수 없습니다.`,
    })
  } else if (uniformUnitType) {
    unitTypeNote = '단일 병종 편성입니다.'
  } else {
    unitTypeNote = '혼성 병종 편성입니다.'
  }
  const unitType = {
    countByUnitType,
    unknownCount: unknownUnitType,
    uniform: uniformUnitType,
    note: unitTypeNote,
  }

  // --- 전법 ---
  const countByCategory: Record<string, number> = {}
  const countByAbilityType: Record<string, number> = {}
  const countByQuality: Record<string, number> = {}
  const nameCounts = new Map<string, number>()
  let rateSum = 0
  let rateCount = 0
  let complete = 0
  const missingDataNames: string[] = []

  for (const t of all) {
    nameCounts.set(t.name, (nameCounts.get(t.name) ?? 0) + 1)
    if (t.category) {
      const k = label(TACTIC_CATEGORY_LABEL, t.category) ?? t.category
      countByCategory[k] = (countByCategory[k] ?? 0) + 1
    }
    if (t.abilityTypeLabel) {
      countByAbilityType[t.abilityTypeLabel] = (countByAbilityType[t.abilityTypeLabel] ?? 0) + 1
    }
    if (t.quality) {
      const k = label(TACTIC_QUALITY_LABEL, t.quality) ?? t.quality
      countByQuality[k] = (countByQuality[k] ?? 0) + 1
    }
    if (t.triggerRate != null) {
      rateSum += t.triggerRate
      rateCount++
    }
    if (perTurnTriggerProbability(t.category, t.triggerRate) != null) {
      complete++
    } else {
      missingDataNames.push(t.name)
    }
  }

  const duplicateNames = [...nameCounts.entries()]
    .filter(([, v]) => v > 1)
    .map(([k]) => k)
    .sort()
  if (duplicateNames.length > 0) {
    findings.push({
      severity: 'WARN',
      code: 'TACTIC_DUPLICATE',
      message: `같은 전법이 중복 장착되어 있습니다: ${duplicateNames.join(', ')}`,
    })
  }

  const tacticCapacity = resolved.length * MAX_TACTICS_PER_SLOT
  const equippedOnly = resolved.reduce((s, r) => s + r.tactics.length, 0)
  if (equippedOnly < tacticCapacity) {
    findings.push({
      severity: 'INFO',
      code: 'TACTIC_SLOT_EMPTY',
      message: `전법 슬롯 ${tacticCapacity}칸 중 ${tacticCapacity - equippedOnly}칸이 비어 있습니다.`,
    })
  }
  if (all.length > 0 && complete < all.length) {
    findings.push({
      severity: 'WARN',
      code: 'TACTIC_DATA_MISSING',
      message: `전법 ${all.length}개 중 ${all.length - complete}개의 분류/발동확률이 비어 있어 계산에서 제외했습니다.`,
    })
  }

  const tacticAnalysis = {
    equippedCount: all.length,
    slotCapacity: tacticCapacity,
    countByCategory,
    countByAbilityType,
    countByQuality,
    averageTriggerRate: rateCount === 0 ? undefined : round(rateSum / rateCount, 2),
    dataCompleteness: all.length === 0 ? 0 : round((complete * 100) / all.length, 1),
    duplicateNames,
    missingDataNames: [...missingDataNames].sort(),
  }

  // --- 발동 계산 ---
  const evaluable = all
    .map((t) => ({ t, p: perTurnTriggerProbability(t.category, t.triggerRate) }))
    .filter((x): x is { t: Tactic; p: number } => x.p != null)

  let simulation: TeamAnalysis['simulation']
  if (evaluable.length === 0) {
    if (all.length > 0) {
      findings.push({
        severity: 'WARN',
        code: 'SIM_NO_DATA',
        message: '발동확률이 입력된 전법이 없어 발동 계산을 하지 못했습니다.',
      })
    }
    simulation = {
      turns,
      iterations: 0,
      method: 'EXACT',
      evaluatedTactics: 0,
      skippedTactics: all.length,
      expectedPerTurn: 0,
      probAtLeastOne: 0,
      activationHistogram: {},
      perTacticExpected: {},
    }
  } else {
    const probs = evaluable.map((x) => x.p)
    const dist = activationDistribution(probs)
    const histogram: Record<string, number> = {}
    dist.forEach((v, k) => {
      if (v > 0) histogram[String(k)] = round(v, 4)
    })
    const perTacticExpected: Record<string, number> = {}
    for (const { t, p } of evaluable) {
      perTacticExpected[t.name] = round(p * turns, 3)
    }
    simulation = {
      turns,
      iterations: 0,
      method: 'EXACT',
      evaluatedTactics: evaluable.length,
      skippedTactics: all.length - evaluable.length,
      expectedPerTurn: round(
        probs.reduce((s, p) => s + p, 0),
        4,
      ),
      probAtLeastOne: round(1 - probs.reduce((s, p) => s * (1 - p), 1), 4),
      activationHistogram: histogram,
      perTacticExpected,
    }
  }

  const firepower = measureFirepower(resolved, tacticByName)
  if (firepower.unreadableTactics > 0) {
    findings.push({
      severity: 'INFO',
      code: 'FIREPOWER_PARTIAL',
      message:
        `전법 ${firepower.unreadableTactics}개는 설명문에서 계수를 읽지 못해 화력 지표에서 빠졌습니다. ` +
        '피해를 직접 주지 않는 버프형 전법이면 정상입니다.',
    })
  }

  // --- 점수 ---
  // 백엔드와 같은 배점이다. 미입력 항목은 0점으로 깎지 않고 만점에서 빼며, 실제로 평가한
  // 비중(coverage)을 함께 준다. 그러지 않으면 «데이터를 안 넣을수록 점수가 높아지는» 착시가 생긴다.
  let earned = 0
  let possible = 0

  possible += 35
  earned += 35 * (roster.generalCount / MAX_SLOTS)

  possible += 25
  earned += { PURE: 25, PAIR: 14, SCATTERED: 5 }[faction.tier] ?? 0

  possible += 15
  if (tacticAnalysis.slotCapacity > 0) {
    earned += 15 * Math.min(1, tacticAnalysis.equippedCount / tacticAnalysis.slotCapacity)
  }

  if (simulation.evaluatedTactics > 0) {
    possible += 15
    earned += 15 * Math.min(1, simulation.probAtLeastOne)
  }

  if (unitType.unknownCount === 0 && roster.generalCount > 0) {
    possible += 10
    earned += unitType.uniform ? 10 : 5
  }

  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100)
  const coverage = (possible / FULL_WEIGHT) * 100
  const confidence = coverage >= 95 ? 'HIGH' : coverage >= 80 ? 'MEDIUM' : 'LOW'
  if (confidence !== 'HIGH') {
    findings.push({
      severity: 'WARN',
      code: 'SCORE_LOW_CONFIDENCE',
      message:
        `점수는 채점 항목의 ${coverage.toFixed(0)}%만 평가한 결과입니다. ` +
        '미입력 데이터가 많아 편성의 우열보다 데이터 입력 상태를 더 반영합니다.',
    })
  }
  if (resolved.length === 0) {
    findings.push({
      severity: 'ERROR',
      code: 'EMPTY_TEAM',
      message: '부대에 장수가 한 명도 없습니다.',
    })
  }

  const grade =
    score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D'

  const order: Record<string, number> = { ERROR: 0, WARN: 1, INFO: 2 }
  findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))

  return {
    teamName,
    score,
    grade,
    scoreCoverage: round(coverage, 1),
    confidence: confidence as TeamAnalysis['confidence'],
    roster,
    faction,
    unitType,
    tactics: tacticAnalysis,
    simulation,
    firepower,
    strengths: findStrengths(
      resolved,
      all,
      { faction, unitType, tactics: tacticAnalysis, simulation, firepower },
      pool,
    ),
    findings,
  }
}
