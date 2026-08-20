import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeDraft, listGenerals, listTactics } from '../api/endpoints'
import { assetImageUrl } from '../api/client'
import { EMPTY_OWNED, loadOwned } from '../api/collection'
import type { CardKind, OwnedCards } from '../api/collection'
import type { General, Tactic, TeamAnalysis, TeamRequest } from '../api/types'
import { seasonTag } from "../api/labels"
import type { CardItem } from "../components/CardGrid"
import { AnalysisPanel } from '../components/AnalysisPanel'
import { CardPickerModal } from './CardPickerModal'
import { CollectionModal } from './CollectionModal'

const SLOT_COUNT = 3
const TACTICS_PER_SLOT = 2

/**
 * 시뮬레이션 턴 수.
 *
 * <p>천하결전 전투는 8턴에 끝난다. 고를 수 있는 값이 아니라 규칙이므로 입력칸을 두지 않는다.
 * (예전에는 코스트 상한도 입력받았는데, 이 게임에는 코스트라는 개념 자체가 없다)
 */
const TURNS = 8

interface SlotState {
  generalName: string
  tacticNames: (string | '')[]
}

const EMPTY_SLOT: SlotState = { generalName: '', tacticNames: ['', ''] }

/** 지금 열려 있는 선택 팝업이 어느 칸을 위한 것인지. */
interface PickerTarget {
  slot: number
  kind: CardKind
  /** 전법일 때 몇 번째 칸인지 */
  tacticIndex?: number
}

export function BuilderPage() {
  const [generals, setGenerals] = useState<General[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: SLOT_COUNT }, () => ({ ...EMPTY_SLOT, tacticNames: ['', ''] })),
  )
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 보유 목록. 편성은 «가진 것 중에서» 고르는 일이라 선택 팝업이 이걸 기준으로 걸러준다.
  const [owned, setOwned] = useState<OwnedCards>(EMPTY_OWNED)
  const [showCollection, setShowCollection] = useState(false)
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

  const request: TeamRequest = useMemo(
    () => ({
      name: '편성 미리보기',
      slots: slots
        .map((s, i) => ({
          position: i + 1,
          generalName: s.generalName,
          tacticNames: s.tacticNames.filter((n): n is string => n !== ''),
        }))
        .filter((s) => s.generalName !== ''),
    }),
    [slots],
  )

  // 편성이 바뀔 때마다 서버에 분석을 요청한다. 연타를 막기 위해 짧게 디바운스한다.
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (request.slots.length === 0) {
      setAnalysis(null)
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      analyzeDraft(request, TURNS)
        .then((a) => {
          setAnalysis(a)
          setError(null)
        })
        .catch((e) => setError(e.message))
    }, 250)
    return () => window.clearTimeout(timer.current)
  }, [request])

  const setSlot = useCallback((index: number, next: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)))
  }, [])

  /** 이미 다른 슬롯에 배치된 장수는 고를 수 없다. 백엔드도 같은 규칙으로 거절한다. */
  const usedGenerals = new Set(slots.map((s) => s.generalName).filter(Boolean))

  const pickGeneral = (slotIndex: number, name: string) => {
    setSlot(slotIndex, { generalName: name })
    setPicker(null)
  }

  const pickTactic = (slotIndex: number, tacticIndex: number, name: string) => {
    const next = [...slots[slotIndex].tacticNames]
    next[tacticIndex] = name
    setSlot(slotIndex, { tacticNames: next })
    setPicker(null)
  }

  /** 선택 팝업에 넘길 후보 목록. 고를 수 없는 것은 이유와 함께 막아둔다. */
  const pickerItems = (target: PickerTarget): CardItem[] => {
    const slot = slots[target.slot]
    if (target.kind === 'GENERAL') {
      return generals.map((g) => ({
        id: g.id,
        name: g.name,
        sub: [seasonTag(g.season), g.factionLabel, g.unitTypeLabel].filter(Boolean).join(" · "),
        disabled: usedGenerals.has(g.name) && g.name !== slot.generalName,
        title: usedGenerals.has(g.name) && g.name !== slot.generalName
          ? '다른 칸에 이미 배치된 장수입니다'
          : undefined,
      }))
    }
    return tactics.map((t) => {
      const takenHere =
        slot.tacticNames.includes(t.name) && slot.tacticNames[target.tacticIndex ?? 0] !== t.name
      return {
        id: t.id,
        name: t.name,
        sub: [seasonTag(t.season), t.categoryLabel ?? (t.dataComplete ? null : "상세 미입력")].filter(Boolean).join(" · ") || undefined,
        disabled: takenHere,
        title: takenHere ? '이 장수에게 이미 넣은 전법입니다' : undefined,
      }
    })
  }

  const currentPickerId = (target: PickerTarget): string | undefined => {
    const slot = slots[target.slot]
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

  return (
    <div className="builder">
      <div>
        {error && <div className="error-box">{error}</div>}

        <div className="toolbar">
          <span className="muted">전투 {TURNS}턴 기준으로 분석합니다.</span>
          <div className="spacer" />
          <button onClick={() => setShowCollection(true)}>
            📦 보유 등록
            <span className="muted"> ({owned.generals.size + owned.tactics.size})</span>
          </button>
          <button
            onClick={() =>
              setSlots(
                Array.from({ length: SLOT_COUNT }, () => ({ ...EMPTY_SLOT, tacticNames: ['', ''] })),
              )
            }
          >
            초기화
          </button>
        </div>

        {owned.generals.size === 0 && (
          <p className="muted">
            보유 장수가 아직 등록되지 않았습니다. «📦 보유 등록»에서 가진 카드를 켜두면
            장수·전법 선택이 그 안에서만 나옵니다.
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
                  onClick={() => setPicker({ slot: i, kind: 'GENERAL' })}
                >
                  {general ? (
                    <>
                      <span className="slot-pick-name">{general.name}</span>
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
                      onClick={() => setPicker({ slot: i, kind: 'TACTIC', tacticIndex: t })}
                    >
                      {tactic ? (
                        <>
                          <span className="slot-pick-name">{tactic.name}</span>
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
              ? `${picker.slot === 0 ? '대장' : `부장 ${picker.slot}`} 장수 선택`
              : `전법 ${(picker.tacticIndex ?? 0) + 1} 선택`
          }
          items={pickerItems(picker)}
          ownedIds={picker.kind === 'GENERAL' ? owned.generals : owned.tactics}
          currentId={currentPickerId(picker)}
          onPick={(id) =>
            picker.kind === 'GENERAL'
              ? pickGeneral(picker.slot, idToName('GENERAL', id))
              : pickTactic(picker.slot, picker.tacticIndex ?? 0, idToName('TACTIC', id))
          }
          onClear={
            currentPickerId(picker)
              ? () =>
                  picker.kind === 'GENERAL'
                    ? pickGeneral(picker.slot, '')
                    : pickTactic(picker.slot, picker.tacticIndex ?? 0, '')
              : undefined
          }
          onClose={() => setPicker(null)}
          onOpenCollection={() => {
            setPicker(null)
            setShowCollection(true)
          }}
        />
      )}

      {showCollection && (
        <CollectionModal
          generals={generals}
          tactics={tactics}
          owned={owned}
          onChanged={setOwned}
          onClose={() => setShowCollection(false)}
        />
      )}
    </div>
  )
}
