// 카카오 i 오픈빌더 스킬 서버.
//
// 오픈빌더 챗봇은 "먼저 말 거는" 걸 못 한다 — 사용자가 뭔가 보내야만 이 함수가 불려서
// 응답을 만든다. 그래서 "등장 5분 전 자동 알림"은 여기서 못 하고(카카오 플랫폼 자체의
// 제약), 대신 사람이 명령을 보내면 답하는 형태로 만든다(2026-09-05 결정).
//
//   /알리미            → 다음 등장 목록 (5분 이내는 강조)
//   /알리미 보스현황     → 위와 동일
//   /알리미 <보스이름> 클리어 → 그 보스를 "방금 잡음" 으로 표시해 쿨타임을 다시 돌린다
//                          (쿨타임형 spawn_type=1 에서만 뜻이 있다)
//
// 방 비밀번호는 요청마다 오는 게 아니라 이 함수의 환경변수(Edge Function secrets)로 미리
// 넣어둔다. 오픈빌더 쪽에 방 비밀번호를 노출할 방법이 없고, 이 봇은 방 하나만 담당하면
// 되기 때문이다. 대시보드에서 설정한다:
//   supabase secrets set BOSS_ROOM_SLUG=hera2 BOSS_ROOM_PASSWORD=... --project-ref <ref>

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const ROOM_SLUG = Deno.env.get('BOSS_ROOM_SLUG') ?? ''
const ROOM_PASSWORD = Deno.env.get('BOSS_ROOM_PASSWORD') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function simpleText(text: string) {
  return {
    version: '2.0',
    template: { outputs: [{ simpleText: { text } }] },
  }
}

function formatRemaining(nextSpawnAt: string, now: number): string {
  const diffMs = new Date(nextSpawnAt).getTime() - now
  if (diffMs < 0) return '등장함'
  const total = Math.floor(diffMs / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}시간 ${m}분 후` : `${m}분 후`
}

interface BossRow {
  boss_id: string | null
  name: string
  is_active: boolean
  notify_enabled: boolean
  next_spawn_at: string
  spawn_type: number
}

async function loadBosses(): Promise<BossRow[]> {
  const { data, error } = await supabase.rpc('boss_timer_room_view', { p_slug: ROOM_SLUG })
  if (error) throw new Error(error.message)
  return ((data ?? []) as BossRow[]).filter((r) => r.boss_id !== null && r.is_active)
}

async function handleStatus(): Promise<string> {
  const bosses = await loadBosses()
  if (bosses.length === 0) return '등록된 보스가 없습니다.'

  const now = Date.now()
  const sorted = [...bosses].sort(
    (a, b) => new Date(a.next_spawn_at).getTime() - new Date(b.next_spawn_at).getTime(),
  )
  const lines = sorted.slice(0, 15).map((b) => {
    const diffMin = (new Date(b.next_spawn_at).getTime() - now) / 60000
    const mark = diffMin <= 5 && diffMin >= 0 ? '🔥 ' : ''
    return `${mark}${b.name} — ${formatRemaining(b.next_spawn_at, now)}`
  })
  return lines.join('\n')
}

async function handleClear(bossName: string): Promise<string> {
  if (!ROOM_PASSWORD) return '봇 설정이 아직 안 끝났습니다 (방 비밀번호 미설정).'

  const bosses = await loadBosses()
  const matches = bosses.filter((b) => b.name.includes(bossName))

  if (matches.length === 0) return `"${bossName}" 이름의 보스를 못 찾았습니다.`
  if (matches.length > 1) {
    return `"${bossName}" 로 여러 보스가 걸립니다: ${matches.map((m) => m.name).join(', ')}\n정확한 이름으로 다시 시도해주세요.`
  }

  const boss = matches[0]
  if (boss.spawn_type !== 1) {
    return `${boss.name} 은 자동으로 다음 등장이 계산되는 보스라 클리어가 필요 없습니다.`
  }

  const { data, error } = await supabase.rpc('boss_timer_mark_death', {
    p_slug: ROOM_SLUG,
    p_password: ROOM_PASSWORD,
    p_id: boss.boss_id,
    p_use_max: false,
  })
  if (error) return `쿨타임 적용 실패: ${error.message}`
  if (!data) return `${boss.name} 을 찾지 못했습니다.`
  return `✅ ${boss.name} 클리어 처리했습니다. 쿨타임이 다시 시작됩니다.`
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 })
  }

  let utterance = ''
  try {
    const body = await req.json()
    utterance = (body?.userRequest?.utterance ?? '').trim()
  } catch {
    // 카카오가 아닌 다른 요청(헬스체크 등)이면 그냥 흘려보낸다.
  }

  const withoutSlash = utterance.replace(/^\//, '').trim()
  const clearMatch = withoutSlash.match(/^알리미\s+(.+?)\s*클리어$/)
  const statusMatch = withoutSlash.match(/^알리미(\s+(보스현황|현황|상태))?$/)

  try {
    let text: string
    if (clearMatch) {
      text = await handleClear(clearMatch[1].trim())
    } else if (statusMatch) {
      text = await handleStatus()
    } else {
      text = '사용법:\n· "/알리미" 또는 "/알리미 보스현황" — 다음 등장 목록\n· "/알리미 <보스이름> 클리어" — 방금 잡은 보스 쿨타임 갱신'
    }
    return new Response(JSON.stringify(simpleText(text)), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify(simpleText(`오류: ${(e as Error).message}`)), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
