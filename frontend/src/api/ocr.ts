import { request } from './client'

/**
 * 전보 스크린샷 → 텍스트 (Render).
 *
 * <p>이미지를 서버로 올리면 서버가 NVIDIA 비전 모델을 대신 불러 옮겨 적은 텍스트를
 * 돌려준다. 열쇠(NVIDIA_API_KEY)가 서버에만 있어야 하므로, 이 호출을 거치지 않고
 * 브라우저에서 NVIDIA 를 직접 부르면 안 된다.
 */
export async function readBattleReport(image: File): Promise<string> {
  const form = new FormData()
  form.append('image', image)
  const { text } = await request<{ text: string }>('/ocr/battle-report', {
    method: 'POST',
    body: form,
  })
  return text
}
