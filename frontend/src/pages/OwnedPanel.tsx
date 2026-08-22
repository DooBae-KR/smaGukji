import { useMemo, useState } from 'react'
import { setOwned } from '../api/collection'
import type { CardKind, OwnedCards } from '../api/collection'
import {
  FACTION_LABEL,
  FACTION_ORDER,
  RARITY_LABEL,
  RARITY_ORDER,
  displayName,
  label,
} from '../api/labels'
import type { General, Tactic } from '../api/types'

/**
 * 보유 장수·전법 등록 패널.
 *
 * <p>모달이 아니라 버튼 «아래»에 펼쳐진다. 편성 슬롯을 보면서 등록할 수 있어야
 * 무엇이 부족한지 알 수 있는데, 모달은 화면을 덮어 그게 안 된다.
 *
 * <p>장수는 나라별로, 전법은 등급별로 묶는다. 목록이 각각 67개·160개라
 * 한 줄로 늘어놓으면 찾을 수가 없다.
 *
 * <p>누르면 바로 저장한다. «저장» 버튼을 따로 두면 한참 고른 뒤 실수로 닫았을 때
 * 전부 날아간다. 화면은 먼저 칠하고 실패하면 되돌린다.
 */
export function OwnedPanel({
  kind,
  generals,
  tactics,
  owned,
  onChanged,
}: {
  kind: CardKind
  generals: General[]
  tactics: Tactic[]
  owned: OwnedCards
  onChanged: (next: OwnedCards) => void
}) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isGeneral = kind === 'GENERAL'
  const ownedIds = isGeneral ? owned.generals : owned.tactics

  /** 나라별(장수) 또는 등급별(전법) 묶음. */
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const match = (name: string) => !needle || name.toLowerCase().includes(needle)

    if (isGeneral) {
      const byFaction = new Map<string, General[]>()
      for (const g of generals) {
        if (!match(g.name)) continue
        const key = g.faction ?? '(미입력)'
        byFaction.set(key, [...(byFaction.get(key) ?? []), g])
      }
      // 알려진 나라를 먼저, 그 밖의 것은 뒤에 붙인다.
      const keys = [
        ...FACTION_ORDER.filter((f) => byFaction.has(f)),
        ...[...byFaction.keys()].filter((f) => !FACTION_ORDER.includes(f)),
      ]
      return keys.map((key) => ({
        key,
        title: label(FACTION_LABEL, key) ?? key,
        items: byFaction.get(key)!.map((g) => ({ id: g.id, name: g.name, season: g.season })),
      }))
    }

    const byRarity = new Map<string, Tactic[]>()
    for (const t of tactics) {
      if (!match(t.name)) continue
      const key = t.rarity ?? '(미분류)'
      byRarity.set(key, [...(byRarity.get(key) ?? []), t])
    }
    const keys = [
      ...RARITY_ORDER.filter((r) => byRarity.has(r)),
      ...[...byRarity.keys()].filter((r) => !RARITY_ORDER.includes(r)),
    ]
    return keys.map((key) => ({
      key,
      title: RARITY_LABEL[key] ?? key,
      items: byRarity.get(key)!.map((t) => ({ id: t.id, name: t.name, season: t.season })),
    }))
  }, [isGeneral, generals, tactics, query])

  /** 화면을 먼저 칠하고, 저장에 실패하면 되돌린다. */
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

  const total = isGeneral ? generals.length : tactics.length

  return (
    <div className="owned-panel">
      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="이름으로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spacer" />
        <span className="muted">
          보유 {ownedIds.size} / {total}
          {busy && ' · 저장 중…'}
        </span>
      </div>

      {groups.length === 0 && <p className="muted">검색 결과가 없습니다.</p>}

      {groups.map((group) => {
        const ids = group.items.map((x) => x.id)
        const on = ids.filter((id) => ownedIds.has(id)).length
        return (
          <div key={group.key} className="owned-group">
            <div className="owned-group-head">
              <strong>{group.title}</strong>
              <span className="muted">
                {on}/{ids.length}
              </span>
              <div className="spacer" />
              <button
                disabled={busy || on === ids.length}
                onClick={() => apply(ids.filter((id) => !ownedIds.has(id)), true)}
              >
                모두 켜기
              </button>
              <button disabled={busy || on === 0} onClick={() => apply(ids.filter((id) => ownedIds.has(id)), false)}>
                모두 끄기
              </button>
            </div>

            <div className="owned-names">
              {group.items.map((item) => {
                const isOn = ownedIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`owned-name ${isOn ? 'on' : ''}`}
                    aria-pressed={isOn}
                    onClick={() => apply([item.id], !isOn)}
                  >
                    {displayName(item.name, item.season)}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
