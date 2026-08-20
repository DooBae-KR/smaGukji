import { useEffect, useMemo, useState } from 'react'
import { setOwned } from '../api/collection'
import type { CardKind, OwnedCards } from '../api/collection'
import type { General, Tactic } from '../api/types'
import { seasonTag } from "../api/labels"
import { CardGrid } from "../components/CardGrid"

/**
 * 보유 장수·전법 등록 팝업.
 *
 * <p>편성에서 «내가 가진 것만» 고를 수 있게 하기 위한 화면이다.
 * 카드를 누르면 바로 저장한다. «저장» 버튼을 따로 두면 153장을 다 고른 뒤
 * 실수로 닫았을 때 전부 날아간다.
 *
 * <p>저장은 낙관적으로 반영하고 실패하면 되돌린다. 서버를 기다렸다 칠하면
 * 여러 장을 빠르게 누를 때 화면이 끊겨 보인다.
 */
export function CollectionModal({
  generals,
  tactics,
  owned,
  onChanged,
  onClose,
}: {
  generals: General[]
  tactics: Tactic[]
  owned: OwnedCards
  /** 저장이 끝난 뒤 바뀐 목록. 편성 화면이 이걸로 선택지를 다시 그린다. */
  onChanged: (next: OwnedCards) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<CardKind>('GENERAL')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isGeneral = kind === 'GENERAL'
  const ownedIds = isGeneral ? owned.generals : owned.tactics

  /** 지금 탭에서 보여줄 카드. 검색어는 이름으로만 거른다. */
  const items = useMemo(() => {
    const source: { id: string; name: string; sub?: string }[] = isGeneral
      ? generals.map((g) => ({
          id: g.id,
          name: g.name,
          sub: [seasonTag(g.season), g.factionLabel, g.unitTypeLabel].filter(Boolean).join(" · "),
        }))
      : tactics.map((t) => ({
          id: t.id,
          name: t.name,
          sub: [seasonTag(t.season), t.categoryLabel ?? (t.dataComplete ? null : "상세 미입력")].filter(Boolean).join(" · ") || undefined,
        }))

    const needle = query.trim().toLowerCase()
    return needle ? source.filter((x) => x.name.toLowerCase().includes(needle)) : source
  }, [isGeneral, generals, tactics, query])

  /** 낙관적으로 칠하고, 저장에 실패하면 되돌린다. */
  const apply = async (ids: string[], next: boolean) => {
    if (ids.length === 0) return
    const before = new Set(ownedIds)
    const after = new Set(ownedIds)
    ids.forEach((id) => (next ? after.add(id) : after.delete(id)))

    const build = (set: Set<string>): OwnedCards =>
      isGeneral ? { ...owned, generals: set } : { ...owned, tactics: set }

    onChanged(build(after))
    setBusy(true)
    setError(null)
    try {
      await setOwned(kind, ids, next)
    } catch (e) {
      onChanged(build(before))
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const visibleIds = items.map((x) => x.id)
  const visibleOwned = visibleIds.filter((id) => ownedIds.has(id)).length

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="collection-title" style={{ marginTop: 0 }}>
          📦 보유 장수·전법 등록
        </h3>
        <p className="muted" style={{ marginTop: 0 }}>
          가지고 있는 카드를 눌러서 켜두면, 편성에서 «보유한 것만» 골라 쓸 수 있습니다.
          누르는 즉시 저장됩니다.
        </p>

        {error && <div className="error-box">{error}</div>}

        <nav className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={isGeneral}
            onClick={() => setKind('GENERAL')}
          >
            장수 {owned.generals.size}/{generals.length}
          </button>
          <button
            role="tab"
            aria-selected={!isGeneral}
            onClick={() => setKind('TACTIC')}
          >
            전법 {owned.tactics.size}/{tactics.length}
          </button>
        </nav>

        <div className="toolbar">
          <input
            type="search"
            placeholder="이름으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            disabled={busy || visibleOwned === visibleIds.length || visibleIds.length === 0}
            onClick={() => apply(visibleIds.filter((id) => !ownedIds.has(id)), true)}
            title="지금 보이는 카드를 모두 보유로 표시합니다"
          >
            보이는 것 모두 켜기
          </button>
          <button
            disabled={busy || visibleOwned === 0}
            onClick={() => apply(visibleIds.filter((id) => ownedIds.has(id)), false)}
            title="지금 보이는 카드의 보유 표시를 모두 끕니다"
          >
            모두 끄기
          </button>
          <div className="spacer" />
          <span className="muted">
            {query ? `${items.length}장 중 ` : ''}
            {visibleOwned}장 보유 {busy && '· 저장 중…'}
          </span>
        </div>

        {items.length === 0 && (
          <p className="muted">검색 결과가 없습니다.</p>
        )}

        <CardGrid
          kind={kind}
          items={items}
          isOn={(id) => ownedIds.has(id)}
          onPick={(id) => apply([id], !ownedIds.has(id))}
        />

        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button className="primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
