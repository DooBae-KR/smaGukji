import type { TierDeck } from '../lib/tier'

/**
 * 티어표가 그 덱에 대해 적어 둔 것 전부.
 *
 * <p>편성 화면은 장수와 전법만 보여준다. 그런데 시트에는 그 밖에도 진형·병종·병종 특화·병서·
 * 장비 속성·장비·탈것·스탯 투자까지 적혀 있고, 이것들이 실제로 덱을 그 티어로 만드는
 * 조건이다. 앱이 다루지 않는 값이라 편성에 자동으로 넣을 수는 없지만, 감춰두면 사용자가
 * 게임에서 그대로 맞출 수가 없다. 그래서 «시트에 적힌 그대로» 보여준다.
 *
 * <p>가공하지 않는 이유가 있다. «선공 230 나머지 무력» 같은 지침은 사람이 사람에게 쓴 말이라
 * 우리가 숫자로 바꾸면 뜻이 좁아진다.
 */
export function TierDeckDetail({ deck }: { deck: TierDeck }) {
  return (
    <div className="tier-detail">
      <div className="tier-detail-head">
        <span className="tier-badge">{deck.tier != null ? `T${deck.tier}` : '티어 미표기'}</span>
        <strong>{deck.name}</strong>
        {deck.formation && <span className="tier-formation">{deck.formation}</span>}
      </div>

      {deck.description && <p className="muted">{deck.description}</p>}

      <div className="tier-table-wrap">
        <table className="data tier-table">
          <thead>
            <tr>
              <th />
              {deck.generals.map((g) => (
                <th key={g.name}>{g.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="전법" values={deck.generals.map((g) => g.tactics.map((o) => o.join(' 또는 ')))} />
            <Row label="대체 전법" values={deck.generals.map((g) => g.alternativeTactics)} />
            <Row label="병종" values={deck.generals.map((g) => [g.unitType])} />
            <Row label="병종 특화" values={deck.generals.map((g) => [g.unitSpecialty])} />
            <Row label="병서" values={deck.generals.map((g) => g.books)} />
            <Row label="장비 속성" values={deck.generals.map((g) => [g.gearAttribute])} />
            <Row label="장비" values={deck.generals.map((g) => g.gear)} />
            <Row label="탈것" values={deck.generals.map((g) => g.mount)} />
            <Row label="스탯" values={deck.generals.map((g) => [g.statPlan])} />
          </tbody>
        </table>
      </div>

      <p className="muted">
        진형·병종·병서·장비·탈것·스탯은 앱이 다루지 않는 값이라 편성에 자동으로 들어가지
        않습니다. <strong>게임에서 직접 맞춰야</strong> 이 덱이 표에 적힌 성능을 냅니다.
      </p>
    </div>
  )
}

/** 값이 하나도 없는 줄은 그리지 않는다. 빈 칸만 늘어놓으면 표가 읽기 어려워진다. */
function Row({ label, values }: { label: string; values: string[][] }) {
  if (values.every((v) => v.filter(Boolean).length === 0)) return null
  return (
    <tr>
      <th scope="row">{label}</th>
      {values.map((list, i) => (
        <td key={i}>
          {list.filter(Boolean).length === 0 ? (
            <span className="muted">—</span>
          ) : (
            // 값이 같은 줄이 겹칠 수 있다(초선의 병서는 «장서각» 이 세 줄이다).
            // 그래서 값이 아니라 자리를 키로 쓴다.
            list.filter(Boolean).map((v, vi) => <div key={vi}>{v}</div>)
          )}
        </td>
      ))}
    </tr>
  )
}
