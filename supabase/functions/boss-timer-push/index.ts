// 보스 등장 5분 전 웹 푸시. pg_cron(boss_timer_push_kick, 1분마다) 이 이 함수를 깨운다.
//
// 카카오톡 봇(boss-timer-bot)과는 별개 경로다. 여기는 진짜로 폰에 푸시가 뜨는 쪽이고,
// 브라우저에서 알림을 허용하고 구독한 기기에만 간다(boss_timer_push_subscription).
//
// 인증: agent_kick 과 같은 1회용 토큰 패턴. pg_cron 이 boss_timer_push_token 에 토큰을
// 하나 만들고 헤더로 넘기면, 여기서 그 토큰이 유효한지 확인하고 즉시 지운다(재사용 방지).
// 그 외의 요청(그냥 URL로 접속 등)은 토큰이 없으니 401 로 막힌다.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

interface DueBoss {
  boss_id: string
  room_id: string
  name: string
  next_spawn_at: string
}

interface Subscription {
  id: string
  room_id: string
  endpoint: string
  p256dh: string
  auth: string
  quiet_start: number
  quiet_end: number
}

/** 지금(Asia/Seoul 기준) 이 구독의 허용 시간대 안인지. start<=end 면 [start,end), start>end 면 자정을 넘는 구간(예: 22~06). */
function withinQuietHours(quietStart: number, quietEnd: number): boolean {
  if (quietStart === 0 && quietEnd === 24) return true
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date()),
  ) % 24
  if (quietStart <= quietEnd) return hour >= quietStart && hour < quietEnd
  return hour >= quietStart || hour < quietEnd
}

interface Mute {
  subscription_id: string
  boss_id: string
}

Deno.serve(async (req: Request) => {
  const token = req.headers.get('x-boss-token')
  if (!token) return new Response('unauthorized', { status: 401 })

  const { data: deleted, error: tokenErr } = await supabase
    .from('boss_timer_push_token')
    .delete()
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .select('token')
  if (tokenErr || !deleted || deleted.length === 0) {
    return new Response('unauthorized', { status: 401 })
  }

  await supabase.rpc('boss_timer_recompute_all')

  const { data: due, error: dueErr } = await supabase.rpc('boss_timer_push_due')
  if (dueErr) {
    return new Response(JSON.stringify({ error: dueErr.message }), { status: 500 })
  }
  const dueBosses = (due ?? []) as DueBoss[]
  if (dueBosses.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  const roomIds = [...new Set(dueBosses.map((b) => b.room_id))]
  const { data: subs, error: subsErr } = await supabase
    .from('boss_timer_push_subscription')
    .select('id, room_id, endpoint, p256dh, auth, quiet_start, quiet_end')
    .in('room_id', roomIds)
  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), { status: 500 })
  }
  const subscriptions = (subs ?? []) as Subscription[]

  const subIds = subscriptions.map((s) => s.id)
  const mutedPairs = new Set<string>()
  if (subIds.length > 0) {
    const { data: mutes, error: muteErr } = await supabase
      .from('boss_timer_push_mute')
      .select('subscription_id, boss_id')
      .in('subscription_id', subIds)
    if (muteErr) {
      return new Response(JSON.stringify({ error: muteErr.message }), { status: 500 })
    }
    for (const m of (mutes ?? []) as Mute[]) mutedPairs.add(`${m.subscription_id}:${m.boss_id}`)
  }

  let sent = 0
  const staleIds: string[] = []

  for (const boss of dueBosses) {
    // 방 전체 알림은 켜져 있지만(그래서 여기까지 왔지만), 이 보스를 개인적으로 꺼뒀거나
    // 지금이 그 기기의 "알림 받는 시간대" 밖이면 건너뛴다.
    const targets = subscriptions.filter(
      (s) =>
        s.room_id === boss.room_id &&
        !mutedPairs.has(`${s.id}:${boss.boss_id}`) &&
        withinQuietHours(s.quiet_start, s.quiet_end),
    )
    const payload = JSON.stringify({
      title: '⚡ 보스 등장 임박',
      body: `${boss.name} 이(가) 5분 후 등장합니다!`,
    })

    for (const sub of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          staleIds.push(sub.id)
        }
      }
    }
  }

  if (staleIds.length > 0) {
    await supabase.from('boss_timer_push_subscription').delete().in('id', staleIds)
  }

  return new Response(JSON.stringify({ sent, bosses: dueBosses.length, staleRemoved: staleIds.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
