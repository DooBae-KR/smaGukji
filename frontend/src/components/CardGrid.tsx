import { assetImageUrl } from '../api/client'
import type { CardKind } from '../api/collection'

export interface CardItem {
  id: string
  /** 카드 이미지를 찾는 키. 실제 DB 이름이라 손대면 안 된다 */
  name: string
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
 * <p>variant 로 «켜고 끄기»(toggle)와 «하나 고르기»(pick)를 구분한다.
 * 등록 화면에서는 켜지 않은 카드를 흐리게 해서 무엇을 가졌는지 한눈에 보여야 하지만,
 * 선택 화면에서는 어차피 고를 수 있는 것만 나오므로 흐리게 할 이유가 없다.
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
  return (
    <div className="collection-grid">
      {items.map((item) => {
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
}
