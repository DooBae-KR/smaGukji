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
 */
export async function readBattleReport(image: File): Promise<string> {
  const form = new FormData()
  form.append('image', image)

  const { data, error } = await supabase.functions.invoke<{ text: string }>(
    'api/ocr/battle-report',
    { body: form },
  )
  if (error) {
    // FunctionsHttpError 는 context 에 실제 응답(Response)을 담고 있다.
    // 본문은 서버가 준 ProblemDetail 형태({ detail: string }) 라 그 메시지를 우선한다.
    const context = (error as { context?: Response }).context
    const detail: { detail?: string } | null = context ? await context.json().catch(() => null) : null
    throw new Error(detail?.detail ?? error.message)
  }
  if (!data) throw new Error('전보 인식 결과를 받지 못했습니다.')
  return data.text
}
