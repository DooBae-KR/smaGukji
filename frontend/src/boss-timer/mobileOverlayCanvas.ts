import type { BossTimerRow } from './api'

/**
 * 안드로이드는 <video> 에 대한 진짜 Picture-in-Picture(다른 앱 위에 계속 뜨는 작은 창)만
 * 지원하고 임의의 HTML 은 PiP로 못 띄운다. 그래서 보스 목록을 캔버스에 그림으로 그린 뒤
 * canvas.captureStream() 으로 동영상 스트림을 만들어 그 동영상에 PiP를 거는 방식으로
 * 우회한다. 이 파일은 그 "그림 그리기" 부분만 담당한다.
 */

function formatRemaining(nextSpawnAt: string, now: number): string {
  const diffMs = new Date(nextSpawnAt).getTime() - now
  if (diffMs <= 0) return '등장!'
  const total = Math.floor(diffMs / 60000)
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return `${days}일 ${hours}시 ${minutes}분`
  if (hours > 0) return `${hours}시 ${minutes}분`
  return `${minutes}분`
}

export function drawOverlayFrame(canvas: HTMLCanvasElement, bosses: BossTimerRow[], now: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = '#14161f'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#f5f5f7'
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.fillText('⚡ 보스 오버레이', 10, 20)

  const sorted = [...bosses]
    .filter((b) => b.is_active && b.notify_enabled)
    .sort((a, b) => new Date(a.next_spawn_at).getTime() - new Date(b.next_spawn_at).getTime())

  const rowHeight = 26
  let y = 40
  if (sorted.length === 0) {
    ctx.fillStyle = '#9a9caa'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText('알림 켜진 보스가 없습니다.', 10, y)
    return
  }

  for (const b of sorted) {
    if (y > h - 8) break // 캔버스 높이를 넘으면 그만 그린다.
    const due = new Date(b.next_spawn_at).getTime() - now <= 0
    if (due) {
      ctx.fillStyle = '#d92626'
      ctx.fillRect(4, y - 16, w - 8, rowHeight - 4)
    }
    ctx.fillStyle = due ? '#ffffff' : '#f5f5f7'
    ctx.font = '13px system-ui, sans-serif'
    const label = b.level != null ? `Lv${b.level} ${b.name}` : b.name
    ctx.fillText(label.length > 9 ? label.slice(0, 8) + '…' : label, 10, y)

    ctx.textAlign = 'right'
    ctx.fillStyle = due ? '#ffffff' : '#ff6b6b'
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText(formatRemaining(b.next_spawn_at, now), w - 10, y)
    ctx.textAlign = 'left'

    y += rowHeight
  }
}
