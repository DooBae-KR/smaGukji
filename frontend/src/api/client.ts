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

export function assetImageUrl(category: 'GENERAL' | 'TACTIC', name: string): string {
  return `${API_BASE}/assets/${category}/${encodeURIComponent(name)}/image`
}
