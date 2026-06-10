'use client'
// app/(app)/plants/PlantsClient.tsx
// Collection screen — grid or list view, optionally grouped by location or status.
import Link from 'next/link'
import Image from 'next/image'
import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BigTitle, Chip, StatusPip } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import { relativeTime } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { PlantCard } from './page'

type GroupBy = 'none' | 'location' | 'status' | 'tag'
type ViewMode = 'grid' | 'list'
type SortBy = 'urgency' | 'az' | 'neglected'
type CareFilter = 'all' | 'urgent' | 'due-soon' | 'healthy'

const STATUS_TITLE: Record<string, string> = {
  overdue: 'Needs water',
  'due-soon': 'Due soon',
  good: 'Settled',
  unset: 'No schedule',
}

export default function PlantsClient({ cards }: { cards: PlantCard[] }) {
  const router = useRouter()
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortBy>('urgency')
  const [careFilter, setCareFilter] = useState<CareFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set())
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message: msg, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const quickLog = useCallback(async (plantId: string, nickname: string, type: 'watered' | 'fertilized') => {
    const key = `${plantId}-${type}`
    if (loggingId) return
    setLoggingId(key)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('care_logs').insert({ plant_id: plantId, user_id: session.user.id, type, logged_at: new Date().toISOString() })
      showToast(type === 'watered' ? `Watered · ${nickname}` : `Fed · ${nickname}`)
      router.refresh()
    } finally {
      setLoggingId(null)
    }
  }, [loggingId, router, showToast])

  // Derive distinct locations actually used by the user's plants (acts as "rooms").
  const locations = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) if (c.plant.location) set.add(c.plant.location)
    return Array.from(set).sort()
  }, [cards])

  // Derive all distinct tags across the collection (sorted alphabetically).
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) for (const tag of (c.plant.tags ?? [])) set.add(tag)
    return Array.from(set).sort()
  }, [cards])

  // Filter by search + tags + care status, then sort.
  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = cards.filter(c => {
      if (q && !(
        c.plant.nickname.toLowerCase().includes(q) ||
        c.plant.species?.toLowerCase().includes(q) ||
        c.plant.location?.toLowerCase().includes(q)
      )) return false
      if (activeTagFilters.size > 0) {
        const plantTags = new Set(c.plant.tags ?? [])
        if (![...activeTagFilters].some(t => plantTags.has(t))) return false
      }
      if (careFilter === 'urgent') {
        if (c.wateringStatus !== 'overdue' && c.fertilizingStatus !== 'overdue') return false
      } else if (careFilter === 'due-soon') {
        const isOverdue = c.wateringStatus === 'overdue' || c.fertilizingStatus === 'overdue'
        const isDueSoon = c.wateringStatus === 'due-soon' || c.fertilizingStatus === 'due-soon'
        if (isOverdue || !isDueSoon) return false
      } else if (careFilter === 'healthy') {
        if (c.wateringStatus === 'overdue' || c.fertilizingStatus === 'overdue' ||
            c.wateringStatus === 'due-soon' || c.fertilizingStatus === 'due-soon') return false
      }
      return true
    })
    if (sortBy === 'az') {
      return [...filtered].sort((a, b) => a.plant.nickname.localeCompare(b.plant.nickname))
    }
    if (sortBy === 'neglected') {
      // Never watered → most days ago → fewest days ago
      return [...filtered].sort((a, b) => {
        const aDays = a.daysSinceWatered ?? Infinity
        const bDays = b.daysSinceWatered ?? Infinity
        return bDays - aDays
      })
    }
    return filtered
  }, [cards, searchQuery, activeTagFilters, sortBy, careFilter])

  function toggleTagFilter(tag: string) {
    setActiveTagFilters(prev => {
      const next = new Set(prev)
      if (next.has(tag)) { next.delete(tag) } else { next.add(tag) }
      return next
    })
  }

  return (
    <div className="pb-6">
      {/* ── Masthead ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-9 pb-1 flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2">
            {cards.length} plant{cards.length === 1 ? '' : 's'}
            {locations.length > 0 && ` · ${locations.length} location${locations.length === 1 ? '' : 's'}`}
            {(() => {
              const needsAttn = cards.filter(c =>
                c.wateringStatus === 'overdue' || c.fertilizingStatus === 'overdue'
              ).length
              return needsAttn > 0 ? ` · ${needsAttn} need attention` : null
            })()}
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
          {/* Search input */}
          <div className="px-5 pt-3 pb-0.5">
            <div className="flex items-center gap-2.5 bg-card border border-rule rounded-brand px-3.5 py-2.5">
              <Icon name="search" size={14} stroke={1.9} className="text-ink-muted shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, species, or location…"
                className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-muted outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="text-ink-muted shrink-0">
                  <Icon name="close" size={13} stroke={2} />
                </button>
              )}
            </div>
          </div>

          {/* Care status filter chips */}
          {(() => {
            const urgentCount  = cards.filter(c => c.wateringStatus === 'overdue' || c.fertilizingStatus === 'overdue').length
            const dueSoonCount = cards.filter(c => (c.wateringStatus === 'due-soon' || c.fertilizingStatus === 'due-soon') && c.wateringStatus !== 'overdue' && c.fertilizingStatus !== 'overdue').length
            const healthyCount = cards.filter(c => c.wateringStatus !== 'overdue' && c.fertilizingStatus !== 'overdue' && c.wateringStatus !== 'due-soon' && c.fertilizingStatus !== 'due-soon').length
            if (urgentCount === 0 && dueSoonCount === 0) return null
            return (
              <div className="vr-scroll flex gap-1.5 px-5 pt-2.5 pb-0.5 overflow-x-auto">
                <button onClick={() => setCareFilter('all')} className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${careFilter === 'all' ? 'bg-ink text-paper border-ink' : 'bg-transparent text-ink-soft border-rule'}`}>All</button>
                {urgentCount > 0  && <button onClick={() => setCareFilter('urgent')}   className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${careFilter === 'urgent'   ? 'bg-danger text-paper border-danger' : 'bg-danger-soft text-danger border-danger/30'}`}>Overdue · {urgentCount}</button>}
                {dueSoonCount > 0 && <button onClick={() => setCareFilter('due-soon')} className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${careFilter === 'due-soon' ? 'bg-warn text-paper border-warn'   : 'bg-warn-soft text-warn border-warn/30'}`}>Due soon · {dueSoonCount}</button>}
                {healthyCount > 0 && <button onClick={() => setCareFilter('healthy')}  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${careFilter === 'healthy'  ? 'bg-accent text-paper border-accent' : 'bg-accent-soft text-accent border-accent/30'}`}>Healthy · {healthyCount}</button>}
              </div>
            )
          })()}

          {/* Tag filter chips — only shown when the collection has any tags */}
          {allTags.length > 0 && (
            <div className="vr-scroll flex gap-1.5 px-5 pt-2.5 pb-0.5 overflow-x-auto">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                    activeTagFilters.has(tag)
                      ? 'bg-accent text-paper border-accent'
                      : 'bg-transparent text-ink-soft border-rule'
                  }`}
                >
                  {tag}
                </button>
              ))}
              {activeTagFilters.size > 0 && (
                <button
                  onClick={() => setActiveTagFilters(new Set())}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono border border-rule text-ink-muted"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Grouping + sort chips */}
          <div className="vr-scroll flex gap-1.5 px-5 pt-3 pb-2.5 overflow-x-auto">
            <Chip active={groupBy === 'none'} onClick={() => setGroupBy('none')}>All plants</Chip>
            {locations.length > 0 && (
              <Chip active={groupBy === 'location'} onClick={() => setGroupBy('location')}>By location</Chip>
            )}
            <Chip active={groupBy === 'status'} onClick={() => setGroupBy('status')}>By status</Chip>
            {allTags.length > 0 && (
              <Chip active={groupBy === 'tag'} onClick={() => setGroupBy('tag')}>By tag · {allTags.length}</Chip>
            )}
            <div className="w-px bg-rule shrink-0 self-stretch mx-0.5" />
            <Chip active={sortBy === 'urgency'}   onClick={() => setSortBy('urgency')}>Urgency</Chip>
            <Chip active={sortBy === 'az'}        onClick={() => setSortBy('az')}>A–Z</Chip>
            <Chip active={sortBy === 'neglected'} onClick={() => setSortBy('neglected')}>Neglected</Chip>
          </div>

          {/* View toggle + result count */}
          <div className="flex items-center justify-between px-5 pb-2">
            <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-muted">
              {searchQuery
                ? `${filteredCards.length} result${filteredCards.length === 1 ? '' : 's'}`
                : groupBy === 'none'
                  ? sortBy === 'az' ? 'A–Z' : sortBy === 'neglected' ? 'Longest unwatered' : 'By urgency'
                  : groupBy === 'location' ? 'Grouped by location'
                  : groupBy === 'tag' ? 'Grouped by tag'
                  : 'Grouped by status'}
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

          {/* No search results */}
          {searchQuery && filteredCards.length === 0 && (
            <div className="mx-5 mt-4 p-5 bg-card border border-rule rounded-brand text-center">
              <p className="text-sm text-ink-soft">No plants match &ldquo;{searchQuery}&rdquo;.</p>
            </div>
          )}

          {/* Care filter empty state */}
          {!searchQuery && careFilter !== 'all' && filteredCards.length === 0 && (
            <div className="mx-5 mt-4 p-5 bg-card border border-rule rounded-brand text-center">
              <Icon name="check" size={20} stroke={2} className="text-accent mx-auto mb-2" />
              <p className="text-sm font-medium text-ink">
                {careFilter === 'urgent' ? 'No overdue plants' : careFilter === 'due-soon' ? 'Nothing due soon' : 'All plants need attention'}
              </p>
              <p className="text-xs text-ink-muted mt-1">
                {careFilter === 'urgent' ? 'Everything is on schedule.' : careFilter === 'due-soon' ? 'No plants are due within the next day.' : 'Every plant is watered or fed.'}
              </p>
              <button onClick={() => setCareFilter('all')} className="mt-3 text-xs text-accent font-medium">Show all</button>
            </div>
          )}

          {filteredCards.length > 0 && (
            <>
              {groupBy === 'none' && (
                viewMode === 'grid' ? <Grid cards={filteredCards} /> : <List cards={filteredCards} quickLog={quickLog} loggingId={loggingId} />
              )}
              {groupBy === 'location' && <LocationGroups cards={filteredCards} viewMode={viewMode} quickLog={quickLog} loggingId={loggingId} />}
              {groupBy === 'status' && <StatusGroups cards={filteredCards} viewMode={viewMode} quickLog={quickLog} loggingId={loggingId} />}
              {groupBy === 'tag' && <TagGroups cards={filteredCards} viewMode={viewMode} quickLog={quickLog} loggingId={loggingId} />}
            </>
          )}
        </>
      )}

      {/* Toast */}
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

// ─── Quick-log prop type ────────────────────────────────────────────────
type QuickLogFn = (plantId: string, nickname: string, type: 'watered' | 'fertilized') => void

// ─── Grid ───────────────────────────────────────────────────────────────
function Grid({ cards }: { cards: PlantCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 px-5 pt-1">
      {cards.map((c, i) => (
        <Link key={c.plant.id} href={`/plant/${c.plant.id}`} className="text-left">
          <div className={`relative rounded-brand overflow-hidden border ${
            c.wateringStatus === 'overdue' || c.fertilizingStatus === 'overdue' ? 'border-danger/40'
            : c.wateringStatus === 'due-soon' || c.fertilizingStatus === 'due-soon' ? 'border-warn/40'
            : 'border-rule'
          }`} style={{ aspectRatio: '1 / 1.2' }}>
            {c.coverPhotoUrl ? (
              <Image src={c.coverPhotoUrl} alt={c.plant.nickname} fill sizes="(max-width: 640px) 50vw, 300px" className="object-cover" />
            ) : (
              <PlantPhoto name={c.plant.id} label={c.plant.nickname} />
            )}
            {(c.wateringStatus !== 'unset' || c.fertilizingStatus !== 'unset') && (
              <div className="absolute top-2 left-2 rounded-full px-1.5 py-0.5 backdrop-blur flex items-center gap-1" style={{ background: 'rgba(20,30,20,0.6)' }}>
                {c.wateringStatus !== 'unset' && <StatusPip status={c.wateringStatus} />}
                {c.fertilizingStatus !== 'unset' && <StatusPip status={c.fertilizingStatus} />}
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
            <div className="flex items-baseline gap-1.5">
              <div className="font-serif italic text-[17px] text-ink leading-tight tracking-[-0.012em]">
                {c.plant.nickname}
              </div>
              {(Date.now() - new Date(c.plant.created_at).getTime()) < 7 * 86_400_000 && (
                <span className="font-mono text-[8px] tracking-[0.1em] uppercase px-1 py-0.5 bg-accent-soft text-accent rounded shrink-0">New</span>
              )}
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
function List({ cards, quickLog, loggingId }: { cards: PlantCard[]; quickLog?: QuickLogFn; loggingId?: string | null }) {
  return (
    <div className="px-5 pt-1 flex flex-col gap-1.5">
      {cards.map((c, i) => {
        const needsWater = c.wateringStatus === 'overdue' || c.wateringStatus === 'due-soon'
        const needsFeed  = c.fertilizingStatus === 'overdue' || c.fertilizingStatus === 'due-soon'
        const isLoggingWater = loggingId === `${c.plant.id}-watered`
        const isLoggingFeed  = loggingId === `${c.plant.id}-fertilized`
        return (
          <div key={c.plant.id} className="flex items-center gap-2 bg-card border border-rule rounded-brand pl-3 pr-1.5 py-2.5">
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
            <Link href={`/plant/${c.plant.id}`} className="flex-1 min-w-0">
              <div className="font-serif italic text-[16px] text-ink truncate">{c.plant.nickname}</div>
              <div className="text-[11px] text-ink-soft mt-px truncate">
                {c.plant.species || 'Unknown species'}
                {c.plant.location && ` · ${c.plant.location}`}
                {c.daysSinceWatered !== null && c.plant.watering_interval_days && (
                  <span className={`ml-1.5 font-mono text-[9px] tracking-[0.06em] ${
                    c.wateringStatus === 'overdue' ? 'text-danger'
                    : c.wateringStatus === 'due-soon' ? 'text-warn'
                    : 'text-ink-muted'
                  }`}>
                    · {c.daysSinceWatered}d
                  </span>
                )}
              </div>
            </Link>
            {/* Quick-log buttons — one consistent cluster on every row.
                The review flagged that buttons appeared only on actionable rows
                (others showed pips), so the control changed shape row to row.
                Now: water is always loggable; feed appears whenever a
                fertilizing schedule exists. Urgency lives in the COLOR —
                solid danger/warn when due, quiet outline when not. */}
            {quickLog ? (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => quickLog(c.plant.id, c.plant.nickname, 'watered')}
                  disabled={!!loggingId}
                  aria-label="Log watered"
                  className={`w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50 ${
                    c.wateringStatus === 'overdue' ? 'bg-danger'
                    : c.wateringStatus === 'due-soon' ? 'bg-warn'
                    : 'bg-card border border-rule'
                  }`}
                >
                  <Icon
                    name={isLoggingWater ? 'clock' : 'drop'}
                    size={15}
                    stroke={needsWater ? 2.1 : 1.8}
                    className={needsWater ? 'text-paper' : 'text-ink-soft'}
                  />
                </button>
                {c.fertilizingStatus !== 'unset' && (
                  <button
                    onClick={() => quickLog(c.plant.id, c.plant.nickname, 'fertilized')}
                    disabled={!!loggingId}
                    aria-label="Log fertilized"
                    className={`w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50 ${
                      c.fertilizingStatus === 'overdue' ? 'bg-danger'
                      : c.fertilizingStatus === 'due-soon' ? 'bg-warn'
                      : 'bg-card border border-rule'
                    }`}
                  >
                    <Icon
                      name={isLoggingFeed ? 'clock' : 'leaf'}
                      size={15}
                      stroke={needsFeed ? 2.1 : 1.8}
                      className={needsFeed ? 'text-paper' : 'text-ink-soft'}
                    />
                  </button>
                )}
              </div>
            ) : (
              /* List rendered without a quickLog handler — show status pips only. */
              <div className="flex items-center gap-1 shrink-0">
                {c.wateringStatus !== 'unset' && <StatusPip status={c.wateringStatus} />}
                {c.fertilizingStatus !== 'unset' && <StatusPip status={c.fertilizingStatus} />}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Location groups ────────────────────────────────────────────────────
function LocationGroups({ cards, viewMode, quickLog, loggingId }: { cards: PlantCard[]; viewMode: ViewMode; quickLog?: QuickLogFn; loggingId?: string | null }) {
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
            {viewMode === 'grid' ? <Grid cards={subset} /> : <List cards={subset} quickLog={quickLog} loggingId={loggingId} />}
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
          {viewMode === 'grid' ? <Grid cards={unassigned} /> : <List cards={unassigned} quickLog={quickLog} loggingId={loggingId} />}
        </div>
      )}
    </div>
  )
}

// ─── Status groups ──────────────────────────────────────────────────────
// Uses the most urgent of watering or fertilizing status per plant.
function effectiveStatus(c: PlantCard): 'overdue' | 'due-soon' | 'good' | 'unset' {
  const order = { overdue: 0, 'due-soon': 1, good: 2, unset: 3 }
  return order[c.wateringStatus] <= order[c.fertilizingStatus] ? c.wateringStatus : c.fertilizingStatus
}

function StatusGroups({ cards, viewMode, quickLog, loggingId }: { cards: PlantCard[]; viewMode: ViewMode; quickLog?: QuickLogFn; loggingId?: string | null }) {
  const groups: { key: 'overdue' | 'due-soon' | 'good' | 'unset'; cards: PlantCard[] }[] = [
    { key: 'overdue',  cards: cards.filter(c => effectiveStatus(c) === 'overdue')  },
    { key: 'due-soon', cards: cards.filter(c => effectiveStatus(c) === 'due-soon') },
    { key: 'good',     cards: cards.filter(c => effectiveStatus(c) === 'good')     },
    { key: 'unset',    cards: cards.filter(c => effectiveStatus(c) === 'unset')    },
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
          {viewMode === 'grid' ? <Grid cards={g.cards} /> : <List cards={g.cards} quickLog={quickLog} loggingId={loggingId} />}
        </div>
      ))}
    </div>
  )
}

// ─── Tag groups ─────────────────────────────────────────────────────────
// Plants may appear under multiple tags.
function TagGroups({ cards, viewMode, quickLog, loggingId }: { cards: PlantCard[]; viewMode: ViewMode; quickLog?: QuickLogFn; loggingId?: string | null }) {
  const allTags = Array.from(new Set(cards.flatMap(c => c.plant.tags ?? []))).sort()
  const untagged = cards.filter(c => !c.plant.tags || c.plant.tags.length === 0)

  return (
    <div>
      {allTags.map((tag, i) => {
        const subset = cards.filter(c => (c.plant.tags ?? []).includes(tag))
        return (
          <div key={tag}>
            <div className="px-5 pt-4 pb-2">
              <div className="font-mono text-[10px] text-ink-muted tracking-[0.14em] uppercase">
                § {String(i + 1).padStart(2, '0')}
              </div>
              <div className="font-serif italic text-[22px] text-ink mt-0.5">{tag}</div>
              <div className="text-[11px] text-ink-soft mt-0.5">
                {subset.length} plant{subset.length === 1 ? '' : 's'}
              </div>
            </div>
            {viewMode === 'grid' ? <Grid cards={subset} /> : <List cards={subset} quickLog={quickLog} loggingId={loggingId} />}
          </div>
        )
      })}
      {untagged.length > 0 && (
        <div>
          <div className="px-5 pt-4 pb-2">
            <div className="font-mono text-[10px] text-ink-muted tracking-[0.14em] uppercase">
              § {String(allTags.length + 1).padStart(2, '0')}
            </div>
            <div className="font-serif italic text-[22px] text-ink mt-0.5">Untagged</div>
            <div className="text-[11px] text-ink-soft mt-0.5">No tags set</div>
          </div>
          {viewMode === 'grid' ? <Grid cards={untagged} /> : <List cards={untagged} quickLog={quickLog} loggingId={loggingId} />}
        </div>
      )}
    </div>
  )
}

function lastCareLabel(c: PlantCard): string {
  if (c.wateringStatus === 'overdue' && c.daysSinceWatered !== null && c.plant.watering_interval_days) {
    const over = c.daysSinceWatered - c.plant.watering_interval_days
    return `overdue by ${over}d`
  }
  if (c.wateringStatus === 'due-soon') return 'due today'
  if (c.plant.watering_interval_days && c.daysSinceWatered !== null) {
    const left = Math.ceil(c.plant.watering_interval_days - c.daysSinceWatered)
    if (left > 0 && left <= 7) return `water in ${left}d`
  }
  if (!c.lastWateredLog) return 'not watered yet'
  return `watered ${relativeTime(c.lastWateredLog.logged_at)}`
}
