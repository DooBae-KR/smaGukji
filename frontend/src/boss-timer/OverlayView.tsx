import type { BossTimerRow } from './api'

/**
 * 게임 화면 위에 띄워두는 작은 오버레이 창(데스크톱 Picture-in-Picture 창, 또는
 * 안드로이드 팝업 창) 안에 그리는 내용. 별도 문서(document)에 그려질 수도 있어서
 * boss-timer.css 를 못 가져올 수 있으니 전부 인라인 스타일로만 만든다.
 */

function formatOverlayRemaining(nextSpawnAt: string, now: number): string {
  const diffMs = new Date(nextSpawnAt).getTime() - now
  const sign = diffMs < 0 ? '-' : ''
  const total = Math.floor(Math.abs(diffMs) / 60000)
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return `${sign}${days}일 ${hours}시 ${minutes}분`
  if (hours > 0) return `${sign}${hours}시 ${minutes}분`
  return `${sign}${minutes}분`
}

const OVERLAY_WINDOW_MS = 30 * 60000

interface OverlayViewProps {
  bosses: BossTimerRow[]
  now: number
  /** 데스크톱 PiP 오버레이 전용: 로그인(비밀번호 확인)된 관리자면 여기서 바로 사망 처리를 할 수 있다. */
  isAdmin?: boolean
  onDefeat?: (bossId: string) => void
}

export function OverlayView({ bosses, now, isAdmin, onDefeat }: OverlayViewProps) {
  const sorted = [...bosses]
    .filter((b) => b.is_active && b.notify_enabled && new Date(b.next_spawn_at).getTime() - now <= OVERLAY_WINDOW_MS)
    .sort((a, b) => new Date(a.next_spawn_at).getTime() - new Date(b.next_spawn_at).getTime())

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#14161f',
        color: '#f5f5f7',
        minHeight: '100vh',
        margin: 0,
        padding: '8px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>⚡ 보스 오버레이</div>
      {sorted.length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>30분 이내 등장하는 보스가 없습니다.</div>}
      {sorted.map((b) => {
        const dueMs = new Date(b.next_spawn_at).getTime() - now
        const due = dueMs <= 0
        const soon = dueMs <= 5 * 60000
        return (
          <div
            key={b.boss_id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              padding: '6px 4px',
              borderBottom: '1px solid #2a2d3a',
              background: due ? '#d92626' : 'transparent',
              borderRadius: due ? 6 : 0,
              animation: due ? 'overlay-pulse 1s ease-in-out infinite' : undefined,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {b.level != null && <span style={{ opacity: 0.6, fontWeight: 400, marginRight: 3 }}>Lv{b.level}</span>}
              {b.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 12,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                color: due ? '#fff' : soon ? '#ff6b6b' : '#f5f5f7',
              }}
            >
              {due ? '등장!' : formatOverlayRemaining(b.next_spawn_at, now)}
            </span>
            {isAdmin && onDefeat && (
              <button
                onClick={() => onDefeat(b.boss_id)}
                title="지금 사망 처리 → 쿨타임부터 다시 시작"
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 6px',
                  borderRadius: 5,
                  border: 'none',
                  background: due ? 'rgba(255,255,255,0.25)' : '#3a3d4d',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                💀 사망
              </button>
            )}
          </div>
        )
      })}
      <style>{'@keyframes overlay-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }'}</style>
    </div>
  )
}
