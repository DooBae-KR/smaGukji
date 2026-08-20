import cardImages from '../generated/card-images.json'
import { supabase } from '../lib/supabase'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

/**
 * 계산 전용 백엔드(Render) 호출.
 *
 * <p>조회와 인사 데이터는 Supabase 로 직접 가므로 여기 오는 것은 시뮬레이션·파싱·갱신뿐이다.
 * 무료 인스턴스는 유휴 15분 뒤 잠들어 첫 요청이 수십 초 걸린다. 버튼을 눌러서 하는 일이라
 * 기다림 자체는 괜찮지만, 아무 표시도 없으면 고장난 줄 안다. 그래서 느려지면 알린다.
 */

// ---------------------------------------------------------------
// 서버가 깨어나는 중인지 알리기
// ---------------------------------------------------------------

/** 이 시간을 넘기면 «잠든 서버를 깨우는 중» 으로 본다. 깨어 있으면 보통 1초 안에 끝난다. */
const WAKING_AFTER_MS = 4000

type WakeListener = (waking: boolean) => void

const listeners = new Set<WakeListener>()
let slowCalls = 0

/** 오래 걸리는 호출이 하나라도 있으면 true 가 온다. 화면에서 안내를 띄우는 데 쓴다. */
export function onServerWaking(fn: WakeListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 0 ↔ 1 이상으로 바뀌는 순간에만 알린다. 호출이 여러 개여도 안내는 하나다. */
function setSlow(delta: number) {
  const wasQuiet = slowCalls === 0
  slowCalls = Math.max(0, slowCalls + delta)
  if (wasQuiet !== (slowCalls === 0)) {
    listeners.forEach((fn) => fn(slowCalls > 0))
  }
}

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

  // Render 는 이제 Supabase 가 발급한 토큰만 받는다. 없으면 401 이다.
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  let counted = false
  const timer = window.setTimeout(() => {
    counted = true
    setSlow(1)
  }, WAKING_AFTER_MS)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        // FormData 는 브라우저가 boundary 를 포함해 직접 정해야 하므로 손대지 않는다.
        ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })

    if (!res.ok) {
      if (res.status === 401) throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.')
      if (res.status === 403) throw new Error('권한이 없습니다. 관리자만 할 수 있는 작업입니다.')
      // ProblemDetail 이면 detail, Spring 기본 오류(415 등)면 message 를 쓴다.
      const body = await res.json().catch(() => null)
      throw new Error(body?.detail ?? body?.message ?? `${res.status} ${res.statusText}`)
    }
    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timer)
    if (counted) setSlow(-1)
  }
}

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
