// supabase/functions/send-care-push/index.ts
//
// Daily care digest sender (Phase 4 of docs/ASSISTANT-SPEC.md, v1.9.0).
// Invoked once a day (~9am Eastern) by pg_cron + pg_net — NOT by the app.
// There is no user JWT on this path: callers authenticate with the dedicated
// CRON_SECRET header (x-cron-secret), and everything else is rejected.
//
// Per user with at least one push subscription, the function gathers:
//   - overdue care: plants whose watering/fertilizing interval has lapsed
//     (same rule as lib/utils.ts computeWateringStatus — overdue only,
//     not due-soon)
//   - care_recommendations due today or earlier (status proposed/accepted,
//     due_date set) — this includes diagnosis follow-up checks
// and sends ONE digest push to all of that user's devices, deep-linking to
// Today ('/'). Hard rules: max one push per user per day (enforced via
// push_subscriptions.last_pushed_at, so even a double-fired cron can't spam),
// and total silence on quiet days.
//
// Sends use the `web-push` npm package (VAPID). Subscriptions whose push
// service answers 404/410 are pruned — that's how revoked browser
// permissions clean themselves up server-side.
//
// Request:  POST {} with header  x-cron-secret: <CRON_SECRET>
// Response: { ok, usersConsidered, usersPushed, sent, pruned, skipped }
//
// Secrets (supabase secrets set ...): CRON_SECRET, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: address), plus the standard
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY provided by the platform.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// All "what day is it" math happens in the user's assumed timezone — Eastern,
// matching the app's hardcoded northern-hemisphere season context. en-CA
// formats as YYYY-MM-DD.
const TZ = 'America/New_York'
const DEEP_LINK = '/' // Today

function dateInTz(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

// ── Row shapes (only the columns we select) ──────────────────────────────────

type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  last_pushed_at: string | null
}

type PlantRow = {
  id: string
  user_id: string
  nickname: string
  watering_interval_days: number | null
  fertilizing_interval_days: number | null
}

type CareLogRow = { plant_id: string; type: 'watered' | 'fertilized'; logged_at: string }

type RecommendationRow = { user_id: string; plant_id: string; action: string }

// Mirrors the overdue branch of lib/utils.ts computeWateringStatus: with an
// interval set, a plant is overdue when more days than the interval have
// passed since the last relevant log — or when it has never been logged.
function isOverdue(intervalDays: number | null, lastLoggedAt: string | undefined): boolean {
  if (!intervalDays) return false
  if (!lastLoggedAt) return true
  const daysSince = (Date.now() - new Date(lastLoggedAt).getTime()) / 86_400_000
  return intervalDays - daysSince < 0
}

// One digest body from the item list: up to 4 items shown, the rest counted.
// Notification bodies get clipped by the OS anyway — keep it scannable.
function buildBody(items: string[]): string {
  const shown = items.slice(0, 4)
  const rest = items.length - shown.length
  return shown.join(' · ') + (rest > 0 ? ` · +${rest} more` : '')
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 })
  }

  // ── Caller auth: dedicated shared secret, nothing else ────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    // Refuse to run unauthenticated rather than failing open.
    return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured' }), { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return new Response(JSON.stringify({ error: 'VAPID secrets are not configured' }), { status: 500 })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── 1. Who is subscribed? ──────────────────────────────────────────────────
  const { data: subRows, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, keys, last_pushed_at')
  if (subErr) {
    return new Response(JSON.stringify({ error: `push_subscriptions read failed: ${subErr.message}` }), { status: 500 })
  }
  const subs = (subRows ?? []) as SubscriptionRow[]
  if (subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, usersConsidered: 0, usersPushed: 0, sent: 0, pruned: 0, skipped: 0 }), { status: 200 })
  }

  const today = dateInTz(new Date())
  const subsByUser = new Map<string, SubscriptionRow[]>()
  for (const sub of subs) {
    const list = subsByUser.get(sub.user_id) ?? []
    list.push(sub)
    subsByUser.set(sub.user_id, list)
  }

  // Max one push per day: a user whose ANY subscription was already pushed
  // today (Eastern) is skipped entirely.
  let skipped = 0
  const userIds: string[] = []
  for (const [userId, list] of subsByUser) {
    const pushedToday = list.some(s => s.last_pushed_at && dateInTz(new Date(s.last_pushed_at)) === today)
    if (pushedToday) skipped++
    else userIds.push(userId)
  }
  if (userIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, usersConsidered: subsByUser.size, usersPushed: 0, sent: 0, pruned: 0, skipped }), { status: 200 })
  }

  // ── 2. What needs attention? ───────────────────────────────────────────────
  // Three queries total, regardless of user count (the established enrichment
  // pattern from the Today screen, run with the service role across users).
  const { data: plantRows, error: plantErr } = await supabase
    .from('plants')
    .select('id, user_id, nickname, watering_interval_days, fertilizing_interval_days')
    .in('user_id', userIds)
  if (plantErr) {
    return new Response(JSON.stringify({ error: `plants read failed: ${plantErr.message}` }), { status: 500 })
  }
  const plants = (plantRows ?? []) as PlantRow[]
  const plantIds = plants.map(p => p.id)

  const [logsRes, recsRes] = await Promise.all([
    plantIds.length > 0
      ? supabase
          .from('care_logs')
          .select('plant_id, type, logged_at')
          .in('plant_id', plantIds)
          .in('type', ['watered', 'fertilized'])
          .order('logged_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('care_recommendations')
      .select('user_id, plant_id, action')
      .in('user_id', userIds)
      .in('status', ['proposed', 'accepted'])
      .not('due_date', 'is', null)
      .lte('due_date', today),
  ])
  if (logsRes.error || recsRes.error) {
    const msg = logsRes.error?.message ?? recsRes.error?.message
    return new Response(JSON.stringify({ error: `context read failed: ${msg}` }), { status: 500 })
  }

  // First occurrence per plant+type = most recent (query is ordered descending).
  const latestLog = new Map<string, string>()
  for (const log of (logsRes.data ?? []) as CareLogRow[]) {
    const key = `${log.plant_id}:${log.type}`
    if (!latestLog.has(key)) latestLog.set(key, log.logged_at)
  }

  const plantById = new Map(plants.map(p => [p.id, p]))

  // ── 3. Build each user's digest ────────────────────────────────────────────
  // items: human strings; plantsInvolved: distinct plants, for the title count.
  const digests = new Map<string, { items: string[]; plantsInvolved: Set<string> }>()
  const digestFor = (userId: string) => {
    let d = digests.get(userId)
    if (!d) { d = { items: [], plantsInvolved: new Set() }; digests.set(userId, d) }
    return d
  }

  for (const plant of plants) {
    if (isOverdue(plant.watering_interval_days, latestLog.get(`${plant.id}:watered`))) {
      const d = digestFor(plant.user_id)
      d.items.push(`Water ${plant.nickname}`)
      d.plantsInvolved.add(plant.id)
    }
    if (isOverdue(plant.fertilizing_interval_days, latestLog.get(`${plant.id}:fertilized`))) {
      const d = digestFor(plant.user_id)
      d.items.push(`Feed ${plant.nickname}`)
      d.plantsInvolved.add(plant.id)
    }
  }
  for (const rec of (recsRes.data ?? []) as RecommendationRow[]) {
    const nickname = plantById.get(rec.plant_id)?.nickname
    const d = digestFor(rec.user_id)
    d.items.push(nickname ? `${rec.action} (${nickname})` : rec.action)
    d.plantsInvolved.add(rec.plant_id)
  }

  // ── 4. Send — one digest per user, to all their devices ──────────────────
  let sent = 0
  let pruned = 0
  let usersPushed = 0
  const pushedSubIds: string[] = []
  const deadSubIds: string[] = []

  for (const [userId, digest] of digests) {
    if (digest.items.length === 0) continue // quiet day — stay silent
    const n = digest.plantsInvolved.size
    const payload = JSON.stringify({
      title: n === 1 ? '1 plant needs you 🌿' : `${n} plants need you 🌿`,
      body: buildBody(digest.items),
      url: DEEP_LINK,
    })

    let userGotPush = false
    for (const sub of subsByUser.get(userId) ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        )
        sent++
        userGotPush = true
        pushedSubIds.push(sub.id)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          deadSubIds.push(sub.id) // endpoint revoked/expired — prune below
        } else {
          console.error(`push to ${sub.endpoint.slice(0, 60)}… failed:`, err)
        }
      }
    }
    if (userGotPush) usersPushed++
  }

  // ── 5. Bookkeeping ─────────────────────────────────────────────────────────
  if (pushedSubIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_pushed_at: new Date().toISOString() })
      .in('id', pushedSubIds)
  }
  if (deadSubIds.length > 0) {
    const { error: pruneErr } = await supabase.from('push_subscriptions').delete().in('id', deadSubIds)
    if (!pruneErr) pruned = deadSubIds.length
  }

  return new Response(
    JSON.stringify({ ok: true, usersConsidered: subsByUser.size, usersPushed, sent, pruned, skipped }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
