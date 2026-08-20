import { useEffect, useMemo, useState } from 'react'
import type { CardKind } from '../api/collection'
import { CardGrid } from '../components/CardGrid'
import type { CardItem } from '../components/CardGrid'

/**
 * 편성에서 장수·전법을 고르는 팝업.
 *
 * <p>기본적으로 «보유 등록»에 켜둔 카드만 보여준다. 실제로 가진 것 중에서 고르는 것이
 * 편성이기 때문이다. 아직 등록을 안 했거나 빠뜨린 카드가 있을 수 있어 «전체 보기»를 함께 둔다.
 */
export function CardPickerModal({
  kind,
  title,
  items,
  ownedIds,
  currentId,
  onPick,
  onClear,
  onClose,
  onOpenCollection,
}: {
  kind: CardKind
  title: string
  /** 고를 수 있는 전체 후보. 보유 여부와 무관하게 넘긴다 */
  items: CardItem[]
  ownedIds: Set<string>
  /** 지금 이 칸에 들어 있는 카드. 격자에서 표시된다 */
  currentId?: string
  onPick: (id: string) => void
  /** 비우기. 이미 고른 것이 있을 때만 쓴다 */
  onClear?: () => void
  onClose: () => void
  /** 보유 등록 화면으로 보낸다. 등록된 것이 없을 때 길을 열어준다 */
  onOpenCollection: () => void
}) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(ownedIds.size === 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const visible = useMemo(() => {
    // 이미 고른 카드는 보유 목록에 없어도 남긴다. 사라지면 무엇이 들어 있었는지 알 수 없다.
    const base = showAll
      ? items
      : items.filter((i) => ownedIds.has(i.id) || i.id === currentId)
    const needle = query.trim().toLowerCase()
    return needle ? base.filter((i) => i.name.toLowerCase().includes(needle)) : base
  }, [items, ownedIds, showAll, currentId, query])

  const ownedCount = items.filter((i) => ownedIds.has(i.id)).length

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="picker-title" style={{ marginTop: 0 }}>
          {title}
        </h3>

        <div className="toolbar">
          <input
            type="search"
            placeholder="이름으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <label className="checkline" title="보유 등록에 없는 카드까지 모두 보여줍니다">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            전체 보기
          </label>
          <div className="spacer" />
          {onClear && (
            <button onClick={onClear} title="이 칸을 비웁니다">
              비우기
            </button>
          )}
          <button onClick={onClose}>닫기</button>
        </div>

        {!showAll && ownedCount === 0 ? (
          <p className="muted">
            등록된 보유 카드가 없습니다. «📦 보유 등록»에서 가진 것을 켜두면 여기에 나옵니다.
            <br />
            <button style={{ marginTop: 8 }} onClick={onOpenCollection}>
              보유 등록 열기
            </button>
          </p>
        ) : visible.length === 0 ? (
          <p className="muted">검색 결과가 없습니다.</p>
        ) : (
          <CardGrid
            kind={kind}
            items={visible}
            isOn={(id) => id === currentId}
            onPick={onPick}
            variant="pick"
          />
        )}

        <p className="muted" style={{ marginTop: 8 }}>
          {showAll ? `전체 ${items.length}장` : `보유 ${ownedCount}장`}
          {query && ` · 검색 결과 ${visible.length}장`}
        </p>
      </div>
    </div>
  )
}
