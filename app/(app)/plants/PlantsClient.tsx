'use client'
// app/(app)/plants/PlantsClient.tsx
// Collection screen — grid or list view, optionally grouped by location or status.
import Link from 'next/link'
import Image from 'next/image'
import { useState, useMemo } from 'react'
import { BigTitle, Chip, StatusPip } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import type { PlantCard } from './page'

type GroupBy = 'none' | 'location' | 'status'
type ViewMode = 'grid' | 'list'

const STATUS_TITLE: Record<string, string> = {
  overdue: 'Needs water',
  'due-soon': 'Due soon',
  good: 'Settled',
  unset: 'No schedule',
}

export default function PlantsClient({ cards }: { cards: PlantCard[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Derive distinct locations actually used by the user's plants (acts as "rooms").
  const locations = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) if (c.plant.location) set.add(c.plant.location)
    return Array.from(set).sort()
  }, [cards])

  return (
    <div className="pb-6">
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-9 pb-1 flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2">
            {cards.length} plant{cards.length === 1 ? '' : 's'}
            {locations.length > 0 && ` · ${locations.length} location${locations.length === 1 ? '' : 's'}`}
          </div>
          <BigTitle italic>Collection</BigTitle>
        </div>
        <Link
          href="/add-plant"
          aria-label="Add plant"
          className="w-10 h-10 rounded-full bg-accent flex items-center justify-center"
        >
          <Icon name="plus" size={18} stroke={2.2} className="text-paper" />
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="mx-5 mt-8 p-6 bg-card border border-rule rounded-brand-lg text-center">
          <Icon name="leaf" size={28} stroke={1.6} className="text-ink-muted mx-auto" />
          <h2 className="font-serif italic text-[22px] text-ink mt-4">No plants yet</h2>
          <p className="text-sm text-ink-soft mt-1">Add your first to start the collection.</p>
          <Link
            href="/add-plant"
            className="inline-flex mt-5 items-center gap-2 rounded-full bg-ink text-paper text-sm font-medium px-5 py-3"
          >
            <Icon name="plus" size={16} stroke={2.2} /> Add a plant
          </Link>
        </div>
      ) : (
        <>
          {/* Grouping chips */}
          <div className="vr-scroll flex gap-1.5 px-5 pt-4 pb-2.5 overflow-x-auto">
            <Chip active={groupBy === 'none'} onClick={() => setGroupBy('none')}>All plants</Chip>
            {locations.length > 0 && (
              <Chip active={groupBy === 'location'} onClick={() => setGroupBy('location')}>By location</Chip>
            )}
            <Chip active={groupBy === 'status'} onClick={() => setGroupBy('status')}>By status</Chip>
          </div>

          {/* View toggle */}
          <div className="flex items-center justify-between px-5 pb-2">
            <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-muted">
              {groupBy === 'none' ? 'By recency' : groupBy === 'location' ? 'Grouped by location' : 'Grouped by status'}
            </div>
            <div className="flex gap-0.5 bg-paper-alt p-[3px] rounded-full">
              <button
                aria-label="Grid view"
                onClick={() => setViewMode('grid')}
                className={`w-7 h-6 rounded-full flex items-center justify-center ${viewMode === 'grid' ? 'bg-card' : ''}`}
              >
                <Icon name="grid" size={12} className="text-ink" />
              </button>
              <button
                aria-label="List view"
                onClick={() => setViewMode('list')}
                className={`w-7 h-6 rounded-full flex items-center justify-center ${viewMode === 'list' ? 'bg-card' : ''}`}
              >
                <Icon name="list" size={12} className="text-ink" />
              </button>
            </div>
          </div>

          {groupBy === 'none' && (
            viewMode === 'grid' ? <Grid cards={cards} /> : <List cards={cards} />
          )}
          {groupBy === 'location' && <LocationGroups cards={cards} viewMode={viewMode} />}
          {groupBy === 'status' && <StatusGroups cards={cards} viewMode={viewMode} />}
        </>
      )}
    </div>
  )
}

// ─── Grid ───────────────────────────────────────────────────────────────
function Grid({ cards }: { cards: PlantCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 px-5 pt-1">
      {cards.map((c, i) => (
        <Link key={c.plant.id} href={`/plant/${c.plant.id}`} className="text-left">
          <div className="relative rounded-brand border border-rule overflow-hidden" style={{ aspectRatio: '1 / 1.2' }}>
            {c.coverPhotoUrl ? (
              <Image src={c.coverPhotoUrl} alt={c.plant.nickname} fill sizes="(max-width: 640px) 50vw, 300px" className="object-cover" />
            ) : (
              <PlantPhoto name={c.plant.id} label={c.plant.nickname} />
            )}
            {c.wateringStatus !== 'unset' && (
              <div className="absolute top-2 left-2 rounded-full px-1.5 py-0.5 backdrop-blur" style={{ background: 'rgba(20,30,20,0.6)' }}>
                <StatusPip status={c.wateringStatus} />
              </div>
            )}
            <div
              className="absolute top-2 right-2.5 font-mono text-[10px] tracking-[0.08em]"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {String(i + 1).padStart(2, '0')}
            </div>
          </div>
          <div className="pt-2 px-0.5">
            <div className="font-serif italic text-[17px] text-ink leading-tight tracking-[-0.012em]">
              {c.plant.nickname}
            </div>
            {c.plant.species && (
              <div className="text-[11px] text-ink-muted mt-0.5">{c.plant.species}</div>
            )}
            <div className="font-mono text-[9px] text-ink-muted tracking-[0.08em] uppercase mt-1">
              {lastCareLabel(c)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─── List ───────────────────────────────────────────────────────────────
function List({ cards }: { cards: PlantCard[] }) {
  return (
    <div className="px-5 pt-1 flex flex-col gap-1.5">
      {cards.map((c, i) => (
        <Link
          key={c.plant.id}
          href={`/plant/${c.plant.id}`}
          className="flex items-center gap-3 bg-card border border-rule rounded-brand pl-3 pr-2.5 py-2.5"
        >
          <span className="font-mono text-[10px] text-ink-muted w-5 shrink-0">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="w-11 h-11 rounded-lg overflow-hidden border border-rule shrink-0 relative">
            {c.coverPhotoUrl ? (
              <Image src={c.coverPhotoUrl} alt={c.plant.nickname} fill sizes="44px" className="object-cover" />
            ) : (
              <PlantPhoto name={c.plant.id} showLabel={false} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-serif italic text-[16px] text-ink truncate">{c.plant.nickname}</div>
            <div className="text-[11px] text-ink-soft mt-px truncate">
              {c.plant.species || 'Unknown species'}
              {c.plant.location && ` · ${c.plant.location}`}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusPip status={c.wateringStatus} />
            {c.daysSinceWatered !== null && (
              <span className="font-mono text-[9px] text-ink-muted tracking-[0.06em]">
                {c.daysSinceWatered}d
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─── Location groups ────────────────────────────────────────────────────
function LocationGroups({ cards, viewMode }: { cards: PlantCard[]; viewMode: ViewMode }) {
  const locations = Array.from(new Set(cards.map(c => c.plant.location).filter(Boolean))) as string[]
  locations.sort()
  const unassigned = cards.filter(c => !c.plant.location)

  return (
    <div>
      {locations.map((loc, i) => {
        const subset = cards.filter(c => c.plant.location === loc)
        const overdue = subset.filter(c => c.wateringStatus === 'overdue').length
        return (
          <div key={loc}>
            <div className="px-5 pt-4 pb-2">
              <div className="font-mono text-[10px] text-ink-muted tracking-[0.14em] uppercase">
                § {String(i + 1).padStart(2, '0')}
              </div>
              <div className="font-serif italic text-[22px] text-ink mt-0.5">{loc}</div>
              <div className="text-[11px] text-ink-soft mt-0.5">
                {subset.length} plant{subset.length === 1 ? '' : 's'}
                {overdue > 0 && <span className="text-danger ml-1.5">· {overdue} overdue</span>}
              </div>
            </div>
            {viewMode === 'grid' ? <Grid cards={subset} /> : <List cards={subset} />}
          </div>
        )
      })}
      {unassigned.length > 0 && (
        <div>
          <div className="px-5 pt-4 pb-2">
            <div className="font-mono text-[10px] text-ink-muted tracking-[0.14em] uppercase">
              § {String(locations.length + 1).padStart(2, '0')}
            </div>
            <div className="font-serif italic text-[22px] text-ink mt-0.5">Unplaced</div>
            <div className="text-[11px] text-ink-soft mt-0.5">No location set</div>
          </div>
          {viewMode === 'grid' ? <Grid cards={unassigned} /> : <List cards={unassigned} />}
        </div>
      )}
    </div>
  )
}

// ─── Status groups ──────────────────────────────────────────────────────
function StatusGroups({ cards, viewMode }: { cards: PlantCard[]; viewMode: ViewMode }) {
  const groups: { key: 'overdue' | 'due-soon' | 'good' | 'unset'; cards: PlantCard[] }[] = [
    { key: 'overdue',  cards: cards.filter(c => c.wateringStatus === 'overdue')  },
    { key: 'due-soon', cards: cards.filter(c => c.wateringStatus === 'due-soon') },
    { key: 'good',     cards: cards.filter(c => c.wateringStatus === 'good')     },
    { key: 'unset',    cards: cards.filter(c => c.wateringStatus === 'unset')    },
  ]
  return (
    <div>
      {groups.map(g => g.cards.length > 0 && (
        <div key={g.key}>
          <div className="px-5 pt-4 pb-2 flex items-center gap-2">
            <StatusPip status={g.key} />
            <span className="font-serif italic text-[20px] text-ink">{STATUS_TITLE[g.key]}</span>
            <span className="text-xs text-ink-muted">({g.cards.length})</span>
          </div>
          {viewMode === 'grid' ? <Grid cards={g.cards} /> : <List cards={g.cards} />}
        </div>
      ))}
    </div>
  )
}

function lastCareLabel(c: PlantCard): string {
  if (c.daysSinceWatered === null) return 'not watered yet'
  if (c.daysSinceWatered === 0) return 'watered today'
  return `watered ${c.daysSinceWatered}d ago`
}
