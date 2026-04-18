'use client'
// app/(app)/TodayClient.tsx
// Today — presentation layer. Receives enriched cards + streak + journal
// peek from the Server Component and renders the editorial home screen.
import Link from 'next/link'
import Image from 'next/image'
import { useMemo } from 'react'
import { BigTitle, SectionLabel, StatusPip } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import { formatTimestamp } from '@/lib/utils'
import type { PlantCard, JournalPeek } from './page'

interface Props {
  cards: PlantCard[]
  streak: number
  journalPeek: JournalPeek
}

export default function TodayClient({ cards, streak, journalPeek }: Props) {
  const overdue = useMemo(() => cards.filter(c => c.wateringStatus === 'overdue'), [cards])
  const dueSoon = useMemo(() => cards.filter(c => c.wateringStatus === 'due-soon'), [cards])
  const totalTodo = overdue.length + dueSoon.length

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // ── Empty state (no plants yet) ───────────────────────────────────────
  if (cards.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="pb-8">
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-10 pb-3.5">
        <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2.5">
          Vol. I · {dateStr}
        </div>
        <BigTitle>
          {greeting()}.<br />
          <span className="italic text-accent">
            {totalTodo === 0
              ? 'All plants are settled.'
              : `${totalTodo} plant${totalTodo === 1 ? '' : 's'} need${totalTodo === 1 ? 's' : ''} you.`}
          </span>
        </BigTitle>
      </div>

      {/* ── Streak strip ──────────────────────────────────────────────── */}
      {streak > 0 && (
        <div className="mx-5 mt-3.5 flex items-center gap-3 px-3.5 py-3 bg-paper-alt border border-rule rounded-brand">
          <div className="w-[34px] h-[34px] rounded-full bg-accent flex items-center justify-center shrink-0">
            <Icon name="flame" size={18} stroke={1.8} className="text-paper" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
              {streak}-day care streak
            </div>
            <div className="text-[11px] text-ink-soft mt-px">
              You tended a plant every day since {streakSince(streak)}.
            </div>
          </div>
          <Icon name="chev" size={16} className="text-ink-muted" />
        </div>
      )}

      {/* ── Overdue ───────────────────────────────────────────────────── */}
      {overdue.length > 0 && (
        <>
          <SectionLabel number="§ 01" title={`Needs water — ${overdue.length}`} />
          <div className="px-5 flex flex-col gap-2">
            {overdue.map(card => <TaskRow key={card.plant.id} card={card} />)}
          </div>
        </>
      )}

      {/* ── Due soon ──────────────────────────────────────────────────── */}
      {dueSoon.length > 0 && (
        <>
          <SectionLabel number={overdue.length > 0 ? '§ 02' : '§ 01'} title={`Due soon — ${dueSoon.length}`} />
          <div className="px-5 flex flex-col gap-2">
            {dueSoon.map(card => <TaskRow key={card.plant.id} card={card} />)}
          </div>
        </>
      )}

      {/* ── All caught up note ────────────────────────────────────────── */}
      {totalTodo === 0 && (
        <div className="mx-5 mt-4 p-4 bg-card border border-rule rounded-brand text-center">
          <div className="inline-flex items-center gap-2 text-accent text-[11px] font-semibold uppercase tracking-[0.1em]">
            <Icon name="sparkle" size={12} stroke={1.9} /> All caught up
          </div>
          <p className="font-serif italic text-[17px] text-ink mt-2 leading-snug">
            Every plant is watered. Enjoy the quiet.
          </p>
        </div>
      )}

      {/* ── Collection strip ──────────────────────────────────────────── */}
      <SectionLabel
        number={totalTodo === 0 ? '§ 01' : `§ 0${(overdue.length > 0 ? 1 : 0) + (dueSoon.length > 0 ? 1 : 0) + 1}`}
        title={`Your collection — ${cards.length}`}
        action="See all"
        onAction={() => { window.location.href = '/plants' }}
      />
      <div className="vr-scroll flex gap-2.5 px-5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
        {cards.map(card => (
          <Link
            key={card.plant.id}
            href={`/plant/${card.plant.id}`}
            className="shrink-0 w-[120px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <div className="relative w-[120px] h-[150px] rounded-brand overflow-hidden border border-rule bg-paper-alt">
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
      </div>

      {/* ── Journal peek ──────────────────────────────────────────────── */}
      {journalPeek && journalPeek.health && (
        <>
          <SectionLabel number="§ —" title="From the journal" />
          <Link
            href={`/plant/${journalPeek.plantId}`}
            className="block mx-5 mb-5 p-4 bg-card border border-rule rounded-brand-lg"
          >
            <div className="font-mono text-[9px] tracking-[0.16em] text-ink-muted uppercase mb-1.5">
              {formatTimestamp(journalPeek.createdAt)} · {journalPeek.plantNickname}
              {journalPeek.plantSpecies && ` · ${journalPeek.plantSpecies}`}
            </div>
            <div className="font-serif text-[17px] leading-[1.4] text-ink italic" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
              &ldquo;{journalPeek.health}&rdquo;
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
              <Icon name="sparkle" size={12} className="text-accent" />
              <span>AI reflection · tap to see the plant</span>
            </div>
          </Link>
        </>
      )}
    </div>
  )
}

// ─── TaskRow: a single pending-water card ──────────────────────────────
function TaskRow({ card }: { card: PlantCard }) {
  const tone = card.wateringStatus === 'overdue'
    ? { color: 'text-danger', bg: 'bg-danger' }
    : { color: 'text-warn',   bg: 'bg-warn'   }

  const subtitle = (() => {
    const interval = card.plant.watering_interval_days
    const days = card.daysSinceWatered
    if (card.wateringStatus === 'overdue' && interval && days !== null) {
      return `${days - interval} day${days - interval === 1 ? '' : 's'} overdue · usually every ${interval}`
    }
    if (card.wateringStatus === 'due-soon' && interval) {
      return `Due today or tomorrow · every ${interval} days`
    }
    return interval ? `Every ${interval} days` : 'No schedule set'
  })()

  return (
    <div className="flex items-center gap-3 bg-card border border-rule rounded-brand pl-3 pr-2.5 py-2.5">
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
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon name="drop" size={12} stroke={1.9} className={tone.color} />
          <span className={`${tone.color} text-xs font-medium tracking-[-0.01em]`}>Water</span>
          <span className="text-xs text-ink-soft tracking-[-0.01em] truncate">· {subtitle}</span>
        </div>
      </Link>

      {/* Mark watered → takes user into the plant to actually log (keeps data logic honest) */}
      <Link
        href={`/plant/${card.plant.id}#quick-actions`}
        aria-label="Open plant to mark watered"
        className={`w-11 h-11 rounded-full ${tone.bg} flex items-center justify-center shrink-0`}
      >
        <Icon name="check" size={20} stroke={2.2} className="text-paper" />
      </Link>
    </div>
  )
}

// ─── Empty state (onboarding) ──────────────────────────────────────────
function EmptyState() {
  return (
    <div className="px-5 pt-10 pb-8">
      <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2.5">
        Vol. I · Welcome
      </div>
      <BigTitle>
        {greeting()}.<br />
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
function greeting(): string {
  const h = new Date().getHours()
  if (h < 5)  return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

function streakSince(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}
