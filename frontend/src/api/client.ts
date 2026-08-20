export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

/**
 * 백엔드는 실패 시 RFC 7807 ProblemDetail 을 돌려준다. detail 을 그대로 에러 메시지로 쓴다.
 *
 * ⚠️ 헤더 병합 순서가 중요하다. `...init` 을 먼저 펴고 `headers` 를 나중에 조립해야 한다.
 * 반대로 하면 init.headers 가 계산된 헤더 객체를 통째로 덮어써서 Content-Type 이 사라지고,
 * 브라우저가 text/plain 을 붙여 Spring 이 415 로 거절한다.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      // FormData 는 브라우저가 boundary 를 포함해 직접 정해야 하므로 손대지 않는다.
      ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    // ProblemDetail 이면 detail, Spring 기본 오류(415 등)면 message 를 쓴다.
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? body?.message ?? `${res.status} ${res.statusText}`)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

import cardImages from '../generated/card-images.json'

/**
 * 카드 이미지 주소.
 *
 * <p>예전에는 Render 가 DB 에서 꺼내 내려줬다. 그러면 무료 인스턴스가 잠든 동안
 * 카드 131장이 전부 깨져 화면이 통째로 망가진 것처럼 보인다.
 * 지금은 빌드에 포함된 정적 파일을 쓰므로 Render 와 무관하게 항상 뜬다.
 *
 * <p>파일 이름은 내용 해시다. 한글 파일명의 URL 인코딩 문제를 피하고,
 * 내용이 바뀌면 이름도 바뀌어 캐시를 영구 보관해도 안전하다.
 * 대응표는 tools/export-card-images.js 가 DB 에서 만들어 낸다.
 */
export function assetImageUrl(category: 'GENERAL' | 'TACTIC', name: string): string | undefined {
  const file = (cardImages as Record<string, string>)[`${category}/${name}`]
  return file ? `${import.meta.env.BASE_URL}cards/${file}` : undefined
}
