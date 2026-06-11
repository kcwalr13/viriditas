'use client'
// app/(app)/explore/page.tsx
//
// Field Guide — the plant encyclopedia, redesigned as a browsable library.
// Editorial header + search rail + AI-identify hero + category grid +
// featured species carousel + recently-viewed list. Selecting a suggestion
// or photo-identifying a plant opens the full species detail view.
//
// Text search flow:
//   1. User types → suggest-species → 2-col suggestion grid with Wikipedia thumbs
//   2. User taps a suggestion → fetch-species-info → species detail
//
// Photo search flow:
//   Upload/snap → identify-species → fetch-species-info → species detail

import { createClient } from '@/lib/supabase/client'
import { fileToBase64, formatTimestamp, relativeTime } from '@/lib/utils'
import type { SpeciesProfile } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'
import { BigTitle, HairlineButton, SectionLabel } from '@/components/ui'
import { FlagFactSheet } from '@/components/FlagFactSheet'
import { Icon } from '@/components/Icon'
import { PlantPhoto, paletteFor } from '@/components/PlantPhoto'

interface SuggestionBase {
  scientificName: string
  commonName: string
  description: string
}
interface Suggestion extends SuggestionBase {
  thumbnailUrl: string | null
}

// Categories drive both the browse grid AND the suggest-species search query.
// searchQuery is passed to the AI — kept as common plant-world terms.
const CATEGORIES = [
  { name: 'Tropical',            subtitle: 'Lush leafy specimens',  searchQuery: 'tropical houseplant' },
  { name: 'Succulents & Cacti',  subtitle: 'Drought tolerant',      searchQuery: 'succulent cactus'    },
  { name: 'Ferns & Mosses',      subtitle: 'Lovers of humidity',    searchQuery: 'fern moss terrarium'  },
  { name: 'Trailing vines',      subtitle: 'Cascaders & climbers',  searchQuery: 'trailing vine pothos' },
  { name: 'Flowering',           subtitle: 'Colour indoors',        searchQuery: 'flowering houseplant' },
  { name: 'Low light',           subtitle: 'For dim corners',       searchQuery: 'low light tolerant'   },
]

const FEATURED = [
  { scientific: 'Monstera deliciosa',      common: 'Swiss cheese plant',  difficulty: 'Easy' },
  { scientific: 'Ficus lyrata',            common: 'Fiddle Leaf Fig',     difficulty: 'Fussy' },
  { scientific: 'Sansevieria trifasciata', common: 'Snake Plant',         difficulty: 'Easy' },
  { scientific: 'Calathea orbifolia',      common: 'Prayer plant',        difficulty: 'Tricky' },
  { scientific: 'Pilea peperomioides',     common: 'Chinese money plant', difficulty: 'Easy' },
  { scientific: 'Epipremnum aureum',       common: 'Pothos',              difficulty: 'Beginner' },
]

// Recently viewed — persisted in localStorage so refreshing doesn't wipe it.
// Format: { name: string; viewedAt: number }[] (Unix ms). Handles legacy string[] gracefully.
type RecentEntry = { name: string; viewedAt: number }
const RECENT_KEY = 'viriditas.explore.recent'
function loadRecent(): RecentEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as unknown[]
    return raw.map(item => typeof item === 'string'
      ? { name: item, viewedAt: 0 }
      : (item as RecentEntry)
    )
  } catch { return [] }
}
function pushRecent(name: string) {
  if (typeof window === 'undefined') return
  const existing = loadRecent().filter(e => e.name !== name)
  const next: RecentEntry[] = [{ name, viewedAt: Date.now() }, ...existing].slice(0, 6)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

export default function ExplorePage() {
  const supabase = createClient()

  const [nameQuery, setNameQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [profile, setProfile] = useState<SpeciesProfile | null>(null)
  const [identifiedName, setIdentifiedName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])

  const [featuredThumbs, setFeaturedThumbs] = useState<Record<string, string>>({})
  const [recentThumbs, setRecentThumbs] = useState<Record<string, string>>({})
  const [userPlants, setUserPlants] = useState<Array<{ id: string; nickname: string; species: string | null }>>([])
  // When arriving via ?species= deep link, "back" should navigate to the previous page.
  const [deepLinked, setDeepLinked] = useState(false)
  // Real counts of cached species per category keyword
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setRecent(loadRecent()) }, [])

  // Load user's registered plants once for "You have X of these" callouts.
  useEffect(() => {
    async function loadPlants() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('plants').select('id, nickname, species').eq('user_id', session.user.id)
      setUserPlants(data ?? [])
    }
    loadPlants()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open a species profile when ?species= is in the URL (e.g. from Plant Detail).
  // When deep-linked, "Back to library" navigates to browser history instead of clearing profile.
  useEffect(() => {
    const pre = new URLSearchParams(window.location.search).get('species')
    if (pre) { setDeepLinked(true); fetchProfile(pre) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Wikipedia thumbnails for recently-viewed species when the list changes.
  useEffect(() => {
    recent.forEach(async ({ name }) => {
      if (recentThumbs[name]) return
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`)
        if (!res.ok) return
        const wiki = await res.json() as { thumbnail?: { source?: string } }
        if (wiki.thumbnail?.source) setRecentThumbs(prev => ({ ...prev, [name]: wiki.thumbnail!.source! }))
      } catch { /* gradient fallback */ }
    })
  }, [recent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load species counts per category from the local species_profiles cache.
  // This shows how many species the AI has already profiled in each browse area.
  useEffect(() => {
    async function loadCounts() {
      const counts: Record<string, number> = {}
      await Promise.all(CATEGORIES.map(async cat => {
        const keyword = cat.searchQuery.split(' ')[0] // use first keyword for DB ilike match
        const { count } = await supabase
          .from('species_profiles')
          .select('*', { count: 'exact', head: true })
          .or(`species_name.ilike.%${keyword}%,common_names.ilike.%${keyword}%`)
        counts[cat.name] = count ?? 0
      }))
      setCategoryCounts(counts)
    }
    loadCounts()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Wikipedia thumbnails for the featured carousel once on mount.
  useEffect(() => {
    FEATURED.forEach(async s => {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.scientific)}`)
        if (!res.ok) return
        const wiki = await res.json() as { thumbnail?: { source?: string } }
        if (wiki.thumbnail?.source) setFeaturedThumbs(prev => ({ ...prev, [s.scientific]: wiki.thumbnail!.source! }))
      } catch { /* ignore — gradient placeholder shown instead */ }
    })
  }, [])

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not logged in')
    return session.access_token
  }

  async function fetchSuggestions(query: string) {
    setSuggestLoading(true)
    setSuggestions([])
    setProfile(null)
    setIdentifiedName(null)
    setError(null)
    try {
      const token = await getToken()
      const { data, error: fnError } = await supabase.functions.invoke('suggest-species', {
        body: { query: query.trim() },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)

      const raw: SuggestionBase[] = data?.suggestions ?? []
      const withThumbs: Suggestion[] = await Promise.all(
        raw.map(async s => {
          try {
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.scientificName)}`)
            if (!res.ok) return { ...s, thumbnailUrl: null }
            const wiki = await res.json()
            return { ...s, thumbnailUrl: (wiki.thumbnail?.source as string) ?? null }
          } catch {
            return { ...s, thumbnailUrl: null }
          }
        })
      )
      setSuggestions(withThumbs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.')
    } finally {
      setSuggestLoading(false)
    }
  }

  async function fetchProfile(speciesName: string, forceRefresh = false) {
    setLoading(true)
    setError(null)
    if (!forceRefresh) setProfile(null)
    try {
      const token = await getToken()
      const { data, error: fnError } = await supabase.functions.invoke('fetch-species-info', {
        body: { speciesName: speciesName.trim(), forceRefresh },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.profile) throw new Error('No profile returned.')
      setProfile(data.profile)
      // Don't clear suggestions — preserve them so Back restores the search results.
      pushRecent(speciesName.trim())
      setRecent(loadRecent())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch species info.')
    } finally {
      setLoading(false)
    }
  }

  async function handleNameSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!nameQuery.trim()) return
    await fetchSuggestions(nameQuery)
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''

    setPhotoLoading(true)
    setError(null)
    setProfile(null)
    setSuggestions([])
    setIdentifiedName(null)

    try {
      const base64 = await fileToBase64(file)
      const token = await getToken()
      const { data, error: fnError } = await supabase.functions.invoke('identify-species', {
        body: { imageBase64: base64, mimeType: file.type },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      const speciesName: string | null = data?.speciesName ?? null
      if (!speciesName) {
        setError("Couldn't identify a plant in that photo. Try a clearer image or search by name.")
        setPhotoLoading(false)
        return
      }
      setIdentifiedName(speciesName)
      setPhotoLoading(false)
      await fetchProfile(speciesName)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo identification failed.')
      setPhotoLoading(false)
    }
  }

  function handleBack() {
    if (deepLinked) { window.history.back(); return }
    setProfile(null)
    setIdentifiedName(null)
    setError(null)
  }

  const isSearching = loading || photoLoading || suggestLoading
  const showSuggestions = !profile && suggestions.length > 0
  const showLibrary = !profile && !showSuggestions && !isSearching

  return (
    <div className="pb-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      {!profile && (
        <div className="px-5 pt-9 pb-0">
          <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2">
            Field Guide
          </div>
          <BigTitle>
            Explore the<br />
            <span className="italic text-accent">houseplant world</span>
          </BigTitle>
        </div>
      )}

      {/* ── Search bar + photo button ─────────────────────────────────── */}
      {!profile && (
        <>
          <form onSubmit={handleNameSearch} className="px-5 pt-4">
            <div className="flex items-center gap-2.5 px-3.5 py-3 bg-card border border-rule rounded-full">
              <Icon name="search" size={16} className="text-ink-soft shrink-0" />
              <input
                type="text"
                value={nameQuery}
                onChange={e => setNameQuery(e.target.value)}
                placeholder="Search by name…"
                disabled={isSearching}
                className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-muted"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Identify from a photo"
                disabled={isSearching}
                className="w-7 h-7 rounded-full bg-ink flex items-center justify-center disabled:opacity-50"
              >
                <Icon name="camera" size={13} stroke={1.9} className="text-paper" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
          </form>

          {/* ── AI identify hero ────────────────────────────────────── */}
          <div className="px-5 pt-3.5">
            <div className="relative overflow-hidden rounded-brand-lg p-5 bg-ink text-paper">
              <div
                className="absolute w-[180px] h-[180px] rounded-full"
                style={{ right: -20, top: -20, background: '#4C6A48', opacity: 0.3 }}
              />
              <div className="relative">
                <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase mb-2 font-mono" style={{ color: '#B9C9A8' }}>
                  <Icon name="sparkle" size={10} stroke={1.9} /> AI Identify
                </div>
                <div className="font-serif italic text-[22px] leading-[1.15] tracking-[-0.01em] max-w-[240px]">
                  Point your camera at any plant to identify it.
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSearching}
                  className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-paper text-ink text-[13px] font-medium disabled:opacity-50"
                >
                  <Icon name="camera" size={14} stroke={1.9} />
                  Identify a plant
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {suggestLoading && <LoadingBlock icon="search" text="Finding matches…" />}
      {photoLoading && <LoadingBlock icon="camera" text="Identifying plant…" />}
      {loading && !photoLoading && (
        <LoadingBlock icon="leaf" text={`Fetching care guide${identifiedName ? ` for ${identifiedName}` : '…'}`} />
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && !isSearching && (
        <div className="mx-5 mt-4 px-3 py-2 bg-danger-soft border border-rule rounded-brand text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── Suggestions ───────────────────────────────────────────────── */}
      {showSuggestions && (
        <>
          <SectionLabel number="§ —" title={`${suggestions.length} matches — tap one`} />
          <div className="grid grid-cols-2 gap-2.5 px-5">
            {suggestions.map(s => (
              <button
                key={s.scientificName}
                onClick={() => fetchProfile(s.scientificName)}
                className="bg-card border border-rule rounded-brand overflow-hidden text-left"
              >
                <div className="relative w-full aspect-square bg-paper-alt">
                  {s.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbnailUrl} alt={s.commonName} className="w-full h-full object-cover" />
                  ) : (
                    <PlantPhoto name={s.scientificName} label={s.commonName} />
                  )}
                </div>
                <div className="p-3">
                  <div className="font-serif italic text-[16px] text-ink leading-tight">{s.commonName}</div>
                  <div className="text-[11px] text-ink-muted mt-0.5 italic truncate">{s.scientificName}</div>
                  <p className="text-[11px] text-ink-soft mt-1.5 leading-snug line-clamp-3">{s.description}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Library (default) ─────────────────────────────────────────── */}
      {showLibrary && (
        <>
          <SectionLabel number="§ 01" title="Browse by category" />
          <div className="grid grid-cols-2 gap-2 px-5">
            {CATEGORIES.map((c, i) => {
              const [tp, bt] = paletteFor(c.name)
              const count = categoryCounts[c.name]
              return (
                <button
                  key={c.name}
                  onClick={() => { setNameQuery(c.searchQuery); fetchSuggestions(c.searchQuery) }}
                  className="relative overflow-hidden p-3.5 bg-card border border-rule rounded-brand text-left flex flex-col gap-5 h-[120px]"
                >
                  <div
                    className="absolute rounded-full"
                    style={{
                      top: -10, right: -10, width: 60, height: 60,
                      background: `linear-gradient(155deg, ${tp}, ${bt})`, opacity: 0.9,
                    }}
                  />
                  <div className="font-mono text-[10px] text-ink-muted tracking-[0.1em] relative">
                    N° {String(i + 1).padStart(2, '0')}
                    {count != null && count > 0 && (
                      <span className="ml-1.5 text-ink-muted">· {count}</span>
                    )}
                  </div>
                  <div className="relative mt-auto">
                    <div className="font-serif italic text-[16px] text-ink leading-tight tracking-[-0.01em]">
                      {c.name}
                    </div>
                    <div className="text-[11px] text-ink-soft mt-0.5">{c.subtitle}</div>
                  </div>
                </button>
              )
            })}
          </div>

          <SectionLabel number="§ 02" title={`Featured — ${['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'][new Date().getMonth()]}`} />
          <div className="vr-scroll flex gap-2.5 px-5 overflow-x-auto pb-1">
            {FEATURED.map(s => {
              const thumb = featuredThumbs[s.scientific]
              return (
                <button
                  key={s.scientific}
                  onClick={() => fetchProfile(s.scientific)}
                  className="shrink-0 w-[180px] text-left"
                >
                  <div className="relative w-[180px] h-[220px] rounded-brand overflow-hidden border border-rule bg-paper-alt">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={s.common} className="w-full h-full object-cover" />
                    ) : (
                      <PlantPhoto name={s.scientific} label={s.common} />
                    )}
                  </div>
                  <div className="pt-2">
                    <div className="font-serif italic text-[16px] text-ink tracking-[-0.01em]">{s.common}</div>
                    <div className="text-[11px] text-ink-muted mt-0.5 italic">{s.scientific}</div>
                    <div className="mt-1.5">
                      <span
                        className={`inline-block font-mono text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-full ${
                          s.difficulty === 'Easy' || s.difficulty === 'Beginner'
                            ? 'bg-accent-soft text-accent'
                            : s.difficulty === 'Tricky'
                            ? 'bg-warn-soft text-warn'
                            : 'bg-danger-soft text-danger'
                        }`}
                      >
                        {s.difficulty}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {recent.length > 0 && (
            <>
              <SectionLabel
                number="§ 03"
                title="Recently viewed"
                action="Clear"
                onAction={() => {
                  localStorage.removeItem(RECENT_KEY)
                  setRecent([])
                }}
              />
              <div className="px-5 flex flex-col gap-1.5">
                {recent.map((entry, i) => (
                  <button
                    key={entry.name}
                    onClick={() => fetchProfile(entry.name)}
                    className="w-full px-3.5 py-3 flex items-center gap-3 bg-card border border-rule rounded-brand"
                  >
                    <span className="font-mono text-[10px] text-ink-muted w-5 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="w-[38px] h-[38px] rounded-lg overflow-hidden border border-rule relative">
                      {recentThumbs[entry.name] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={recentThumbs[entry.name]} alt={entry.name} className="w-full h-full object-cover" />
                      ) : (
                        <PlantPhoto name={entry.name} showLabel={false} />
                      )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-serif italic text-[15px] text-ink truncate">{entry.name}</div>
                      {entry.viewedAt > 0 && (
                        <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-muted mt-0.5">
                          {relativeTime(new Date(entry.viewedAt).toISOString())}
                        </div>
                      )}
                    </div>
                    <Icon name="chev" size={14} className="text-ink-muted" />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Species detail ────────────────────────────────────────────── */}
      {profile && !isSearching && (
        <SpeciesDetail
          profile={profile}
          identifiedFrom={identifiedName}
          onBack={handleBack}
          onRefresh={() => fetchProfile(profile.species_name, true)}
          matchingPlants={userPlants.filter(p =>
            p.species?.toLowerCase() === profile.species_name.toLowerCase() ||
            profile.common_names?.toLowerCase().split(',').some(n => n.trim() === p.species?.toLowerCase())
          )}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function LoadingBlock({ icon, text }: { icon: 'search' | 'camera' | 'leaf'; text: string }) {
  return (
    <div className="text-center py-10 text-ink-soft">
      <Icon name={icon} size={28} className="text-accent animate-pulse mx-auto" />
      <p className="text-sm font-medium mt-2">{text}</p>
    </div>
  )
}

function SpeciesDetail({
  profile, identifiedFrom, onBack, onRefresh, matchingPlants,
}: {
  profile: SpeciesProfile
  identifiedFrom: string | null
  onBack: () => void
  onRefresh: () => void
  matchingPlants: Array<{ id: string; nickname: string; species: string | null }>
}) {
  const [heroThumb, setHeroThumb] = useState<string | null>(null)
  // Phase 5 fact flagging: false = sheet closed; null/string = open (with
  // an optional preselected field key).
  const [flagField, setFlagField] = useState<string | null | false>(false)
  const [flagSaved, setFlagSaved] = useState(false)

  useEffect(() => {
    const query = profile.scientific_name || profile.species_name
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`)
      .then(r => r.ok ? r.json() : null)
      .then((wiki: { thumbnail?: { source?: string } } | null) => {
        if (wiki?.thumbnail?.source) setHeroThumb(wiki.thumbnail.source)
      })
      .catch(() => {})
  }, [profile.scientific_name, profile.species_name])

  return (
    <div>
      {/* Hero */}
      <div className="relative h-[280px] overflow-hidden">
        {heroThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroThumb} alt={profile.species_name} className="w-full h-full object-cover" />
        ) : (
          <PlantPhoto name={profile.species_name} showLabel={false} />
        )}
        <button
          onClick={onBack}
          aria-label="Back"
          className="absolute top-10 left-4 w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.9)' }}
        >
          <Icon name="back" size={18} stroke={1.9} className="text-ink" />
        </button>
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}
        />
        <div className="absolute bottom-4 left-5 right-14 text-white">
          <div className="font-mono text-[10px] tracking-[0.16em] uppercase opacity-80 mb-1">
            {identifiedFrom ? 'Identified from photo' : 'From the Field Guide'}
          </div>
          <div className="font-serif italic text-[32px] leading-none tracking-[-0.02em]">
            {profile.common_names?.split(',')[0]?.trim() ?? profile.species_name}
          </div>
          {profile.scientific_name && (
            <div className="text-[13px] mt-1 opacity-85 italic">{profile.scientific_name}</div>
          )}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(profile.scientific_name ?? profile.species_name).catch(() => {})}
          aria-label="Copy scientific name"
          className="absolute bottom-5 right-5 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          <Icon name="arrow-up" size={14} stroke={2} className="text-paper" />
        </button>
      </div>

      {/* Quick facts */}
      <div className="px-5 py-3.5 bg-paper-alt border-b border-rule grid grid-cols-3 gap-2.5">
        <QuickFact icon="sun"     label="Light"    value={shortPreview(profile.light)} />
        <QuickFact icon="drop"    label="Water"    value={shortPreview(profile.watering)} />
        <QuickFact icon="warning" label="Pets"     value={toxicityShort(profile.toxicity)} tone={profile.toxicity?.toLowerCase().includes('toxic') ? 'danger' : 'good'} />
      </div>

      {/* Your plants callout */}
      {matchingPlants.length > 0 && (
        <div className="mx-5 mt-4 p-3.5 bg-accent-soft border border-rule rounded-brand">
          <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-accent mb-2">
            {matchingPlants.length === 1 ? 'You have one' : `You have ${matchingPlants.length}`}
          </div>
          <div className="flex flex-col gap-1.5">
            {matchingPlants.map(p => (
              <a key={p.id} href={`/plant/${p.id}`} className="flex items-center gap-2 group">
                <Icon name="leaf" size={12} stroke={1.9} className="text-accent shrink-0" />
                <span className="font-serif italic text-[14px] text-ink group-hover:text-accent truncate">
                  {p.nickname}
                </span>
                <Icon name="chev" size={12} className="text-ink-muted ml-auto shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      <SectionLabel number="§ 01" title="Care" />
      <div className="mx-5 px-4 py-1 bg-card border border-rule rounded-brand-lg">
        <CareSection icon="sun"         title="Light"       text={profile.light} />
        <CareSection icon="drop"        title="Watering"    text={profile.watering} />
        <CareSection icon="humidity"    title="Humidity"    text={profile.humidity} />
        <CareSection icon="thermometer" title="Temperature" text={profile.temperature} />
        <CareSection icon="soil"        title="Soil"        text={profile.soil} />
        <CareSection icon="scissors"    title="Pruning"     text={profile.pruning_tips} last />
      </div>

      {profile.common_problems && (
        <>
          <SectionLabel number="§ 02" title="Common problems" />
          <div className="px-5 flex flex-col gap-1.5">
            {splitLines(profile.common_problems).map((p, i) => (
              <div key={i} className="flex gap-3 px-3.5 py-2.5 bg-card border border-rule rounded-brand">
                <div className="w-7 h-7 rounded-full bg-paper-alt flex items-center justify-center shrink-0">
                  <Icon name="warning" size={14} stroke={1.9} className="text-warn" />
                </div>
                <div className="flex-1 text-[13px] text-ink leading-snug">{p}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {profile.disease_symptoms && (
        <>
          <SectionLabel number="§ 03" title="Disease &amp; symptoms" />
          <div className="mx-5 px-4 py-1 bg-card border border-rule rounded-brand-lg">
            <CareSection icon="bug" title="Signs to watch" text={profile.disease_symptoms} last />
          </div>
        </>
      )}

      {profile.toxicity && (
        <>
          <SectionLabel number="§ 04" title="Toxicity" />
          <div className="mx-5 px-4 py-3 bg-card border border-rule rounded-brand-lg">
            <p className="font-serif text-[14px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
              {profile.toxicity}
            </p>
            {/* Phase 5: honest authority beats implied authority — toxicity is
                AI-generated content, and pets are a high-stakes consumer of it. */}
            <p className="mt-2 font-mono text-[9px] tracking-[0.1em] uppercase text-ink-muted">
              AI-generated — verify with your vet for pet-critical decisions.
            </p>
          </div>
        </>
      )}

      {profile.growth_habits && (
        <>
          <SectionLabel number="§ 05" title="Growth" />
          <div className="px-5">
            <p className="font-serif text-[15px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
              {profile.growth_habits}
            </p>
          </div>
        </>
      )}

      {profile.propagation && (
        <>
          <SectionLabel number="§ 06" title="Propagation" />
          <div className="px-5">
            <p className="font-serif text-[15px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
              {profile.propagation}
            </p>
          </div>
        </>
      )}

      <div className="mt-6 mx-5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-ink-muted font-mono tracking-[0.06em]">
          Guide generated {formatTimestamp(profile.fetched_at)}
        </p>
        <div className="flex items-center gap-2">
          {/* Phase 5: refresh regenerates blind — this reports what's wrong */}
          <button
            onClick={() => setFlagField(null)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-rule text-[12px] font-medium text-ink-soft"
          >
            <Icon name="warning" size={12} stroke={1.9} /> Report an issue
          </button>
          <HairlineButton variant="outline" onClick={onRefresh}>
            <Icon name="sparkle" size={12} stroke={1.9} /> Refresh
          </HairlineButton>
        </div>
      </div>
      {flagSaved && (
        <div className="mt-2.5 mx-5 flex items-center gap-2 px-3.5 py-2.5 bg-accent-soft border border-rule rounded-brand">
          <Icon name="check" size={13} stroke={2.2} className="text-accent shrink-0" />
          <span className="text-[12px] text-accent">Reported — see Me &rarr; Flagged facts.</span>
        </div>
      )}
      {flagField !== false && (
        <FlagFactSheet
          speciesProfileId={profile.id}
          speciesName={profile.species_name}
          initialField={flagField}
          onClose={() => setFlagField(false)}
          onFlagged={() => setFlagSaved(true)}
        />
      )}

      <div className="mt-5 px-5 flex flex-col gap-2.5 pb-4">
        {matchingPlants.length === 0 ? (
          <HairlineButton
            variant="solid"
            fullWidth
            onClick={() => {
              const name = encodeURIComponent(profile.species_name)
              window.location.href = `/add-plant?species=${name}`
            }}
          >
            <Icon name="plus" size={14} stroke={2} /> I have one — add to collection
          </HairlineButton>
        ) : (
          <HairlineButton
            variant="solid"
            fullWidth
            onClick={() => {
              const name = encodeURIComponent(profile.species_name)
              window.location.href = `/add-plant?species=${name}`
            }}
          >
            <Icon name="plus" size={14} stroke={2} /> Add another to collection
          </HairlineButton>
        )}
        <HairlineButton variant="outline" onClick={onBack} fullWidth>
          <Icon name="back" size={14} stroke={1.9} /> Back to library
        </HairlineButton>
      </div>
    </div>
  )
}

function QuickFact({
  icon, label, value, tone,
}: {
  icon: 'sun' | 'drop' | 'warning'
  label: string
  value: string
  tone?: 'danger' | 'good'
}) {
  const color = tone === 'danger' ? 'text-danger' : 'text-accent'
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name={icon} size={12} stroke={1.9} className={color} />
        <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-muted">{label}</div>
      </div>
      <div className="font-sans text-[12px] text-ink font-medium line-clamp-2">{value}</div>
    </div>
  )
}

function CareSection({
  icon, title, text, last,
}: {
  icon: 'sun' | 'drop' | 'humidity' | 'thermometer' | 'soil' | 'scissors' | 'bug'
  title: string
  text: string | null
  last?: boolean
}) {
  if (!text) return null
  return (
    <div className={`py-3.5 ${last ? '' : 'border-b border-dashed border-rule'}`}>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Icon name={icon} size={14} stroke={1.9} className="text-accent" />
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft font-semibold">
          {title}
        </div>
      </div>
      <FormattedContent text={text} />
    </div>
  )
}

function FormattedContent({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const hasBullets = lines.some(l => l.startsWith('• ') || l.startsWith('- ') || l.startsWith('* '))
  if (hasBullets) {
    return (
      <ul className="space-y-1.5">
        {lines.map((line, i) => {
          const content = line.replace(/^[•\-*]\s*/, '').trim()
          if (!content) return null
          return (
            <li key={i} className="flex gap-2 items-start text-[14px] text-ink leading-snug font-serif">
              <span className="text-ink-muted font-mono mt-0.5 select-none">—</span>
              <span>{content}</span>
            </li>
          )
        })}
      </ul>
    )
  }
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  if (paragraphs.length > 1) {
    return (
      <div className="space-y-2">
        {paragraphs.map((p, i) => (
          <p key={i} className="font-serif text-[14px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
            {p}
          </p>
        ))}
      </div>
    )
  }
  return (
    <p className="font-serif text-[14px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
      {text}
    </p>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────

function shortPreview(text: string | null): string {
  if (!text) return '—'
  const first = text.split(/[.\n]/)[0].trim()
  return first.length > 24 ? first.slice(0, 22) + '…' : first
}

function toxicityShort(text: string | null): string {
  if (!text) return 'Unknown'
  const lower = text.toLowerCase()
  // Strip negated phrases first so "non-toxic" can't trip the danger test below.
  const dangerText = lower.replace(/non-?toxic|not toxic/g, '')
  // Danger wording wins: "non-toxic to humans but toxic to cats" must read
  // Toxic. A plain includes('safe') used to label "Unsafe for cats" Pet safe.
  if (/toxic|poison|unsafe|not safe|harmful/.test(dangerText)) return 'Toxic'
  // \b keeps "safe" from matching inside "unsafe".
  if (/\bsafe\b|non-?toxic|not toxic/.test(lower)) return 'Pet safe'
  return shortPreview(text)
}

function splitLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.replace(/^[•\-*]\s*/, ''))
}
