// lib/utils.ts
// Shared utility functions used across the app.
// Pure functions — no Supabase or Next.js imports.

import type { CareLog } from '@/lib/types'

// ── Date helpers ────────────────────────────────────────────────────────────

// Converts a Date (or ISO timestamp string) → "YYYY-MM-DD" in LOCAL time.
// We use getFullYear/getMonth/getDate (local-time methods), NOT toISOString(),
// to avoid midnight UTC shifting to the previous local day.
export function toLocalDateStr(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Formats a YYYY-MM-DD string for human-readable display, e.g. "March 15, 2024".
// Appends T12:00:00 to prevent midnight UTC from shifting to the previous local day.
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return ''
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Formats an ISO timestamp string for display in timelines.
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Returns a human-friendly relative time string: "today", "yesterday", "3 days ago",
// "2 weeks ago", "3 months ago". Falls back to a formatted date for very old timestamps.
export function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  const weeks = Math.round(days / 7)
  if (weeks < 8) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} month${months === 1 ? '' : 's'} ago`
  return formatTimestamp(iso)
}

// ── Watering status ──────────────────────────────────────────────────────────

export type WateringStatus = 'overdue' | 'due-soon' | 'good' | 'unset'

// Computes a plant's watering status from its interval and most recent watered log.
// - overdue:  days since last watering > interval
// - due-soon: within 1 day of interval (0–1 days left)
// - good:     more than 1 day remaining
// - unset:    no interval configured
export function computeWateringStatus(
  wateringIntervalDays: number | null,
  lastWateredLog: CareLog | null | undefined
): WateringStatus {
  if (!wateringIntervalDays) return 'unset'
  if (!lastWateredLog) return 'overdue'

  const lastWatered = new Date(lastWateredLog.logged_at)
  const now = new Date()
  const daysSince = (now.getTime() - lastWatered.getTime()) / (1000 * 60 * 60 * 24)
  const daysLeft = wateringIntervalDays - daysSince

  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= 1) return 'due-soon'
  return 'good'
}

// ── Care streak ─────────────────────────────────────────────────────────────

// Computes the number of consecutive local calendar days (ending today or yesterday)
// on which any care log was recorded across the user's entire plant collection.
//
// Logic:
//   - Start from today. If today has a log, count it and work backwards.
//   - If today has no log, check yesterday. If yesterday has a log, streak is still
//     "alive" — start counting backwards from yesterday.
//   - Return the count of consecutive days found.
export function computeStreak(logTimestamps: string[]): number {
  if (logTimestamps.length === 0) return 0

  const dateSet = new Set(logTimestamps.map(toLocalDateStr))

  function subtractDay(dateStr: string, n = 1): string {
    const d = new Date(`${dateStr}T12:00:00`)
    d.setDate(d.getDate() - n)
    return toLocalDateStr(d)
  }

  const todayStr = toLocalDateStr(new Date())
  let checkDate = todayStr

  // If today has no log, try yesterday before giving up
  if (!dateSet.has(checkDate)) {
    checkDate = subtractDay(checkDate)
    if (!dateSet.has(checkDate)) return 0
  }

  // Count backwards through consecutive days
  let streak = 0
  while (dateSet.has(checkDate)) {
    streak++
    checkDate = subtractDay(checkDate)
  }
  return streak
}

// Computes the maximum consecutive-day streak across all log history (not just current).
export function computeMaxStreak(logTimestamps: string[]): number {
  if (logTimestamps.length === 0) return 0
  const dates = Array.from(new Set(logTimestamps.map(toLocalDateStr))).sort()
  let max = 1, run = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T12:00:00`)
    const curr = new Date(`${dates[i]}T12:00:00`)
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000)
    if (diffDays === 1) { run++; if (run > max) max = run } else run = 1
  }
  return max
}

// ── Care log labels ──────────────────────────────────────────────────────────

export const CARE_LOG_LABELS: Record<string, string> = {
  watered:       'Watered',
  fertilized:    'Fertilized',
  note:          'Note',
  repotted:      'Repotted',
  pruned:        'Pruned',
  misted:        'Misted',
  pest_treatment:'Pest Treatment',
  moved:         'Moved',
  measured:      'Measured',
}

// computeFertilizingStatus is structurally identical to computeWateringStatus —
// same interval + last-log logic, just for fertilizing. Exported separately
// so call-sites read clearly.
export const computeFertilizingStatus = computeWateringStatus

// Sort order for urgency — lower number = higher urgency
export const URGENCY_ORDER: Record<WateringStatus, number> = {
  overdue:   0,
  'due-soon': 1,
  good:      2,
  unset:     3,
}

// ── File helpers ─────────────────────────────────────────────────────────────

// Reads a File and returns the raw base64 string (without the data: URI prefix).
// Used when sending images to Edge Functions that accept base64.
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      resolve(res.includes(',') ? res.split(',')[1] : res)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
