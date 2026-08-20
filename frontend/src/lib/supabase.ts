import { createClient } from '@supabase/supabase-js'

/**
 * Supabase 클라이언트.
 *
 * <p>인사팀 데이터는 이제 Render 를 거치지 않고 여기로 직접 간다.
 * Render 무료 인스턴스는 유휴 15분 뒤 잠들어 깨는 데 수십 초가 걸리는데,
 * 첫 화면인 로그인이 거기 묶여 있으면 앱이 고장난 것처럼 보인다.
 * Supabase 는 항상 켜져 있으므로 로그인·명부·마커는 콜드 스타트를 겪지 않는다.
 *
 * <p>권한은 프론트가 아니라 DB 의 RLS 정책이 판단한다. 여기 있는 코드는
 * 화면을 정리하는 용도일 뿐이고, 실제 차단은 서버에서 일어난다.
 * anon 키는 공개되는 값이며, 그것만으로는 아무 데이터도 읽을 수 없다.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * 설정이 빠졌는지 알려주기 위해 남겨둔다.
 * 던지지 않는 이유: 설정이 없어도 화면은 떠야 «설정하라»는 안내를 보여줄 수 있다.
 */
export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. 로그인 기능이 동작하지 않습니다.',
  )
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: {
    // 탭을 닫으면 로그아웃된다. 공용 PC 를 쓰는 경우가 많아 기존 동작을 유지한다.
    storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    // 이메일 링크로 들어오는 흐름이 없다. URL 을 뒤질 필요가 없다.
    detectSessionInUrl: false,
  },
})

/**
 * 로그인 아이디를 Supabase 가 요구하는 이메일 형태로 바꾼다.
 *
 * <p>사용자는 «cjswhrnr» 같은 아이디를 쓰지만 Supabase Auth 는 이메일 기반이다.
 * 그래서 고정 도메인을 붙여 이메일처럼 만든다. 실제로 메일을 보내지 않으므로
 * 기본값은 절대 실재하지 않는 예약 도메인(.invalid, RFC 2606)을 쓴다.
 *
 * <p>이 규칙 때문에 Supabase 대시보드에서 «Confirm email» 을 꺼야 한다.
 * 켜져 있으면 받을 수 없는 주소로 확인 메일을 보내고 로그인이 막힌다.
 */
const EMAIL_DOMAIN = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN ?? 'smagukji.invalid'

export function loginIdToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${EMAIL_DOMAIN}`
}

/** 화면에 보여줄 아이디. 합성 이메일에서 도메인을 떼어낸다. */
export function emailToLoginId(email: string | undefined): string {
  return (email ?? '').split('@')[0]
}

/**
 * Supabase 오류를 사람이 읽을 문장으로 바꾼다.
 *
 * <p>RLS 로 막히면 데이터가 «없는 것처럼» 보이거나 권한 오류가 난다.
 * 그대로 보여주면 무슨 일인지 알 수 없으므로 자주 나오는 것만 옮긴다.
 */
export function friendlyError(e: unknown): string {
  const message = (e as { message?: string })?.message ?? String(e)

  if (/Invalid login credentials/i.test(message)) return '아이디 또는 비밀번호가 올바르지 않습니다.'
  if (/Email not confirmed/i.test(message)) {
    return '메일 확인이 켜져 있어 로그인할 수 없습니다. Supabase 설정에서 «Confirm email» 을 꺼주세요.'
  }
  if (/User already registered/i.test(message)) return '이미 쓰고 있는 아이디입니다.'
  if (/Password should be at least/i.test(message)) return '비밀번호가 너무 짧습니다.'
  if (/row-level security|permission denied/i.test(message)) {
    return '권한이 없습니다. 관리자에게 문의하세요.'
  }
  if (/Failed to fetch|NetworkError/i.test(message)) return '서버에 연결하지 못했습니다.'
  return message
}
