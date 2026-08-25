import type { General, Tactic } from '../api/types'

/**
 * 전법 설명문에서 계수를 읽어낸다.
 *
 * <p>전법 데이터에는 피해량을 담은 숫자 칸이 따로 없다. 대신 설명문에 «130%→260%의 병기
 * 피해» 처럼 적혀 있고, <b>화살표 뒤가 만렙(배울) 계수</b>다. 이 앱은 만렙 기준으로 견주므로
 * 오른쪽 값만 쓴다.
 *
 * <p>읽어내는 것은 세 가지다.
 * <ul>
 *   <li><b>피해 계수</b> — 병기(무력이 올림) / 책략(지력이 올림) 구분과 함께
 *   <li><b>대상 수</b> — «전체 적군» 3명, «랜덤 적군 2명» 2명, 그 외 1명
 *   <li><b>치유율</b> — «치유율 20%→40%»
 * </ul>
 *
 * <p>⚠️ 여기서 나오는 값은 <b>게임 안의 실제 피해량이 아니다.</b> 실제 전투에는 진형·국가
 * 강화·병종 보너스·회심·상대 통솔 감쇄가 겹겹이 붙는다(전투 로그 참고). 그것들을 다 따라
 * 하려면 이 데이터에 없는 수치가 필요하다. 그래서 이 값은 <b>같은 잣대로 덱끼리 견주는
 * 지표</b>로만 쓴다. 양쪽 덱에 같은 식을 적용하니 비교는 성립하지만, 절대값을 «예상 피해»로
 * 읽으면 안 된다.
 *
 * <p>설명문은 사람이 쓴 문장이라 모든 표현을 다 잡지는 못한다. 그래서 몇 개를 읽었는지
 * 함께 돌려준다. 못 읽은 것을 0 으로 취급하면 설명이 복잡한 전법이 약해 보이기 때문이다.
 */

/** 피해가 어느 수치를 타는가. */
export type DamageKind = 'WEAPON' | 'STRATEGY' | 'MIXED'

export interface DamageTerm {
  /** 만렙 계수. 260% 면 2.6 */
  multiplier: number
  kind: DamageKind
  /** 이 항이 때리는 적 수 */
  targets: number
}

export interface ParsedEffect {
  damages: DamageTerm[]
  /** 치유율. 0.4 면 40% */
  heals: number[]
  /**
   * 설명문에서 계수를 하나라도 읽었는지.
   *
   * <p>false 라고 «약한 전법»이라는 뜻은 아니다. 연전연승·불굴의 의지처럼 피해를 직접 주지
   * 않고 버프만 거는 전법이 실제로 많다.
   */
  parsed: boolean
}

/**
 * «X%→Y% 의 병기 피해» 를 잡는다.
 *
 * <p>숫자가 «피해» 앞에 와야 한다. «주는 피해가 5%→10% 증가» 는 피해량이 아니라 증폭이라
 * 이 순서 조건 덕분에 저절로 걸러진다.
 *
 * <p>맨 뒤의 «전달» 은 «이번 일반 공격의 50%→100%의 피해 전달» 처럼 일반 공격을 기준으로
 * 하는 항이다. 수치를 타는 값이 아니라 계산이 달라 따로 잡아 제외한다.
 */
const DAMAGE = /([0-9.]+)%\s*→\s*([0-9.]+)%\s*의?\s*(병기와 책략|책략과 병기|병기|책략)?\s*피해\s*(전달)?/g

const HEAL = /치유율\s*([0-9.]+)%\s*→\s*([0-9.]+)%/g

/**
 * 이 피해가 몇 명을 때리는지.
 *
 * <p>대상은 피해 계수 «앞» 에 적힌다("랜덤 적군 2명에게 95%→190%의 병기 피해"). 그래서
 * 계수 위치에서 앞쪽만 좁게 훑는다. 넓게 보면 앞 문장의 대상을 잘못 끌어온다.
 */
function targetsFor(text: string, index: number): number {
  const window = text.slice(Math.max(0, index - 60), index)
  const counted = window.match(/적군\s*(\d)명/)
  if (counted) return Number(counted[1])
  if (/전체 적군|적군 전체|목표 전체|전체 목표|적군 모두/.test(window)) return 3
  return 1
}

export function parseEffect(effectText: string | undefined): ParsedEffect {
  if (!effectText) return { damages: [], heals: [], parsed: false }

  // 설명문은 카드에서 옮겨 적느라 줄바꿈이 문장 한가운데 끼어 있다. 한 줄로 펴야 잡힌다.
  const text = effectText.replace(/\n/g, ' ')

  const damages: DamageTerm[] = []
  DAMAGE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DAMAGE.exec(text)) !== null) {
    if (m[4]) continue
    const kindText = m[3]
    const kind: DamageKind =
      kindText === '병기' ? 'WEAPON' : kindText === '책략' ? 'STRATEGY' : 'MIXED'
    damages.push({
      multiplier: Number(m[2]) / 100,
      kind,
      targets: targetsFor(text, m.index),
    })
  }

  const heals: number[] = []
  HEAL.lastIndex = 0
  while ((m = HEAL.exec(text)) !== null) {
    heals.push(Number(m[2]) / 100)
  }

  return { damages, heals, parsed: damages.length > 0 || heals.length > 0 }
}

/**
 * 피해가 타는 수치.
 *
 * <p>병기는 무력, 책략은 지력이다. 전투 로그에서 같은 «연전연승» 이 마초에게는 무력으로,
 * 주유에게는 지력으로 붙은 것과 같은 갈래다. 둘 다 타는 항은 평균으로 본다.
 */
function statFor(general: General, kind: DamageKind): number {
  const might = general.might ?? 0
  const intellect = general.intellect ?? 0
  if (kind === 'WEAPON') return might
  if (kind === 'STRATEGY') return intellect
  return (might + intellect) / 2
}

export interface TacticPower {
  /** 한 번 발동했을 때의 피해 지표 */
  perActivation: number
  /** 발동확률까지 반영한 턴당 피해 지표 */
  perTurn: number
  /** 한 번 발동했을 때의 회복 지표 */
  healPerActivation: number
  parsed: boolean
}

/**
 * 이 장수가 이 전법을 썼을 때의 화력 지표.
 *
 * <p>계수 × 수치 × 대상 수. 회복은 지력이 올리므로 지력에 곱한다(설명문의 «지력의 영향
 * 받음» 이 대부분 이쪽이다).
 *
 * @param triggerProbability 매 턴 발동확률. 상시 전법은 1
 */
export function tacticPower(
  general: General,
  tactic: Tactic,
  triggerProbability: number | null,
): TacticPower {
  const parsed = parseEffect(tactic.effectText)

  let perActivation = 0
  for (const d of parsed.damages) {
    perActivation += d.multiplier * statFor(general, d.kind) * d.targets
  }

  let healPerActivation = 0
  for (const rate of parsed.heals) {
    healPerActivation += rate * (general.intellect ?? 0)
  }

  const p = triggerProbability ?? 0
  return {
    perActivation,
    perTurn: perActivation * p,
    healPerActivation,
    parsed: parsed.parsed,
  }
}
