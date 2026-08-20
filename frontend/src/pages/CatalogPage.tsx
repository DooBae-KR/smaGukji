import { useEffect, useMemo, useState } from 'react'
import { assetImageUrl } from '../api/client'
import { listGenerals, listTactics } from '../api/endpoints'
import type { General, Tactic } from '../api/types'

type Kind = 'GENERAL' | 'TACTIC'

export function CatalogPage({ kind }: { kind: Kind }) {
  const [generals, setGenerals] = useState<General[]>([])
  const [tactics, setTactics] = useState<Tactic[]>([])
  const [query, setQuery] = useState('')
  const [faction, setFaction] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = kind === 'GENERAL' ? listGenerals().then(setGenerals) : listTactics().then(setTactics)
    load.catch((e) => setError(e.message))
  }, [kind])

  const filteredGenerals = useMemo(
    () =>
      generals.filter(
        (g) =>
          g.name.includes(query) && (faction === '' || g.faction === faction),
      ),
    [generals, query, faction],
  )

  const filteredTactics = useMemo(
    () => tactics.filter((t) => t.name.includes(query)),
    [tactics, query],
  )

  return (
    <div className="panel">
      <h2>{kind === 'GENERAL' ? '장수' : '전법'}</h2>

      {error && <div className="error-box">{error}</div>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {kind === 'GENERAL' && (
          <select value={faction} onChange={(e) => setFaction(e.target.value)}>
            <option value="">전체 세력</option>
            <option value="WEI">위</option>
            <option value="SHU">촉</option>
            <option value="WU">오</option>
            <option value="QUN">군</option>
          </select>
        )}
        <div className="spacer" />
        <span className="muted">
          {kind === 'GENERAL' ? filteredGenerals.length : filteredTactics.length}개
        </span>
      </div>

      <div className="grid-cards">
        {kind === 'GENERAL'
          ? filteredGenerals.map((g) => (
              <div key={g.id} className="tile">
                <img
                  className="card-img"
                  src={assetImageUrl('GENERAL', g.name)}
                  alt={g.name}
                  loading="lazy"
                />
                <div className="meta">
                  <span className="name">{g.name}</span>
                  <span className="dim">
                    <span className={`faction-chip faction-${g.faction}`}>{g.factionLabel}</span>{' '}
                    {g.rarity && (
                      <span className={`rarity-chip rarity-${g.rarity}`}>
                        {g.rarity === 'LEGEND' ? '전설' : '영웅'}
                      </span>
                    )}{' '}
                    {g.season != null && <span className="chip">S{g.season}</span>}{' '}
                    Lv.{g.level}
                  </span>
                  <span className="dim">
                    {g.campLabel ? `${g.campLabel} · ` : ''}
                    {g.unitTypeLabel ?? '병종 미입력'}
                  </span>
                  {g.dispositionLabels.length > 0 && (
                    <span className="dim">{g.dispositionLabels.join(' · ')}</span>
                  )}
                  {g.might != null && (
                    <span className="dim">
                      무{g.might} 지{g.intellect} 통{g.leadership} 선{g.initiative}
                    </span>
                  )}
                </div>
              </div>
            ))
          : filteredTactics.map((t) => (
              <div key={t.id} className="tile">
                <img
                  className="card-img"
                  src={assetImageUrl('TACTIC', t.name)}
                  alt={t.name}
                  loading="lazy"
                />
                <div className="meta">
                  <span className="name">{t.name}</span>
                  <span className="dim">{t.categoryLabel ?? '분류 미입력'}</span>
                  <span className="dim">
                    {t.triggerRate != null ? `발동 ${t.triggerRate}%` : '발동확률 미입력'}
                  </span>
                </div>
              </div>
            ))}
      </div>
    </div>
  )
}
