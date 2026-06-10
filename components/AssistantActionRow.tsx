'use client'
// components/AssistantActionRow.tsx
// Shared UI for the assistant's structured recommendations (Phase 1).
// Used on Today (proposed cards + accepted task rows) and on Plant Detail
// (inline rows in the AI diagnosis card) so Accept / Done / Dismiss looks
// and behaves identically everywhere.
//
// The component is presentation-only: callers own the Supabase mutations
// (lib/recommendations.ts) and pass handlers in.

import { useState } from 'react'
import { Icon } from './Icon'
import type { CareRecommendation, DismissedReason, RecommendationUrgency } from '@/lib/types'

// Urgency → editorial tone. now=danger, soon=warn, routine=neutral (spec 1.4).
export const URGENCY_META: Record<RecommendationUrgency, { label: string; chipClass: string }> = {
  now:     { label: 'Now',     chipClass: 'bg-danger-soft text-danger' },
  soon:    { label: 'Soon',    chipClass: 'bg-warn-soft text-warn'     },
  routine: { label: 'Routine', chipClass: 'bg-paper-alt text-ink-muted' },
}

const DISMISS_REASONS: Array<{ key: DismissedReason; label: string; sub: string }> = [
  { key: 'wrong',        label: 'Not right',     sub: 'This advice doesn’t fit this plant' },
  { key: 'already_done', label: 'Already done',  sub: 'I’d taken care of it before this'   },
  { key: 'later',        label: 'Maybe later',   sub: 'Not now — clear it from the list'        },
]

// Days from `from` until a YYYY-MM-DD due date, in local time. Negative =
// overdue. Callers pass the clock in: components that get server-rendered
// (Today) must use their mounted `now` state, never the render-body clock —
// see the hydration note in TodayClient (v1.5.1 pattern).
export function daysUntil(ymd: string, from: Date): number {
  const due = new Date(`${ymd}T12:00:00`)
  const today = new Date(from)
  today.setHours(12, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export function dueLabel(rec: CareRecommendation, from: Date): { text: string; overdue: boolean } | null {
  if (!rec.due_date) return null
  const d = daysUntil(rec.due_date, from)
  if (d < 0)  return { text: `${-d}d overdue`, overdue: true }
  if (d === 0) return { text: 'due today', overdue: false }
  if (d === 1) return { text: 'due tomorrow', overdue: false }
  return { text: `due in ${d}d`, overdue: false }
}

// ── AssistantActionRow ──────────────────────────────────────────────────────
export function AssistantActionRow({
  rec, plantName, busy, now,
  onAccept, onDone, onDismiss,
}: {
  rec: CareRecommendation
  plantName?: string           // shown on Today; omitted on Plant Detail
  busy: boolean
  // The clock for due-date labels. Server-rendered callers (Today) pass
  // their mounted `now` state — null hides the label until mount, keeping
  // SSR and hydration identical. Client-only callers may omit it.
  now?: Date | null
  onAccept?: () => void        // for interval suggestions this opens the confirm sheet
  onDone?: () => void
  onDismiss?: () => void       // opens the dismiss sheet
}) {
  const [showWhy, setShowWhy] = useState(false)
  const urgency = URGENCY_META[rec.urgency] ?? URGENCY_META.routine
  const due = now === null ? null : dueLabel(rec, now ?? new Date())
  const isInterval = rec.interval_suggestion !== null
  const resolved = rec.status === 'done' || rec.status === 'dismissed' || rec.status === 'expired'

  return (
    <div className="py-3">
      {/* Header: plant + urgency + due date */}
      <div className="flex items-center gap-2 mb-1">
        {plantName && (
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted truncate">
            {plantName}
          </span>
        )}
        <span className={`font-mono text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full ${urgency.chipClass}`}>
          {urgency.label}
        </span>
        {due && (
          <span className={`font-mono text-[9px] tracking-[0.08em] uppercase ${due.overdue ? 'text-danger' : 'text-ink-muted'}`}>
            {due.text}
          </span>
        )}
        {resolved && (
          <span className="ml-auto font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted">
            {rec.status === 'done' ? (
              <span className="text-accent">Done</span>
            ) : rec.status === 'expired' ? 'Expired' : (
              `Dismissed${rec.dismissed_reason === 'already_done' ? ' · already done' : rec.dismissed_reason === 'wrong' ? ' · not right' : ''}`
            )}
          </span>
        )}
        {rec.status === 'accepted' && !plantName && (
          <span className="ml-auto font-mono text-[9px] tracking-[0.12em] uppercase text-accent">Accepted</span>
        )}
      </div>

      {/* The action itself */}
      <div className={`font-sans text-[14px] font-medium tracking-[-0.01em] leading-snug ${resolved ? 'text-ink-muted' : 'text-ink'}`}>
        {rec.action}
      </div>

      {/* Rationale — collapsible serif footnote */}
      {rec.rationale && (
        <>
          {showWhy && (
            <p className="mt-1.5 font-serif italic text-[13px] text-ink-soft leading-snug" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
              {rec.rationale}
            </p>
          )}
          <button
            onClick={() => setShowWhy(v => !v)}
            className="mt-1 text-[11px] text-accent font-medium"
          >
            {showWhy ? 'Hide' : 'Why?'}
          </button>
        </>
      )}

      {/* Controls */}
      {!resolved && (onAccept || onDone || onDismiss) && (
        <div className="mt-2.5 flex items-center gap-2">
          {rec.status === 'proposed' && onAccept && (
            <button
              onClick={onAccept}
              disabled={busy}
              className="px-3.5 py-1.5 rounded-full bg-accent text-paper text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Icon name="check" size={12} stroke={2.2} className="text-paper" />
              {isInterval ? 'Review' : 'Accept'}
            </button>
          )}
          {!isInterval && onDone && (
            <button
              onClick={onDone}
              disabled={busy}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50 ${
                rec.status === 'accepted'
                  ? 'bg-accent text-paper'
                  : 'border border-rule text-ink'
              }`}
            >
              {rec.status === 'accepted' && <Icon name="check" size={12} stroke={2.2} className="text-paper" />}
              Done
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium text-ink-muted disabled:opacity-50"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── DismissSheet ────────────────────────────────────────────────────────────
// Bottom sheet capturing why a recommendation was dismissed (spec 1.4).
export function DismissSheet({
  onSelect, onClose, busy,
}: {
  onSelect: (reason: DismissedReason) => void
  onClose: () => void
  busy: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl border-t border-rule p-5 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif italic text-[20px] text-ink">Dismiss this suggestion?</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-paper-alt">
            <Icon name="close" size={16} stroke={2} className="text-ink-muted" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {DISMISS_REASONS.map(r => (
            <button
              key={r.key}
              onClick={() => onSelect(r.key)}
              disabled={busy}
              className="w-full px-4 py-3 bg-paper border border-rule rounded-brand text-left disabled:opacity-50"
            >
              <div className="font-sans text-[14px] font-medium text-ink">{r.label}</div>
              <div className="text-[12px] text-ink-soft mt-0.5">{r.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── IntervalConfirmSheet ────────────────────────────────────────────────────
// Confirmation before a suggested schedule change is applied. The schedule
// never moves without this tap (spec house rule: no silent automation).
export function IntervalConfirmSheet({
  rec, plantName, onConfirm, onClose, busy,
}: {
  rec: CareRecommendation
  plantName?: string
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const s = rec.interval_suggestion
  if (!s) return null
  const label = s.type === 'watering' ? 'Watering' : 'Fertilizing'
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl border-t border-rule p-5 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif italic text-[20px] text-ink">Adjust the schedule?</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-paper-alt">
            <Icon name="close" size={16} stroke={2} className="text-ink-muted" />
          </button>
        </div>

        {plantName && (
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-2">
            {plantName}
          </div>
        )}

        {/* The change, stated plainly: "Watering: every 7d → every 10d" */}
        <div className="px-4 py-3.5 bg-paper-alt border border-rule rounded-brand text-center">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1">{label}</div>
          <div className="font-serif text-[20px] text-ink">
            {s.current_days ? `every ${s.current_days}d` : 'no schedule'}
            <span className="text-ink-muted px-2">&rarr;</span>
            <span className="text-accent">every {s.suggested_days}d</span>
          </div>
        </div>

        {s.reason && (
          <p className="mt-3 font-serif italic text-[14px] text-ink-soft leading-snug" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
            {s.reason}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 rounded-full border border-rule text-ink-soft text-[13px] font-medium disabled:opacity-50"
          >
            Keep current
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-full bg-accent text-paper text-[13px] font-medium disabled:opacity-50"
          >
            {busy ? 'Applying…' : 'Apply change'}
          </button>
        </div>
      </div>
    </div>
  )
}
