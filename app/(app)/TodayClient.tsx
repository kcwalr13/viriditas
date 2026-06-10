'use client'
// app/(app)/TodayClient.tsx
// Today — presentation layer. Receives enriched cards + streak + journal
// peek from the Server Component and renders the editorial home screen.
import Link from 'next/link'
import Image from 'next/image'
import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BigTitle, SectionLabel, StatusPip, HairlineButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import { AssistantActionRow, DismissSheet, IntervalConfirmSheet, daysUntil, dueLabel } from '@/components/AssistantActionRow'
import { relativeTime } from '@/lib/utils'
import {
  acceptRecommendation, completeRecommendation, dismissRecommendation,
  applyIntervalSuggestion, expireStaleRecommendations,
} from '@/lib/recommendations'
import { createClient } from '@/lib/supabase/client'
import type { NoteCategory, DismissedReason } from '@/lib/types'
import type { PlantCard, JournalPeek, RecommendationCard } from './page'

const NOTE_CATEGORIES: Array<{ key: NoteCategory; label: string }> = [
  { key: 'growth',      label: 'Growth'      },
  { key: 'pest',        label: 'Pest'        },
  { key: 'environment', label: 'Environment' },
  { key: 'concern',     label: 'Concern'     },
  { key: 'general',     label: 'General'     },
]

interface Props {
  cards: PlantCard[]
  streak: number
  journalPeek: JournalPeek
  tendedToday: number
  activityDays: string[]   // YYYY-MM-DD strings with at least one care log
  weeklyLogs: number
  recommendations: RecommendationCard[]   // open (proposed + accepted) assistant recommendations
  userId: string
}

export default function TodayClient({ cards, streak, journalPeek, tendedToday, activityDays, weeklyLogs, recommendations, userId }: Props) {
  // The server renders this component in UTC (Vercel), then the browser
  // hydrates it in the user's local timezone. Any value derived from
  // `new Date()` during render can therefore differ between the two and
  // trigger React hydration error #418 — e.g. after 8 PM Eastern the server
  // is already on tomorrow's date, and the greeting hour bucket differs.
  // Fix: `now` starts null, so SSR and the first client render are identical;
  // an effect sets it after mount, when local-time values are safe to show.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])

  // Build 14-day activity grid: array of { dateStr, active } from oldest (13 days ago) to today.
  const activitySet = new Set(activityDays)
  const activityGrid = Array.from({ length: 14 }, (_, i) => {
    // Pre-mount: neutral placeholder cells, identical on server and client.
    if (!now) return { dateStr: `cell-${i}`, active: false, isToday: false }
    const d = new Date(now)
    d.setDate(d.getDate() - (13 - i))
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { dateStr, active: activitySet.has(dateStr), isToday: i === 13 }
  })
  const router = useRouter()
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const [bulkLogging, setBulkLogging] = useState(false)
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)

  // Quick add-note sheet state
  const [showAddNote,  setShowAddNote]  = useState(false)
  const [notePlantId,  setNotePlantId]  = useState('')
  const [noteText,     setNoteText]     = useState('')
  const [noteCategory, setNoteCategory] = useState<NoteCategory | null>(null)
  const [addingNote,   setAddingNote]   = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Assistant recommendation state (Phase 1)
  const [recBusyId,      setRecBusyId]      = useState<string | null>(null)
  const [dismissTarget,  setDismissTarget]  = useState<RecommendationCard | null>(null)
  const [intervalTarget, setIntervalTarget] = useState<RecommendationCard | null>(null)
  // Rows resolved this session. The server props stay stale until
  // router.refresh() lands, so without this a just-completed row would
  // re-render actionable for a moment — and a second "Done" tap would
  // write a duplicate care log.
  const [resolvedRecIds, setResolvedRecIds] = useState<Set<string>>(new Set())

  // Phase 1.6 expiry: on Today load, retire proposals older than 14 days.
  // Runs once per mount; only refreshes when something actually expired.
  useEffect(() => {
    expireStaleRecommendations(createClient(), userId).then(count => {
      if (count > 0) router.refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // Sort overdue by how many days past-due the most urgent need is (worst first).
  const overdue = useMemo(() => {
    const list = cards.filter(c => c.wateringStatus === 'overdue' || c.fertilizingStatus === 'overdue')
    return list.sort((a, b) => {
      const aDays = Math.max(
        a.wateringStatus === 'overdue' && a.daysSinceWatered !== null && a.plant.watering_interval_days ? a.daysSinceWatered - a.plant.watering_interval_days : 0,
        a.fertilizingStatus === 'overdue' && a.daysSinceFertilized !== null && a.plant.fertilizing_interval_days ? a.daysSinceFertilized - a.plant.fertilizing_interval_days : 0,
      )
      const bDays = Math.max(
        b.wateringStatus === 'overdue' && b.daysSinceWatered !== null && b.plant.watering_interval_days ? b.daysSinceWatered - b.plant.watering_interval_days : 0,
        b.fertilizingStatus === 'overdue' && b.daysSinceFertilized !== null && b.plant.fertilizing_interval_days ? b.daysSinceFertilized - b.plant.fertilizing_interval_days : 0,
      )
      return bDays - aDays
    })
  }, [cards])
  const dueSoon = useMemo(() => cards.filter(c =>
    c.wateringStatus !== 'overdue' && c.fertilizingStatus !== 'overdue' &&
    (c.wateringStatus === 'due-soon' || c.fertilizingStatus === 'due-soon')
  ), [cards])

  // ── Assistant recommendations (Phase 1) ────────────────────────────────
  const proposals = useMemo(
    () => recommendations.filter(r => r.rec.status === 'proposed' && !resolvedRecIds.has(r.rec.id)),
    [recommendations, resolvedRecIds])
  const acceptedTasks = useMemo(
    () => recommendations.filter(r => r.rec.status === 'accepted' && !resolvedRecIds.has(r.rec.id)),
    [recommendations, resolvedRecIds])

  // Accepted tasks join the main task list (spec 1.4): past-due or "now"
  // urgency joins Needs attention; the rest join Due soon. Sorted by due
  // date then urgency, and rendered above interval tasks in each section.
  // Date comparisons wait for the mounted clock (`now`) — pre-mount we
  // bucket by urgency alone so SSR and hydration render identically.
  const URGENCY_RANK: Record<string, number> = { now: 0, soon: 1, routine: 2 }
  const sortAccepted = (a: RecommendationCard, b: RecommendationCard) => {
    if (a.rec.due_date && b.rec.due_date && a.rec.due_date !== b.rec.due_date) {
      return a.rec.due_date < b.rec.due_date ? -1 : 1
    }
    if (!!a.rec.due_date !== !!b.rec.due_date) return a.rec.due_date ? -1 : 1
    return (URGENCY_RANK[a.rec.urgency] ?? 2) - (URGENCY_RANK[b.rec.urgency] ?? 2)
  }
  const acceptedUrgent = useMemo(() =>
    acceptedTasks
      .filter(r => r.rec.urgency === 'now' || (now !== null && r.rec.due_date !== null && daysUntil(r.rec.due_date, now) < 0))
      .sort(sortAccepted),
    [acceptedTasks, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const acceptedSoon = useMemo(() =>
    acceptedTasks.filter(r => !acceptedUrgent.includes(r)).sort(sortAccepted),
    [acceptedTasks, acceptedUrgent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Marks a row locally resolved so it disappears right away instead of
  // waiting for the server refresh (see resolvedRecIds note above).
  function markRecResolved(id: string) {
    setResolvedRecIds(prev => new Set(prev).add(id))
  }

  async function recAccept(card: RecommendationCard) {
    if (recBusyId) return
    // Interval suggestions go through the confirm sheet — never applied directly.
    if (card.rec.interval_suggestion) { setIntervalTarget(card); return }
    setRecBusyId(card.rec.id)
    const ok = await acceptRecommendation(createClient(), card.rec)
    if (ok) { showToast(`Added to tasks · ${card.plantNickname}`); router.refresh() }
    setRecBusyId(null)
  }

  async function recDone(card: RecommendationCard) {
    if (recBusyId) return
    setRecBusyId(card.rec.id)
    const ok = await completeRecommendation(createClient(), card.rec)
    if (ok) { markRecResolved(card.rec.id); showToast(`Done · ${card.plantNickname}`); router.refresh() }
    setRecBusyId(null)
  }

  async function recDismiss(card: RecommendationCard, reason: DismissedReason) {
    if (recBusyId) return
    setRecBusyId(card.rec.id)
    const ok = await dismissRecommendation(createClient(), card.rec, reason)
    if (ok) { markRecResolved(card.rec.id); showToast('Dismissed'); router.refresh() }
    setRecBusyId(null)
    setDismissTarget(null)
  }

  async function recIntervalConfirm(card: RecommendationCard) {
    if (recBusyId) return
    setRecBusyId(card.rec.id)
    const ok = await applyIntervalSuggestion(createClient(), card.rec)
    if (ok) {
      const s = card.rec.interval_suggestion!
      markRecResolved(card.rec.id)
      showToast(`${s.type === 'watering' ? 'Watering' : 'Fertilizing'} · every ${s.suggested_days}d · ${card.plantNickname}`)
      router.refresh()
    }
    setRecBusyId(null)
    setIntervalTarget(null)
  }

  // Plants with care due in 2–7 days — not yet in the task list.
  const upcoming = useMemo(() => {
    const result: Array<{ card: PlantCard; label: string; icon: 'drop' | 'leaf'; days: number }> = []
    for (const card of cards) {
      const isTask = card.wateringStatus === 'overdue' || card.wateringStatus === 'due-soon'
                  || card.fertilizingStatus === 'overdue' || card.fertilizingStatus === 'due-soon'
      if (isTask) continue
      if (card.plant.watering_interval_days && card.daysSinceWatered !== null) {
        const left = card.plant.watering_interval_days - card.daysSinceWatered
        if (left > 1 && left <= 7) result.push({ card, label: 'Water', icon: 'drop', days: Math.ceil(left) })
      }
      if (card.plant.fertilizing_interval_days && card.daysSinceFertilized !== null) {
        const left = card.plant.fertilizing_interval_days - card.daysSinceFertilized
        if (left > 1 && left <= 7) result.push({ card, label: 'Feed', icon: 'leaf', days: Math.ceil(left) })
      }
    }
    return result.sort((a, b) => a.days - b.days)
  }, [cards])

  const totalTodo = overdue.length + dueSoon.length
  // Everything actionable today: interval tasks + accepted assistant tasks.
  // The masthead and "all caught up" states count this, matching the section
  // headers below (which also include assistant rows).
  const totalOpen = totalTodo + acceptedTasks.length
  // Persist overdue count to localStorage so BottomNav can show a badge.
  // Must run in an effect — writing during render causes a hydration mismatch.
  useEffect(() => {
    localStorage.setItem('viriditas.overdueCount', String(overdue.length))
  }, [overdue.length])

  // Plants with no watering schedule at all — surface a nudge.
  const unscheduled = useMemo(() => cards.filter(c => c.wateringStatus === 'unset'), [cards])

  // Dynamic section counter — incremented as sections are added.
  let sNum = 0
  const nextSec = () => `§ ${String(++sNum).padStart(2, '0')}`

  // Masthead date + season tag — empty until mounted (see hydration note above).
  const mastheadDate = now
    ? ` · ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${seasonTag(now)}`
    : ''

  async function quickLog(plantId: string, type: 'watered' | 'fertilized') {
    const key = `${plantId}-${type}`
    if (loggingId) return
    setLoggingId(key)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('care_logs').insert({
        plant_id: plantId,
        user_id: session.user.id,
        type,
        logged_at: new Date().toISOString(),
      })
      const plantName = cards.find(c => c.plant.id === plantId)?.plant.nickname ?? 'plant'
      showToast(type === 'watered' ? `Watered · ${plantName}` : `Fed · ${plantName}`)
      router.refresh()
    } finally {
      setLoggingId(null)
    }
  }

  // Bulk log a care type for all overdue plants in one tap.
  async function bulkLog(type: 'watered' | 'fertilized') {
    const targets = overdue.filter(c => type === 'watered' ? c.wateringStatus === 'overdue' : c.fertilizingStatus === 'overdue')
    if (targets.length === 0 || bulkLogging || loggingId) return
    setBulkLogging(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      // Named loggedAt (not `now`) to avoid shadowing the mounted-clock state above.
      const loggedAt = new Date().toISOString()
      await supabase.from('care_logs').insert(
        targets.map(c => ({ plant_id: c.plant.id, user_id: session.user.id, type, logged_at: loggedAt }))
      )
      showToast(type === 'watered'
        ? `Watered ${targets.length} ${targets.length === 1 ? 'plant' : 'plants'}`
        : `Fed ${targets.length} ${targets.length === 1 ? 'plant' : 'plants'}`)
      router.refresh()
    } finally {
      setBulkLogging(false)
    }
  }

  // Insert a care_log note for any plant in the collection.
  async function quickAddNote() {
    if (!notePlantId || !noteText.trim()) return
    setAddingNote(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('care_logs').insert({
        plant_id: notePlantId,
        user_id: session.user.id,
        type: 'note',
        notes: noteText.trim(),
        category: noteCategory ?? null,
        logged_at: new Date().toISOString(),
      })
      const plantName = cards.find(c => c.plant.id === notePlantId)?.plant.nickname ?? 'plant'
      showToast(`Note added · ${plantName}`)
      setShowAddNote(false)
      setNoteText('')
      setNoteCategory(null)
      setNotePlantId('')
      router.refresh()
    } finally {
      setAddingNote(false)
    }
  }

  // ── Empty state (no plants yet) ───────────────────────────────────────
  if (cards.length === 0) {
    return <EmptyState now={now} />
  }

  return (
    <div className="pb-8">
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-10 pb-3.5">
        <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2.5">
          Vol. I{mastheadDate}
        </div>
        <BigTitle>
          {greeting(now)}.<br />
          <span className="italic text-accent">
            {totalOpen === 0 && unscheduled.length === cards.length
              ? 'Set up a care schedule.'
              : totalOpen === 0 && tendedToday > 0
              ? 'All done today.'
              : totalOpen === 0
              ? 'All plants are settled.'
              : tendedToday > 0 && totalOpen === 1
              ? `${tendedToday} done · 1 more to go.`
              : tendedToday > 0 && totalOpen > 1
              ? `${tendedToday} done · ${totalOpen} more to go.`
              : totalTodo === 0
              ? `${acceptedTasks.length} assistant task${acceptedTasks.length === 1 ? '' : 's'} open.`
              : totalOpen === 1
              ? `${[...overdue, ...dueSoon][0]?.plant.nickname ?? 'a plant'} needs you.`
              : acceptedTasks.length > 0
              ? `${totalOpen} tasks need you.`
              : `${totalOpen} plants need you.`}
          </span>
        </BigTitle>
      </div>

      {/* ── Streak strip ──────────────────────────────────────────────── */}
      {streak > 0 && (
        <Link href="/settings" className="mx-5 mt-3.5 flex items-center gap-3 px-3.5 py-3 bg-paper-alt border border-rule rounded-brand">
          {/* Streak count, not an icon — the flame glyph read as a digit "9"
              and was mistaken for the calendar date. */}
          <div className="w-[34px] h-[34px] rounded-full bg-accent flex items-center justify-center shrink-0">
            <span className="font-sans font-semibold text-[13px] leading-none text-paper">{streak}</span>
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
              {streak}-day care streak
            </div>
            <div className="text-[11px] text-ink-soft mt-px">
              {/* nbsp fallback keeps the line height stable during the pre-mount frame */}
              {now ? `You tended a plant every day since ${streakSince(streak, now)}.` : '\u00A0'}
            </div>
          </div>
          <Icon name="chev" size={16} className="text-ink-muted" />
        </Link>
      )}

      {/* ── 14-day activity strip ────────────────────────────────────── */}
      <div className="mx-5 mt-3.5 flex items-end gap-1">
        {activityGrid.map(({ dateStr, active, isToday }) => (
          <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm transition-colors ${active ? 'bg-accent' : 'bg-paper-alt'}`}
              style={{ height: active ? 18 : 10, border: isToday ? '1px solid #4C6A48' : '1px solid transparent', opacity: active ? 1 : 0.6 }}
            />
          </div>
        ))}
      </div>
      <div className="mx-5 flex justify-between mt-1">
        <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-ink-muted">
          {/* counts come from the placeholder grid until mounted, so hold the label */}
          {now ? `${activityGrid.filter(d => d.active).length} active day${activityGrid.filter(d => d.active).length === 1 ? '' : 's'}` : '\u00A0'}
        </span>
        <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-ink-muted">
          {weeklyLogs > 0 ? `${weeklyLogs} log${weeklyLogs === 1 ? '' : 's'} · this week` : 'today'}
        </span>
      </div>

      {/* ── Tended today (positive reinforcement) ────────────────────── */}
      {tendedToday > 0 && totalOpen === 0 && (
        <div className="mx-5 mt-3.5 flex items-center gap-2.5 px-3.5 py-2.5 bg-accent-soft border border-rule rounded-brand">
          <Icon name="check" size={15} stroke={2.2} className="text-accent shrink-0" />
          <span className="text-[13px] font-medium text-accent">
            {tendedToday === 1
              ? '1 plant tended today'
              : `${tendedToday} plants tended today`} — all done.
          </span>
        </div>
      )}
      {tendedToday > 0 && totalOpen > 0 && (
        <div className="mx-5 mt-3.5 flex items-center gap-2.5 px-3.5 py-2.5 bg-card border border-rule rounded-brand">
          <Icon name="check" size={15} stroke={2.2} className="text-accent shrink-0" />
          <span className="text-[13px] text-ink-soft">
            {tendedToday === 1 ? '1 plant' : `${tendedToday} plants`} tended so far today.
          </span>
        </div>
      )}

      {/* ── Overdue ───────────────────────────────────────────────────── */}
      {(overdue.length > 0 || acceptedUrgent.length > 0) && (() => {
        const waterTargets = overdue.filter(c => c.wateringStatus === 'overdue').length
        const feedTargets  = overdue.filter(c => c.fertilizingStatus === 'overdue').length
        return (
          <>
            <SectionLabel number={nextSec()} title={`Needs attention — ${overdue.length + acceptedUrgent.length}`} />
            {(waterTargets > 1 || feedTargets > 1) && (
              <div className="px-5 flex gap-2 mb-1">
                {waterTargets > 1 && (
                  <button
                    onClick={() => bulkLog('watered')}
                    disabled={bulkLogging || !!loggingId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-paper text-[11px] font-medium disabled:opacity-50"
                  >
                    <Icon name="drop" size={12} stroke={2} className="text-paper" />
                    {bulkLogging ? 'Logging…' : `Water all · ${waterTargets}`}
                  </button>
                )}
                {feedTargets > 1 && (
                  <button
                    onClick={() => bulkLog('fertilized')}
                    disabled={bulkLogging || !!loggingId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink text-paper text-[11px] font-medium disabled:opacity-50"
                  >
                    <Icon name="leaf" size={12} stroke={2} className="text-paper" />
                    {bulkLogging ? 'Logging…' : `Feed all · ${feedTargets}`}
                  </button>
                )}
              </div>
            )}
            <div className="px-5 flex flex-col gap-2">
              {/* Accepted assistant tasks sort above interval tasks (spec 1.4) */}
              {acceptedUrgent.map(item => (
                <AssistantTaskRow
                  key={item.rec.id}
                  item={item}
                  now={now}
                  busy={recBusyId === item.rec.id}
                  onDone={() => recDone(item)}
                  onDismiss={() => setDismissTarget(item)}
                />
              ))}
              {overdue.map(card => (
                <TaskRow
                  key={card.plant.id}
                  card={card}
                  loggingId={loggingId}
                  onWater={() => quickLog(card.plant.id, 'watered')}
                  onFeed={() => quickLog(card.plant.id, 'fertilized')}
                />
              ))}
            </div>
          </>
        )
      })()}

      {/* ── Due soon ──────────────────────────────────────────────────── */}
      {(dueSoon.length > 0 || acceptedSoon.length > 0) && (
        <>
          <SectionLabel number={nextSec()} title={`Due soon — ${dueSoon.length + acceptedSoon.length}`} />
          <div className="px-5 flex flex-col gap-2">
            {acceptedSoon.map(item => (
              <AssistantTaskRow
                key={item.rec.id}
                item={item}
                now={now}
                busy={recBusyId === item.rec.id}
                onDone={() => recDone(item)}
                onDismiss={() => setDismissTarget(item)}
              />
            ))}
            {dueSoon.map(card => (
              <TaskRow
                key={card.plant.id}
                card={card}
                loggingId={loggingId}
                onWater={() => quickLog(card.plant.id, 'watered')}
                onFeed={() => quickLog(card.plant.id, 'fertilized')}
              />
            ))}
          </div>
        </>
      )}

      {/* ── All caught up / no-schedule note ─────────────────────────── */}
      {totalOpen === 0 && unscheduled.length === cards.length && (
        <Link
          href="/plants"
          className="block mx-5 mt-4 p-4 bg-card border border-rule rounded-brand text-center"
        >
          <div className="inline-flex items-center gap-2 text-ink-soft text-[11px] font-semibold uppercase tracking-[0.1em]">
            <Icon name="calendar" size={12} stroke={1.9} /> No schedules yet
          </div>
          <p className="font-serif italic text-[17px] text-ink mt-2 leading-snug">
            Open a plant and set a watering interval to start tracking.
          </p>
        </Link>
      )}
      {totalOpen === 0 && unscheduled.length < cards.length && (
        <div className="mx-5 mt-4 p-4 bg-card border border-rule rounded-brand text-center">
          <div className="inline-flex items-center gap-2 text-accent text-[11px] font-semibold uppercase tracking-[0.1em]">
            <Icon name="sparkle" size={12} stroke={1.9} /> All caught up
          </div>
          <p className="font-serif italic text-[17px] text-ink mt-2 leading-snug">
            Every plant is tended. Enjoy the quiet.
          </p>
          {upcoming.length > 0 && (
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-muted mt-2">
              Next up · {upcoming[0].card.plant.nickname} · {upcoming[0].label} in {upcoming[0].days}d
            </p>
          )}
        </div>
      )}

      {/* ── Unscheduled nudge ────────────────────────────────────────── */}
      {unscheduled.length > 0 && unscheduled.length < cards.length && (
        <Link
          href="/plants"
          className="mx-5 mt-3.5 flex items-center gap-2.5 px-3.5 py-2.5 bg-paper-alt border border-dashed border-rule rounded-brand"
        >
          <Icon name="calendar" size={14} stroke={1.9} className="text-ink-muted shrink-0" />
          <span className="text-[12px] text-ink-soft flex-1">
            {unscheduled.length === 1 ? '1 plant has' : `${unscheduled.length} plants have`} no watering schedule — set a reminder
          </span>
          <Icon name="chev" size={13} className="text-ink-muted" />
        </Link>
      )}

      {/* ── Assistant — proposed (Phase 1.4) ──────────────────────────── */}
      {proposals.length > 0 && (
        <>
          <SectionLabel number={nextSec()} title={`Assistant — ${proposals.length} proposed`} />
          <div className="px-5 flex flex-col gap-2">
            {proposals.map(item => (
              <div key={item.rec.id} className="bg-card border border-rule rounded-brand px-3.5">
                <AssistantActionRow
                  rec={item.rec}
                  plantName={item.plantNickname}
                  now={now}
                  busy={recBusyId === item.rec.id}
                  onAccept={() => recAccept(item)}
                  onDone={() => recDone(item)}
                  onDismiss={() => setDismissTarget(item)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Coming up (2–7 days) ──────────────────────────────────────── */}
      {upcoming.length > 0 && (
        <>
          <SectionLabel number={nextSec()} title={`Coming up — ${upcoming.length}`} />
          <div className="vr-scroll flex gap-2 px-5 overflow-x-auto pb-1">
            {upcoming.map(({ card, label, icon, days }) => (
              <Link
                key={`${card.plant.id}-${label}`}
                href={`/plant/${card.plant.id}`}
                className="shrink-0 flex items-center gap-2.5 bg-card border border-rule rounded-brand px-3 py-2.5"
              >
                <div className="w-9 h-9 rounded-[8px] overflow-hidden relative border border-rule shrink-0">
                  {card.coverPhotoUrl ? (
                    <Image src={card.coverPhotoUrl} alt={card.plant.nickname} fill sizes="36px" className="object-cover" />
                  ) : (
                    <PlantPhoto name={card.plant.id} showLabel={false} />
                  )}
                </div>
                <div>
                  <div className="font-serif italic text-[13px] text-ink leading-tight">{card.plant.nickname}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Icon name={icon} size={10} stroke={2} className="text-ink-muted" />
                    <span className="font-mono text-[9px] text-ink-muted uppercase tracking-[0.06em]">
                      {label} in {days}d
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ── Collection strip ──────────────────────────────────────────── */}
      <SectionLabel
        number={nextSec()}
        title={`Your collection — ${cards.length}`}
        action="+ Note"
        onAction={() => setShowAddNote(true)}
      />
      <div className="vr-scroll flex gap-2.5 px-5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
        {cards.map(card => (
          <Link
            key={card.plant.id}
            href={`/plant/${card.plant.id}`}
            className="shrink-0 w-[120px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className={`relative w-[120px] h-[150px] rounded-brand overflow-hidden border bg-paper-alt ${
              card.wateringStatus === 'overdue' || card.fertilizingStatus === 'overdue' ? 'border-danger/50'
              : card.wateringStatus === 'due-soon' || card.fertilizingStatus === 'due-soon' ? 'border-warn/50'
              : 'border-rule'
            }`}>
              {card.coverPhotoUrl ? (
                <Image
                  src={card.coverPhotoUrl}
                  alt={card.plant.nickname}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              ) : (
                <PlantPhoto name={card.plant.id} label={card.plant.nickname} showLabel />
              )}
              {card.wateringStatus !== 'unset' && (
                <div className="absolute top-2 right-2 rounded-full px-1.5 py-0.5 backdrop-blur" style={{ background: 'rgba(20,30,20,0.5)' }}>
                  <StatusPip status={card.wateringStatus} />
                </div>
              )}
            </div>
            <div className="font-serif italic text-[15px] text-ink mt-2">{card.plant.nickname}</div>
            {card.plant.location && (
              <div className="font-mono text-[10px] text-ink-muted uppercase tracking-[0.08em]">
                {card.plant.location}
              </div>
            )}
          </Link>
        ))}
        {/* Add plant shortcut — always at end of strip */}
        <Link
          href="/add-plant"
          className="shrink-0 w-[120px]"
          style={{ scrollSnapAlign: 'start' }}
        >
          <div className="w-[120px] h-[150px] rounded-brand border border-dashed border-rule bg-paper-alt flex flex-col items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-full bg-accent-soft flex items-center justify-center">
              <Icon name="plus" size={18} stroke={2} className="text-accent" />
            </div>
          </div>
          <div className="font-serif italic text-[15px] text-ink-soft mt-2">Add plant</div>
        </Link>
      </div>

      {/* ── Journal peek ──────────────────────────────────────────────── */}
      {journalPeek && journalPeek.health && (
        <>
          <SectionLabel number="§ —" title="From the journal" />
          <Link
            href={`/plant/${journalPeek.plantId}`}
            className="block mx-5 mb-5 bg-card border border-rule rounded-brand-lg overflow-hidden"
          >
            <div className="flex gap-0">
              {journalPeek.coverPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={journalPeek.coverPhotoUrl}
                  alt={journalPeek.plantNickname}
                  className="w-[88px] shrink-0 object-cover self-stretch"
                />
              )}
              <div className="p-4 flex-1 min-w-0">
                <div className="font-mono text-[9px] tracking-[0.16em] text-ink-muted uppercase mb-1.5">
                  {/* relative time waits for mount — SSR vs hydration can land in different time buckets */}
                  {now ? `${relativeTime(journalPeek.createdAt)} · ` : ''}{journalPeek.plantNickname}
                  {journalPeek.plantSpecies && ` · ${journalPeek.plantSpecies}`}
                </div>
                <div className="font-serif text-[17px] leading-[1.4] text-ink italic" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
                  &ldquo;{journalPeek.health}&rdquo;
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
                  <Icon name="sparkle" size={12} className="text-accent" />
                  <span>AI reflection · tap to see the plant</span>
                </div>
              </div>
            </div>
          </Link>
        </>
      )}

      {/* ── Add note bottom sheet ────────────────────────────────────── */}
      {showAddNote && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowAddNote(false)}
        >
          <div
            className="bg-card rounded-t-2xl border-t border-rule p-5 pb-10 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-serif italic text-[22px] text-ink">Add a note</h2>
              <button onClick={() => setShowAddNote(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-paper-alt">
                <Icon name="close" size={16} stroke={2} className="text-ink-muted" />
              </button>
            </div>

            {/* Plant picker */}
            <div className="mb-4">
              <label className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
                Plant
              </label>
              <select
                value={notePlantId}
                onChange={e => setNotePlantId(e.target.value)}
                className="w-full px-3.5 py-3 border border-rule rounded-brand bg-paper text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Select a plant…</option>
                {cards.map(c => (
                  <option key={c.plant.id} value={c.plant.id}>{c.plant.nickname}</option>
                ))}
              </select>
            </div>

            {/* Note text */}
            <div className="mb-4">
              <label className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
                Note
              </label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="What did you observe?"
                rows={3}
                className="w-full px-3.5 py-3 border border-rule rounded-brand bg-paper text-[13px] text-ink resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Category chips */}
            <div className="mb-5">
              <label className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-2">
                Category (optional)
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {NOTE_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setNoteCategory(noteCategory === cat.key ? null : cat.key)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                      noteCategory === cat.key
                        ? 'bg-ink text-paper border-ink'
                        : 'bg-transparent text-ink-soft border-rule'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <HairlineButton
              onClick={quickAddNote}
              fullWidth
              disabled={addingNote || !notePlantId || !noteText.trim()}
            >
              {addingNote ? 'Saving…' : 'Save note'}
            </HairlineButton>
          </div>
        </div>
      )}

      {/* ── Assistant sheets (Phase 1) ───────────────────────────────── */}
      {dismissTarget && (
        <DismissSheet
          busy={recBusyId === dismissTarget.rec.id}
          onClose={() => setDismissTarget(null)}
          onSelect={reason => recDismiss(dismissTarget, reason)}
        />
      )}
      {intervalTarget && (
        <IntervalConfirmSheet
          rec={intervalTarget.rec}
          plantName={intervalTarget.plantNickname}
          busy={recBusyId === intervalTarget.rec.id}
          onClose={() => setIntervalTarget(null)}
          onConfirm={() => recIntervalConfirm(intervalTarget)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div
          key={toast.key}
          className="toast-enter fixed z-50 bg-ink text-paper text-sm font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none whitespace-nowrap left-1/2 -translate-x-1/2 flex items-center gap-2"
          style={{ bottom: 90 }}
        >
          <Icon name="check" size={14} stroke={2.5} className="text-accent-soft" />
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── AssistantTaskRow: an accepted assistant task in the main task list ──
// Mirrors TaskRow's layout (thumbnail · text · action button) so accepted
// recommendations read as first-class tasks alongside interval tasks.
function AssistantTaskRow({
  item, now, busy, onDone, onDismiss,
}: {
  item: RecommendationCard
  now: Date | null
  busy: boolean
  onDone: () => void
  onDismiss: () => void
}) {
  const due = now ? dueLabel(item.rec, now) : null
  const urgent = item.rec.urgency === 'now' || (due?.overdue ?? false)
  return (
    <div className="flex items-center gap-3 bg-card border border-rule rounded-brand pl-3 pr-2.5 py-2.5">
      {/* Thumbnail — taps through to plant detail */}
      <Link
        href={`/plant/${item.rec.plant_id}`}
        className="w-[52px] h-[52px] rounded-[10px] overflow-hidden border border-rule shrink-0 relative"
      >
        {item.coverPhotoUrl ? (
          <Image src={item.coverPhotoUrl} alt={item.plantNickname} fill sizes="52px" className="object-cover" />
        ) : (
          <PlantPhoto name={item.rec.plant_id} showLabel={false} />
        )}
      </Link>

      {/* Plant + action — taps through to plant detail */}
      <Link href={`/plant/${item.rec.plant_id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon name="sparkle" size={11} stroke={2} className="text-accent shrink-0" />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-muted truncate">
            {item.plantNickname}
          </span>
          {due && (
            <span className={`font-mono text-[9px] uppercase tracking-[0.08em] shrink-0 ${due.overdue ? 'text-danger' : 'text-ink-muted'}`}>
              · {due.text}
            </span>
          )}
        </div>
        <div className="font-sans text-[13px] font-medium text-ink mt-0.5 leading-snug">
          {item.rec.action}
        </div>
      </Link>

      {/* Done / dismiss — resolve without navigating */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onDone}
          disabled={busy}
          aria-label="Mark done"
          className={`w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-50 ${urgent ? 'bg-danger' : 'bg-accent'}`}
        >
          <Icon name="check" size={17} stroke={2.2} className="text-paper" />
        </button>
        <button
          onClick={onDismiss}
          disabled={busy}
          aria-label="Dismiss task"
          className="w-8 h-11 flex items-center justify-center text-ink-muted disabled:opacity-50"
        >
          <Icon name="close" size={14} stroke={1.8} />
        </button>
      </div>
    </div>
  )
}

// ─── TaskRow: a single plant needing water and/or feeding ─────────────
function TaskRow({
  card,
  loggingId,
  onWater,
  onFeed,
}: {
  card: PlantCard
  loggingId: string | null
  onWater: () => void
  onFeed: () => void
}) {
  const needsWater = card.wateringStatus === 'overdue' || card.wateringStatus === 'due-soon'
  const needsFeed  = card.fertilizingStatus === 'overdue' || card.fertilizingStatus === 'due-soon'

  const isLoggingWater = loggingId === `${card.plant.id}-watered`
  const isLoggingFeed  = loggingId === `${card.plant.id}-fertilized`
  const isLogging      = isLoggingWater || isLoggingFeed

  const parts: string[] = []
  if (needsWater && card.plant.watering_interval_days) {
    if (card.wateringStatus === 'overdue' && card.daysSinceWatered !== null) {
      const over = card.daysSinceWatered - card.plant.watering_interval_days
      parts.push(`Water ${over}d overdue`)
    } else {
      parts.push('Water due today')
    }
  }
  if (needsFeed && card.plant.fertilizing_interval_days) {
    if (card.fertilizingStatus === 'overdue' && card.daysSinceFertilized !== null) {
      const over = card.daysSinceFertilized - card.plant.fertilizing_interval_days
      parts.push(`Feed ${over}d overdue`)
    } else {
      parts.push('Feed due today')
    }
  }

  return (
    <div className="flex items-center gap-3 bg-card border border-rule rounded-brand pl-3 pr-2.5 py-2.5">
      {/* Thumbnail — taps through to plant detail */}
      <Link
        href={`/plant/${card.plant.id}`}
        className="w-[52px] h-[52px] rounded-[10px] overflow-hidden border border-rule shrink-0 relative"
      >
        {card.coverPhotoUrl ? (
          <Image src={card.coverPhotoUrl} alt={card.plant.nickname} fill sizes="52px" className="object-cover" />
        ) : (
          <PlantPhoto name={card.plant.id} showLabel={false} />
        )}
      </Link>

      {/* Name + care labels — taps through to plant detail */}
      <Link href={`/plant/${card.plant.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-serif italic text-[16px] text-ink leading-tight truncate">
            {card.plant.nickname}
          </span>
          {card.plant.species && (
            <span className="font-mono text-[11px] text-ink-muted tracking-[0.02em] shrink-0">
              · {card.plant.species.split(' ')[0]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {needsWater && (
            <span className={`flex items-center gap-1 text-xs font-medium ${card.wateringStatus === 'overdue' ? 'text-danger' : 'text-warn'}`}>
              <Icon name="drop" size={11} stroke={1.9} /> Water
            </span>
          )}
          {needsFeed && (
            <span className={`flex items-center gap-1 text-xs font-medium ${card.fertilizingStatus === 'overdue' ? 'text-danger' : 'text-warn'}`}>
              <Icon name="leaf" size={11} stroke={1.9} /> Feed
            </span>
          )}
          {parts.length > 0 && (
            <span className="text-xs text-ink-soft tracking-[-0.01em] truncate">· {parts.join(' · ')}</span>
          )}
        </div>
      </Link>

      {/* Inline action buttons — log without navigating */}
      <div className="flex gap-1.5 shrink-0">
        {needsWater && (
          <button
            onClick={onWater}
            disabled={isLogging}
            aria-label="Log watered"
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-opacity disabled:opacity-50 ${
              card.wateringStatus === 'overdue' ? 'bg-danger' : 'bg-warn'
            }`}
          >
            {isLoggingWater
              ? <Icon name="clock" size={17} stroke={1.8} className="text-paper" />
              : <Icon name="drop" size={17} stroke={2.1} className="text-paper" />
            }
          </button>
        )}
        {needsFeed && (
          <button
            onClick={onFeed}
            disabled={isLogging}
            aria-label="Log fertilized"
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-opacity disabled:opacity-50 ${
              card.fertilizingStatus === 'overdue' ? 'bg-danger' : 'bg-warn'
            }`}
          >
            {isLoggingFeed
              ? <Icon name="clock" size={17} stroke={1.8} className="text-paper" />
              : <Icon name="leaf" size={17} stroke={2.1} className="text-paper" />
            }
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Empty state (onboarding) ──────────────────────────────────────────
// Receives `now` from TodayClient — null during SSR (see hydration note there).
function EmptyState({ now }: { now: Date | null }) {
  return (
    <div className="px-5 pt-10 pb-8">
      <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2.5">
        Vol. I · Welcome
      </div>
      <BigTitle>
        {greeting(now)}.<br />
        <span className="italic text-accent">Let&rsquo;s meet your first plant.</span>
      </BigTitle>

      <p className="text-sm text-ink-soft mt-4 leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
        Snap a photo and Viriditas will identify the species, draft a care schedule,
        and keep a living journal as it grows.
      </p>

      <div className="mt-6 space-y-2.5">
        {[
          { icon: 'camera',  title: 'AI plant analysis',  sub: 'Species ID and health tips from a photo' },
          { icon: 'drop',    title: 'Care tracking',      sub: 'Log watering, fertilizing, repotting' },
          { icon: 'book',    title: 'Field guide',        sub: '1,200+ species, pulled in on demand' },
        ].map(f => (
          <div key={f.title} className="flex items-start gap-3 bg-card border border-rule rounded-brand p-3.5">
            <div className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
              <Icon name={f.icon as 'camera' | 'drop' | 'book'} size={16} stroke={1.9} className="text-accent" />
            </div>
            <div>
              <div className="font-sans text-sm font-semibold text-ink">{f.title}</div>
              <div className="text-xs text-ink-soft mt-0.5">{f.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Link
          href="/add-plant"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink text-paper font-medium text-sm py-3"
        >
          <Icon name="plus" size={16} stroke={2.2} />
          Add your first plant
        </Link>
      </div>

    </div>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────
// These take the mounted `now` value instead of calling `new Date()`
// themselves, so nothing time-dependent renders during SSR — see the
// hydration note at the top of TodayClient.

function greeting(d: Date | null): string {
  if (!d) return 'Hello' // pre-mount fallback, identical on server and client
  const h = d.getHours()
  if (h < 5)  return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

function seasonTag(d: Date): string {
  const m = d.getMonth() + 1
  if ([3, 4, 5].includes(m))   return ' · Spring'
  if ([6, 7, 8].includes(m))   return ' · Summer'
  if ([9, 10, 11].includes(m)) return ' · Autumn'
  return ' · Winter'
}

function streakSince(days: number, from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() - days + 1)
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}
