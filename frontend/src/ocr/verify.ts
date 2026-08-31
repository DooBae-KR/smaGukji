/**
 * 전보에서 센 실제 발동 수를 시뮬레이션의 가정과 맞춰 본다.
 *
 * <p>시뮬레이션은 «매 턴, 전법마다 독립적으로 확률 p 로 발동한다» 는 모형을 쓴다
 * (TeamAnalysisService.simulate). 그러면 N턴 동안의 발동 수는 이항분포 B(N, p) 를 따르고,
 * 전보에서 센 값이 그 분포에 들어맞는지 보면 «시뮬레이션이 현실과 맞는가» 를 판정할 수 있다.
 *
 * <p>판정에는 Wilson 점수 구간을 쓴다. 표본이 적을 때 정규 근사(k ± 1.96·√Npq)는 구간이
 * 음수까지 내려가거나 0%·100% 근처에서 무너지는데, 전보 몇 장으로 보는 이 화면이 딱
 * 그 구간이다.
 *
 * <p>이 파일도 순수 함수만 둔다 — 숫자 검토에 화면이 필요하지 않도록.
 */

/** 95% 양측. 흔히 쓰는 값이라 상수로 박아 둔다. */
const Z = 1.959964

/**
 * 이 아래로는 «맞다/틀리다» 를 말하지 않는다.
 *
 * <p>8턴 전보 두세 장(=16~24 기회)으로는 발동률 30% 와 45% 를 구분하지 못한다.
 * 구간은 그려 주되 판정은 미룬다.
 */
export const MIN_OPPORTUNITIES = 30

export type Verdict =
  /** 시뮬레이션 확률이 관측 구간 안에 있다 */
  | 'OK'
  /** 관측이 시뮬레이션보다 높다 — 실제가 더 잘 터진다 */
  | 'HIGH'
  /** 관측이 시뮬레이션보다 낮다 */
  | 'LOW'
  /** 표본이 모자라 판정하지 않는다 */
  | 'THIN'
  /** 발동확률이 DB 에 없어 비교 대상이 없다 */
  | 'NO_RATE'

export interface Observation {
  tacticId: string
  tacticName: string
  /** 시뮬레이션이 쓰는 한 턴 발동 확률(0~1). 모르면 null */
  perTurnRate: number | null
  /** 발동할 수 있었던 턴 수의 합계 */
  opportunities: number
  /** 실제로 발동한 것으로 센 횟수 */
  observed: number
}

export interface Comparison extends Observation {
  /** 관측 발동률 */
  rate: number
  /** 시뮬레이션이 예상하는 발동 수 */
  expected: number
  /** 관측 발동률의 95% 구간 */
  low: number
  high: number
  verdict: Verdict
}

/**
 * Wilson 점수 구간.
 *
 * @param k 성공 횟수
 * @param n 시행 횟수
 */
export function wilsonInterval(k: number, n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 }

  const p = k / n
  const z2 = Z * Z
  const denominator = 1 + z2 / n
  const center = p + z2 / (2 * n)
  const margin = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))

  return {
    low: Math.max(0, (center - margin) / denominator),
    high: Math.min(1, (center + margin) / denominator),
  }
}

/** 관측 하나를 판정한다. */
export function compare(observation: Observation): Comparison {
  const { perTurnRate, opportunities, observed } = observation
  const rate = opportunities > 0 ? observed / opportunities : 0
  const { low, high } = wilsonInterval(observed, opportunities)

  let verdict: Verdict
  if (perTurnRate == null) {
    verdict = 'NO_RATE'
  } else if (opportunities < MIN_OPPORTUNITIES) {
    verdict = 'THIN'
  } else if (perTurnRate < low) {
    verdict = 'HIGH'
  } else if (perTurnRate > high) {
    verdict = 'LOW'
  } else {
    verdict = 'OK'
  }

  return {
    ...observation,
    rate,
    expected: perTurnRate == null ? 0 : perTurnRate * opportunities,
    low,
    high,
    verdict,
  }
}

/**
 * 여러 전보를 합친다.
 *
 * <p>전보 한 장은 표본이 너무 작다. 같은 전법이 나온 전보를 모두 더해야 판정이 선다.
 * 기회 수는 «그 전보의 턴 수» 를 더한 값이다 — 그 전법이 편성에 있었던 전투만 세야 하므로,
 * 전법이 한 번도 안 나온 전보는 세지 않는다.
 */
export interface ReportSample {
  /** 이 전보의 턴 수 */
  turns: number
  /** 전법 id → 발동 횟수 */
  triggers: Map<string, number>
}

export interface TacticRate {
  id: string
  name: string
  perTurnRate: number | null
}

export function aggregate(samples: ReportSample[], tactics: TacticRate[]): Comparison[] {
  const byId = new Map(tactics.map((t) => [t.id, t]))
  const totals = new Map<string, { opportunities: number; observed: number }>()

  for (const sample of samples) {
    for (const [tacticId, count] of sample.triggers) {
      const acc = totals.get(tacticId) ?? { opportunities: 0, observed: 0 }
      acc.opportunities += sample.turns
      acc.observed += count
      totals.set(tacticId, acc)
    }
  }

  return [...totals.entries()]
    .map(([tacticId, acc]) => {
      const tactic = byId.get(tacticId)
      return compare({
        tacticId,
        tacticName: tactic?.name ?? tacticId,
        perTurnRate: tactic?.perTurnRate ?? null,
        opportunities: acc.opportunities,
        observed: acc.observed,
      })
    })
    // 어긋난 것부터 보여준다. 맞는 것은 굳이 들여다볼 이유가 없다.
    .sort((a, b) => rank(a) - rank(b) || b.opportunities - a.opportunities)
}

const ORDER: Record<Verdict, number> = { HIGH: 0, LOW: 0, OK: 1, THIN: 2, NO_RATE: 3 }

function rank(c: Comparison): number {
  return ORDER[c.verdict]
}
