import { assetImageUrl } from '../api/client'
import type { CardKind } from '../api/collection'

export interface CardItem {
  id: string
  /** 카드 이미지를 찾는 키. 실제 DB 이름이라 손대면 안 된다 */
  name: string
  /**
   * 묶음 제목. 장수는 나라, 전법은 등급이 들어간다.
   *
   * <p>비어 있으면 묶지 않고 한 덩어리로 그린다.
   */
  group?: string
  /** 화면에 보여줄 이름. 시즌 카드는 «S2» 가 붙는다. 없으면 name 을 쓴다 */
  label?: string
  /** 이름 밑에 작게 붙는 보조 설명. 전법 분류 같은 것 */
  sub?: string
  /** 다른 슬롯에서 이미 쓰고 있는 카드처럼 고를 수 없는 경우 */
  disabled?: boolean
  /** 왜 고를 수 없는지. 마우스를 올리면 보인다 */
  title?: string
}

/**
 * 카드 격자.
 *
 * <p>보유 등록과 편성 선택이 같은 모양을 쓴다. 한쪽만 고치면 두 화면이 달라 보이므로
 * 여기 하나로 모았다.
 *
 * <p>variant 로 «켜고 끄기»(toggle)와 «하나 고르기»(pick)를 구분한다. 등록 화면은 «가진 것»을
 * 밝히는 화면이라 안 가진 카드를 흐리게 두고, 선택 화면은 «고를 수 있는 것»을 밝히는 화면이라
 * 고를 수 있는 카드를 컬러로 두고 이미 쓴 카드를 흑백으로 둔다(App.css 참고).
 *
 * <p>item.group 이 있으면 그 제목으로 묶어 그린다. 장수 67명·전법 160개를 한 덩어리로
 * 늘어놓으면 찾는 카드가 어디 있는지 알 수 없다.
 */
export function CardGrid({
  kind,
  items,
  isOn,
  onPick,
  variant = 'toggle',
}: {
  kind: CardKind
  items: CardItem[]
  isOn: (id: string) => boolean
  onPick: (id: string) => void
  variant?: 'toggle' | 'pick'
}) {
  // 묶음 순서는 넘어온 차례를 그대로 따른다. 부르는 쪽이 나라 순서를 이미 정해 놨다.
  const groups: { title: string; items: CardItem[] }[] = []
  for (const item of items) {
    const title = item.group ?? ''
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.items.push(item)
    else groups.push({ title, items: [item] })
  }

  const grid = (list: CardItem[]) => (
    <div className="collection-grid">
      {list.map((item) => {
        const on = isOn(item.id)
        const img = assetImageUrl(kind, item.name)
        return (
          <button
            key={item.id}
            type="button"
            className={`collection-card ${on ? 'owned' : ''} ${variant === 'pick' ? 'pick' : ''}`}
            aria-pressed={on}
            disabled={item.disabled}
            title={item.title}
            onClick={() => onPick(item.id)}
          >
            {img ? (
              <img src={img} alt="" loading="lazy" />
            ) : (
              <div className="collection-noimg">이미지 없음</div>
            )}
            <span className="collection-name">{item.label ?? item.name}</span>
            {item.sub && <span className="collection-sub">{item.sub}</span>}
            {/* 색만으로 구분하지 않도록 표시를 함께 둔다. */}
            <span className="collection-mark" aria-hidden="true">
              {on ? '✓' : ''}
            </span>
          </button>
        )
      })}
    </div>
  )

  // 묶음이 하나뿐이고 제목도 없으면 예전처럼 격자만 그린다.
  if (groups.length === 1 && !groups[0].title) return grid(groups[0].items)

  return (
    <>
      {groups.map((group) => (
        <div key={group.title} className="card-group">
          <div className="card-group-head">
            <strong>{group.title}</strong>
            <span className="muted">{group.items.length}</span>
          </div>
          {grid(group.items)}
        </div>
      ))}
    </>
  )
}
