import { useMemo, useState } from 'react'
import type { DirectorySnapshot, MarkerCode, MarkerMeta, MemberRow } from '../../api/hr'

const NUMBER = new Intl.NumberFormat('ko-KR')

function num(v?: number) {
  return v == null ? '—' : NUMBER.format(v)
}

export function MemberGrid({
  snapshot,
  meta,
  busyCid,
  onToggle,
}: {
  snapshot: DirectorySnapshot
  meta: MarkerMeta[]
  busyCid: string | null
  onToggle: (row: MemberRow, code: MarkerCode, next: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MarkerCode | ''>('')
  const [sort, setSort] = useState<keyof MemberRow>('memberName')
  const [desc, setDesc] = useState(false)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = snapshot.rows.filter((r) => {
      if (filter && !r.markers.includes(filter)) return false
      if (!needle) return true
      return (
        r.memberName.toLowerCase().includes(needle) ||
        r.cid.includes(needle) ||
        (r.job ?? '').toLowerCase().includes(needle) ||
        (r.position ?? '').toLowerCase().includes(needle)
      )
    })
    // 정렬 방향을 비교 함수 안에서 처리한다. reverse() 를 쓰면 정렬이 anti-stable 해지고,
    // 값이 빈 행(null)이 내림차순에서 맨 위로 올라온다.
    const dir = desc ? -1 : 1
    return [...filtered].sort((a, b) => {
      const av = a[sort]
      const bv = b[sort]
      // 빈 값은 방향과 무관하게 항상 뒤로 보낸다.
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'ko') * dir
    })
  }, [snapshot.rows, query, filter, sort, desc])

  const header = (key: keyof MemberRow, label: string, align: 'left' | 'right' = 'left') => (
    <th
      style={{ textAlign: align, cursor: 'pointer', whiteSpace: 'nowrap' }}
      onClick={() => {
        if (sort === key) setDesc((d) => !d)
        else {
          setSort(key)
          setDesc(false)
        }
      }}
    >
      {label}
      {sort === key && <span style={{ marginLeft: 4 }}>{desc ? '▼' : '▲'}</span>}
    </th>
  )

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="멤버·cid·직업·직위 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as MarkerCode | '')}>
          <option value="">마커 전체</option>
          {meta.map((m) => (
            <option key={m.code} value={m.code}>
              {m.label}만
            </option>
          ))}
        </select>
        <div className="spacer" />
        <span className="muted">
          {rows.length} / {snapshot.rows.length}명
        </span>
      </div>

      <div className="grid-scroll">
        <table className="data grid">
          <thead>
            <tr>
              {header('cid', 'cid')}
              {header('memberName', '멤버')}
              {header('job', '직업')}
              {header('position', '직위')}
              {header('teamGroup', '조별')}
              {header('prosperity', '번영', 'right')}
              {header('weeklyMerit', '주간 무훈', 'right')}
              {header('weeklyContribution', '주간 공헌', 'right')}
              {header('weeklySiegeCount', '공성', 'right')}
              {header('garrison', '주둔지')}
              <th style={{ whiteSpace: 'nowrap' }}>마커</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cid} className={r.markers.includes('CAUTION') ? 'row-caution' : ''}>
                <td><code>{r.cid}</code></td>
                <td>
                  {r.memberName}
                  {r.openCautionCount > 0 && (
                    <span className="caution-badge" title={r.latestCaution}>
                      주의 {r.openCautionCount}
                    </span>
                  )}
                </td>
                <td>{r.job ?? '—'}</td>
                <td>{r.position ?? '—'}</td>
                <td>{r.teamGroup ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{num(r.prosperity)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.weeklyMerit)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.weeklyContribution)}</td>
                <td style={{ textAlign: 'right' }}>{num(r.weeklySiegeCount)}</td>
                <td className="muted">{r.garrison ?? '—'}</td>
                <td>
                  <div className="marker-buttons">
                    {meta.map((m) => {
                      const on = r.markers.includes(m.code)
                      return (
                        <button
                          key={m.code}
                          type="button"
                          className={`marker-btn ${on ? 'on' : ''}`}
                          style={on ? { background: m.color, borderColor: m.color, color: '#12100e' } : { borderColor: m.color, color: m.color }}
                          disabled={busyCid === r.cid}
                          aria-pressed={on}
                          title={`${m.label} ${on ? '끄기' : '켜기'}`}
                          onClick={() => onToggle(r, m.code, !on)}
                        >
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  조건에 맞는 동맹원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
