import { supabase } from '../lib/supabase'

/**
 * 전보 스크린샷 → 텍스트 (Supabase Edge Function «api», /ocr/battle-report).
 *
 * <p>서버가 NVIDIA 비전 모델을 대신 불러 옮겨 적은 텍스트를 돌려준다. 열쇠
 * (NVIDIA_API_KEY)는 Edge Function 환경에만 있어야 한다 — 브라우저에서 NVIDIA 를
 * 직접 부르면 페이지 소스로 열쇠가 새어나가고, 사용량이 그 열쇠로 청구된다.
 *
 * <p>functions.invoke 의 첫 인자에 하위 경로를 붙이면(«api/ocr/battle-report»)
 * 이 함수가 담당하는 여러 경로 중 하나로 라우팅된다 — 다른 화면이 쓰는
 * sheets/sync · tactics/completeness 등과 같은 함수 안에서 나뉜다.
 *
 * <p>실패는 세 가지 결이 다르다. 화면이 «왜 안 됐는지» 를 보여줄 수 있게 여기서
 * 종류별로 사람이 읽을 메시지로 바꾼다 — «인식 중…» 이 조용히 멈추는 것보다,
 * 무엇이 잘못됐는지 아는 편이 훨씬 낫다.
 * <ul>
 *   <li>FunctionsHttpError — 함수가 응답은 했지만 실패(4xx/5xx). 본문에 담긴
 *       ProblemDetail({@code detail}) 을 그대로 보여준다. 열쇠 미설정(503),
 *       NVIDIA 호출 실패(502) 가 여기 해당한다.</li>
 *   <li>FunctionsFetchError — 요청 자체가 서버에 닿지 못했다. CORS 차단이나
 *       네트워크 단절이 이 모양으로 나타난다.</li>
 *   <li>FunctionsRelayError — Supabase 릴레이가 함수에 닿지 못했다(배포 문제 등).</li>
 * </ul>
 */
export async function readBattleReport(image: File): Promise<string> {
  const form = new FormData()
  form.append('image', image)

  const { data, error } = await supabase.functions.invoke<{ text: string }>(
    'api/ocr/battle-report',
    { body: form },
  )
  if (error) {
    throw new Error(await describeError(error))
  }
  if (!data?.text) throw new Error('전보 인식 결과를 받지 못했습니다. (서버가 빈 응답을 돌려줬습니다)')
  return data.text
}

async function describeError(error: unknown): Promise<string> {
  const name = (error as { name?: string })?.name
  const message = error instanceof Error ? error.message : String(error)

  if (name === 'FunctionsHttpError') {
    // context 는 실제 응답(Response). 본문은 서버가 준 ProblemDetail 형태({ detail }) 다.
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const body: { detail?: string } | null = await context.json().catch(() => null)
      if (body?.detail) return `인식 실패: ${body.detail}`
    }
    return `인식 실패: ${message}`
  }

  if (name === 'FunctionsFetchError') {
    return '인식 실패: 서버에 연결하지 못했습니다. 네트워크 상태를 확인하거나, ' +
      'CORS 허용 목록(INTEGRATION_ALLOWED_ORIGINS 아님, Edge Function 의 CORS_ALLOWED_ORIGINS)에 ' +
      '이 사이트 주소가 들어 있는지 관리자에게 확인을 요청하세요.'
  }

  if (name === 'FunctionsRelayError') {
    return `인식 실패: Supabase 가 인식 서버에 연결하지 못했습니다. (${message})`
  }

  return `인식 실패: ${message}`
}
