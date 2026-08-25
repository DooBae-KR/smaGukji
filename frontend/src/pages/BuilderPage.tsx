import { useCallback, useEffect, useMemo, useState } from 'react'
import { listGenerals, listTactics } from '../api/endpoints'
import { assetImageUrl } from '../api/client'
import { EMPTY_OWNED, loadOwned } from '../api/collection'
import type { CardKind, OwnedCards } from '../api/collection'
import type { General, Tactic } from '../api/types'
import { analyzeTeam } from '../lib/analyze'
import { displayName, seasonTag } from "../api/labels"
import type { CardItem } from "../components/CardGrid"
import { AnalysisPanel } from '../components/AnalysisPanel'
import { CardPickerModal } from './CardPickerModal'
import { OwnedPanel } from "./OwnedPanel"
import {
  SLOT_COUNT,
  TACTICS_PER_SLOT,
  TEAM_COUNT,
  emptyDeck,
  recommendDeck,
} from '../lib/recommend'
import type { SlotState } from '../lib/recommend'
import { TIER_DECKS } from '../lib/tier'
import { TierDeckDetail } from '../components/TierDeckDetail'

/**
 * 시뮬레이션 턴 수.
 *
 * <p>천하결전 전투는 8턴에 끝난다. 고를 수 있는 값이 아니라 규칙이므로 입력칸을 두지 않는다.
 * (예전에는 코스트 상한도 입력받았는데, 이 게임에는 코스트라는 개념 자체가 없다)
 */
const TURNS = 8

/** 지금 열려 있는 선택 팝업이 어느 칸을 위한 것인지. */
interface PickerTarget {
  team: number
  slot: number
  kind: CardKind
  /** 전법일 때 몇 번째 칸인지 */
  tacticIndex?: number
}

export function BuilderPage() {
  const [generals, setGenerals] = useState<General[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  /** 부대 5개. 각 부대는 슬롯 3칸이다. */
  const [deck, setDeck] = useState<SlotState[][]>(emptyDeck)
  const [activeTeam, setActiveTeam] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /** 덱 편성이 남긴 말. 카드가 모자랐다거나 하는 것 */
  const [recommendNotes, setRecommendNotes] = useState<string[]>([])
  /** 부대별 출처. 티어표에서 온 것이면 그 제목이 들어간다 */
  const [sources, setSources] = useState<(string | null)[]>(() =>
    Array.from({ length: TEAM_COUNT }, () => null),
  )

  // 보유 목록. 편성은 «가진 것 중에서» 고르는 일이라 선택 팝업이 이걸 기준으로 걸러준다.
  const [owned, setOwned] = useState<OwnedCards>(EMPTY_OWNED)
  // 열려 있는 보유 등록 탭. null 이면 닫힌 상태다.
  const [ownedTab, setOwnedTab] = useState<CardKind | null>(null)
  const [picker, setPicker] = useState<PickerTarget | null>(null)

  useEffect(() => {
    Promise.all([listGenerals(), listTactics(), loadOwned()])
      .then(([g, t, o]) => {
        setGenerals(g)
        setTactics(t)
        setOwned(o)
      })
      .catch((e) => setError(e.message))
  }, [])

  const generalByName = useMemo(() => new Map(generals.map((g) => [g.name, g])), [generals])
  const tacticByName = useMemo(() => new Map(tactics.map((t) => [t.name, t])), [tactics])

  const slots = deck[activeTeam]

  /** 지금 보는 부대가 티어표에서 온 것이면 그 덱. 시트의 나머지 지침을 함께 보여준다. */
  const activeTierDeck = useMemo(() => {
    const title = sources[activeTeam]
    return title ? (TIER_DECKS.find((d) => d.title === title) ?? null) : null
  }, [sources, activeTeam])

  /**
   * 편성 분석.
   *
   * <p>여기서 직접 계산한다. Render 를 부르지 않는다. 무료 인스턴스는 유휴 15분 뒤 잠들어
   * 깨는 데 수십 초가 걸리는데, 편성 화면은 장수를 한 명 놓을 때마다 분석이 필요하므로
   * 서버에 맡기면 이 화면을 여는 것만으로 서버를 깨우게 된다. 무중단이 최우선이라
   * 편성 화면은 Supabase(조회) · 정적 카드 이미지 · 이 계산만으로 완결된다.
   *
   * <p>서버 왕복이 없으니 디바운스도 필요 없다. 고르는 즉시 숫자가 바뀐다.
   */
  const analysis = useMemo(() => {
    if (generals.length === 0) return null
    if (slots.every((s) => !s.generalName)) return null
    return analyzeTeam(`${activeTeam + 1}부대`, slots, generals, tactics, TURNS)
  }, [slots, activeTeam, generals, tactics])

  const setSlot = useCallback(
    (teamIndex: number, slotIndex: number, next: Partial<SlotState>) => {
      setDeck((prev) =>
        prev.map((team, ti) =>
          ti === teamIndex ? team.map((s, si) => (si === slotIndex ? { ...s, ...next } : s)) : team,
        ),
      )
    },
    [],
  )

  /**
   * 이미 어딘가에 쓰인 장수·전법.
   *
   * <p>한 장의 카드는 한 곳에서만 쓴다. 같은 부대 안이 아니라 <b>5부대 전체</b>가 기준이다.
   * 카드를 두 부대에 동시에 넣을 수 없기 때문이다.
   */
  const used = useMemo(() => {
    const generalsUsed = new Map<string, number>()
    const tacticsUsed = new Map<string, number>()
    deck.forEach((team, ti) => {
      for (const slot of team) {
        if (slot.generalName) generalsUsed.set(slot.generalName, ti)
        for (const name of slot.tacticNames) {
          if (name) tacticsUsed.set(name, ti)
        }
      }
    })
    return { generals: generalsUsed, tactics: tacticsUsed }
  }, [deck])

  const teamLabel = (index: number) => `${index + 1}부대`

  const pickGeneral = (teamIndex: number, slotIndex: number, name: string) => {
    setSlot(teamIndex, slotIndex, { generalName: name })
    setPicker(null)
  }

  const pickTactic = (
    teamIndex: number,
    slotIndex: number,
    tacticIndex: number,
    name: string,
  ) => {
    const next = [...deck[teamIndex][slotIndex].tacticNames]
    next[tacticIndex] = name
    setSlot(teamIndex, slotIndex, { tacticNames: next })
    setPicker(null)
  }

  /** 덱 편성. 시즌2 티어표를 우선 쓰고, 남는 자리는 보유 카드로 채운다. */
  const buildDeck = () => {
    const { deck: next, notes, sources: from } = recommendDeck(generals, tactics, owned)
    setDeck(next)
    setRecommendNotes(notes)
    setSources(from)
    setActiveTeam(0)
  }

  /** 선택 팝업에 넘길 후보 목록. 고를 수 없는 것은 이유와 함께 막아둔다. */
  const pickerItems = (target: PickerTarget): CardItem[] => {
    const slot = deck[target.team][target.slot]

    if (target.kind === 'GENERAL') {
      // 이미 어느 부대엔가 들어간 장수는 목록에 남기되 흑백으로 보여준다. 목록에서 아예
      // 빼면 «내가 어디에 썼더라» 를 확인할 길이 없어진다. 흑백이면 고를 수 없다는 것과
      // 이미 쓰고 있다는 것이 한눈에 같이 보인다.
      // 나라별로 묶는다. 67명을 한 덩어리로 늘어놓으면 찾는 장수가 어디 있는지 알 수 없고,
      // 편성은 어차피 «같은 나라로 맞추는» 일이라 나라가 가장 쓸모 있는 묶음이다.
      const order = ['WEI', 'SHU', 'WU', 'QUN', 'HAN']
      const sorted = [...generals].sort((a, b) => {
        const d = order.indexOf(a.faction) - order.indexOf(b.faction)
        return d !== 0 ? d : a.name.localeCompare(b.name)
      })
      return sorted.map((g) => {
        const at = used.generals.get(g.name)
        const blocked = at !== undefined && g.name !== slot.generalName
        return {
          id: g.id,
          name: g.name,
          group: g.factionLabel,
          label: displayName(g.name, g.season),
          sub: [seasonTag(g.season), g.unitTypeLabel].filter(Boolean).join(" · "),
          disabled: blocked,
          title: blocked ? `${teamLabel(at)}에 이미 배치된 장수입니다` : undefined,
        }
      })
    }

    const here = slot.tacticNames[target.tacticIndex ?? 0]
    return tactics.map((t) => {
      const at = used.tactics.get(t.name)
      const blocked = at !== undefined && t.name !== here
      return {
        id: t.id,
        name: t.name,
        label: displayName(t.name, t.season),
        sub: [seasonTag(t.season), t.categoryLabel ?? (t.dataComplete ? null : "상세 미입력")].filter(Boolean).join(" · ") || undefined,
        disabled: blocked,
        title: blocked
          ? at === target.team
            ? '이 부대에서 이미 쓰고 있는 전법입니다'
            : `${teamLabel(at)}에서 이미 쓰고 있는 전법입니다`
          : undefined,
      }
    })
  }

  const currentPickerId = (target: PickerTarget): string | undefined => {
    const slot = deck[target.team][target.slot]
    if (target.kind === 'GENERAL') {
      return slot.generalName ? generalByName.get(slot.generalName)?.id : undefined
    }
    const name = slot.tacticNames[target.tacticIndex ?? 0]
    return name ? tacticByName.get(name)?.id : undefined
  }

  const idToName = (kind: CardKind, id: string) =>
    kind === 'GENERAL'
      ? (generals.find((g) => g.id === id)?.name ?? '')
      : (tactics.find((t) => t.id === id)?.name ?? '')

  /** 부대 탭에 붙는 «2/3» 같은 표시. 어느 부대가 덜 찼는지 한눈에 보이게 한다. */
  const filledCount = (team: SlotState[]) => team.filter((s) => s.generalName).length

  return (
    <div className="builder">
      <div>
        {error && <div className="error-box">{error}</div>}

        <div className="toolbar">
          <span className="muted">전투 {TURNS}턴 기준으로 분석합니다.</span>
          <div className="spacer" />
          {/*
            보유 등록을 모달이 아니라 «버튼 아래» 로 펼친다.
            편성 슬롯을 보면서 등록해야 무엇이 부족한지 알 수 있는데, 모달은 화면을 덮는다.
          */}
          <button
            aria-pressed={ownedTab === 'GENERAL'}
            className={ownedTab === 'GENERAL' ? 'primary' : ''}
            onClick={() => setOwnedTab(ownedTab === 'GENERAL' ? null : 'GENERAL')}
          >
            장수 <span className="muted">({owned.generals.size})</span>
          </button>
          <button
            aria-pressed={ownedTab === 'TACTIC'}
            className={ownedTab === 'TACTIC' ? 'primary' : ''}
            onClick={() => setOwnedTab(ownedTab === 'TACTIC' ? null : 'TACTIC')}
          >
            전법 <span className="muted">({owned.tactics.size})</span>
          </button>
          <button
            className="primary"
            disabled={generals.length === 0}
            title="보유 카드로 5부대를 한 번에 짭니다"
            onClick={buildDeck}
          >
            덱 편성
          </button>
        </div>

        {recommendNotes.length > 0 && (
          <div className="notice">
            {recommendNotes.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
        )}

        {ownedTab && (
          <OwnedPanel
            kind={ownedTab}
            generals={generals}
            tactics={tactics}
            owned={owned}
            onChanged={setOwned}
          />
        )}

        {!ownedTab && owned.generals.size === 0 && (
          <p className="muted">
            보유 장수가 아직 등록되지 않았습니다. 위 «장수» 버튼을 눌러 가진 카드를 켜두면
            편성에서 그 안에서만 고르게 됩니다.
          </p>
        )}

        {/*
          부대 5개를 한 화면에 다 펼치면 슬롯이 15칸이라 카드가 우표만 해진다.
          탭으로 하나씩 보되, 탭마다 «몇 칸 찼는지»를 적어 다른 부대 상태도 알 수 있게 한다.
        */}
        <div className="team-tabs" role="tablist" aria-label="부대 선택">
          {deck.map((team, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === activeTeam}
              className={`team-tab ${i === activeTeam ? 'active' : ''}`}
              onClick={() => setActiveTeam(i)}
            >
              {teamLabel(i)}
              <span className="muted"> {filledCount(team)}/{SLOT_COUNT}</span>
            </button>
          ))}
        </div>

        {/*
          이 부대가 티어표에서 온 것이면 어느 덱인지 밝힌다. 밝히지 않으면 사용자가 우리
          계산이 지어낸 조합인지 실제로 검증된 덱인지 구분할 수 없다.
        */}
        {activeTierDeck && <TierDeckDetail deck={activeTierDeck} />}

        {/*
          티어표에서 오지 않은 부대는 그렇다고 밝힌다. 밝히지 않으면 검증된 편성과
          우리가 수치로 짜맞춘 것이 같은 무게로 읽힌다.
        */}
        {!activeTierDeck && sources[activeTeam] && (
          <p className="muted" style={{ marginBottom: 10 }}>
            <strong>{sources[activeTeam]}</strong> — 티어덱의 뼈대만 살리고 나머지 자리는
            보유 장수로 메운 편성입니다.
          </p>
        )}

        {!sources[activeTeam] && slots.some((s) => s.generalName) && (
          <p className="muted" style={{ marginBottom: 10 }}>
            ⚠️ 티어표에 없는 조합입니다. 세력·병종·수치로 짜맞춘 것이라 실제로 검증된 편성이
            아닙니다.
          </p>
        )}

        <div className="slots">
          {slots.map((slot, i) => {
            const general = slot.generalName ? generalByName.get(slot.generalName) : undefined
            return (
              <div key={i} className={`slot ${i === 0 ? 'leader' : ''}`}>
                <div className="slot-head">
                  <span>{i === 0 ? '대장' : `부장 ${i}`}</span>
                  {general && (
                    <span className={`faction-chip faction-${general.faction}`}>
                      {general.factionLabel}
                    </span>
                  )}
                </div>

                {general ? (
                  <img
                    className="card-img"
                    src={assetImageUrl('GENERAL', general.name)}
                    alt={general.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="card-img empty">장수 미선택</div>
                )}

                <button
                  className="slot-pick"
                  onClick={() => setPicker({ team: activeTeam, slot: i, kind: 'GENERAL' })}
                >
                  {general ? (
                    <>
                      <span className="slot-pick-name">{displayName(general.name, general.season)}</span>
                      <span className="slot-pick-sub">
                        {[general.unitTypeLabel, general.campLabel].filter(Boolean).join(' · ') ||
                          '분류 미입력'}
                      </span>
                    </>
                  ) : (
                    <span className="slot-pick-empty">＋ 장수 선택</span>
                  )}
                </button>

                {Array.from({ length: TACTICS_PER_SLOT }, (_, t) => {
                  const name = slot.tacticNames[t] ?? ''
                  const tactic = name ? tacticByName.get(name) : undefined
                  return (
                    <button
                      key={t}
                      className="slot-pick"
                      disabled={!slot.generalName}
                      title={!slot.generalName ? '장수를 먼저 고르세요' : undefined}
                      onClick={() =>
                        setPicker({ team: activeTeam, slot: i, kind: 'TACTIC', tacticIndex: t })
                      }
                    >
                      {tactic ? (
                        <>
                          <span className="slot-pick-name">{displayName(tactic.name, tactic.season)}</span>
                          <span className="slot-pick-sub">
                            {tactic.categoryLabel ??
                              (tactic.dataComplete ? '' : '상세 미입력')}
                          </span>
                        </>
                      ) : (
                        <span className="slot-pick-empty">＋ 전법 {t + 1}</span>
                      )}
                    </button>
                  )
                })}

                {/*
                  고유전법은 끼우지 않아도 전투에 들어간다(전투 로그의 «선본»).
                  이걸 모르면 전법 칸에 또 넣어 한 칸을 버리게 된다.
                */}
                {general?.signatureTacticName && (
                  <span className="slot-signature" title="고유전법. 장착하지 않아도 전투에 포함됩니다">
                    고유 · {general.signatureTacticName}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <AnalysisPanel analysis={analysis} />

      {picker && (
        <CardPickerModal
          kind={picker.kind}
          title={
            picker.kind === 'GENERAL'
              ? `${teamLabel(picker.team)} ${picker.slot === 0 ? '대장' : `부장 ${picker.slot}`} 장수 선택`
              : `${teamLabel(picker.team)} 전법 ${(picker.tacticIndex ?? 0) + 1} 선택`
          }
          items={pickerItems(picker)}
          ownedIds={picker.kind === 'GENERAL' ? owned.generals : owned.tactics}
          currentId={currentPickerId(picker)}
          onPick={(id) =>
            picker.kind === 'GENERAL'
              ? pickGeneral(picker.team, picker.slot, idToName('GENERAL', id))
              : pickTactic(picker.team, picker.slot, picker.tacticIndex ?? 0, idToName('TACTIC', id))
          }
          onClear={
            currentPickerId(picker)
              ? () =>
                  picker.kind === 'GENERAL'
                    ? pickGeneral(picker.team, picker.slot, '')
                    : pickTactic(picker.team, picker.slot, picker.tacticIndex ?? 0, '')
              : undefined
          }
          onClose={() => setPicker(null)}
          onOpenCollection={() => {
            // 선택 팝업을 닫고, 위쪽 보유 등록 패널을 같은 종류로 펼친다.
            setPicker(null)
            setOwnedTab(picker.kind)
          }}
        />
      )}
    </div>
  )
}
