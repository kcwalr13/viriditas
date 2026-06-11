// lib/notifications.ts
// Web Push helpers for the "Care reminders" opt-in (assistant Phase 4, v1.9.0).
// The browser side of the push pipeline:
//   Settings opt-in → service worker (/sw.js) → PushManager subscription
//   → row in push_subscriptions → daily digest from the send-care-push
//   Edge Function (pg_cron-scheduled).
//
// The VAPID *public* key is read from NEXT_PUBLIC_VAPID_PUBLIC_KEY (build-time
// env — set it in .env.local and the Vercel dashboard). The private key never
// touches this codebase; it lives only in Supabase secrets.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Capability detection ─────────────────────────────────────────────────────

// True when this browser can do Web Push at all. On iOS Safari this is false
// in a normal tab — PushManager only exists once the app is installed to the
// Home Screen (A2HS) and opened from there.
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Best-effort iOS detection (used only to pick the right explanation copy —
// never to gate functionality). Modern iPadOS masquerades as macOS, so we also
// check for touch on "Mac" platforms.
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  )
}

// True when running as an installed PWA (standalone display mode).
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean } // iOS-only legacy flag
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

// ── Subscription state ───────────────────────────────────────────────────────

// Returns this browser's existing push subscription, or null. Does not
// register the service worker — purely a read.
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

// ── Enable / disable ─────────────────────────────────────────────────────────

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no-key' | 'permission-denied' | 'error'; detail?: string }

// Full opt-in flow. Must be called from a user gesture (button click) —
// Notification.requestPermission() is rejected otherwise, especially on iOS.
export async function enableCareReminders(
  supabase: SupabaseClient,
  userId: string
): Promise<EnableResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return { ok: false, reason: 'no-key' }

  try {
    // 1. Register the service worker (idempotent — re-registering the same
    //    script is a no-op) and wait until it is active.
    await navigator.serviceWorker.register('/sw.js')
    const reg = await navigator.serviceWorker.ready

    // 2. Ask for notification permission inside the click gesture.
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'permission-denied' }

    // 3. Subscribe with the VAPID public key. Reuses the existing
    //    subscription when one is already present.
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }))

    // 4. Persist to push_subscriptions. The endpoint is globally unique per
    //    browser+profile, so upserting on it means re-enabling never duplicates.
    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      await subscription.unsubscribe()
      return { ok: false, reason: 'error', detail: 'Subscription was missing its keys.' }
    }
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
      { onConflict: 'endpoint' }
    )
    if (error) {
      // Don't leave a browser subscription the server doesn't know about.
      await subscription.unsubscribe()
      return { ok: false, reason: 'error', detail: error.message }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

// Revoke flow: delete the row first (so the server stops sending), then
// unsubscribe in the browser. Both steps are best-effort.
export async function disableCareReminders(supabase: SupabaseClient): Promise<void> {
  const subscription = await getExistingSubscription()
  if (!subscription) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// PushManager.subscribe wants the VAPID key as bytes; web-push tooling hands
// it out as a base64url string. Standard conversion. The explicit ArrayBuffer
// backing narrows the type to Uint8Array<ArrayBuffer>, which BufferSource
// requires under TypeScript 5.7+.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}
