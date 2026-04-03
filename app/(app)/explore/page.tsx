'use client'
// app/(app)/explore/page.tsx
//
// Plant Encyclopedia — ad-hoc lookup tool.
//
// Text search flow:
//   1. User types a name (even misspelled) → calls suggest-species
//   2. App shows a 2-column grid of candidate species with Wikipedia thumbnails
//   3. User taps the plant they mean → calls fetch-species-info → shows profile
//
// Photo search flow:
//   Upload/snap a photo → calls identify-species (base64, no storage)
//   → gets species name → calls fetch-species-info → shows profile directly
//
// Species profiles are formatted with bullet points for multi-item sections
// via the FormattedContent component below.

import { createClient } from '@/lib/supabase/client'
import { formatTimestamp } from '@/lib/utils'
import type { SpeciesProfile } from '@/lib/types'
import { useState, useRef } from 'react'

// ── Local types ───────────────────────────────────────────────────────────────

// What the suggest-species Edge Function returns per candidate
interface SuggestionBase {
  scientificName: string
  commonName: string
  description: string
}

// After the browser fetches Wikipedia thumbnails, we add thumbnailUrl
interface Suggestion extends SuggestionBase {
  thumbnailUrl: string | null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const supabase = createClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [nameQuery,      setNameQuery]      = useState('')
  const [suggestions,    setSuggestions]    = useState<Suggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [profile,        setProfile]        = useState<SpeciesProfile | null>(null)
  const [identifiedName, setIdentifiedName] = useState<string | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [photoLoading,   setPhotoLoading]   = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Auth helper ───────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not logged in')
    return session.access_token
  }

  // ── Suggestions (text search, step 1) ────────────────────────────────────

  // Fetches candidate species from suggest-species, then enriches each one
  // with a thumbnail from the free Wikipedia REST API.
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

      const rawSuggestions: SuggestionBase[] = data?.suggestions ?? []

      // Fetch Wikipedia thumbnails in parallel — failures are silently ignored
      // so a missing article never blocks the whole list from appearing.
      const withThumbs: Suggestion[] = await Promise.all(
        rawSuggestions.map(async (s) => {
          try {
            const res = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.scientificName)}`
            )
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

  // ── Profile fetch (text search, step 2 / photo search, step 2) ───────────

  // Calls fetch-species-info and displays the full care profile.
  // forceRefresh=true bypasses the cache and regenerates from AI.
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
      if (data?.profile) {
        setProfile(data.profile)
        setSuggestions([]) // hide the suggestion list once a profile is shown
      } else {
        throw new Error('No profile returned.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch species info.')
    } finally {
      setLoading(false)
    }
  }

  // ── Name search handler ───────────────────────────────────────────────────

  async function handleNameSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!nameQuery.trim()) return
    await fetchSuggestions(nameQuery)
  }

  // ── Suggestion selection ──────────────────────────────────────────────────

  async function selectSuggestion(scientificName: string) {
    await fetchProfile(scientificName)
  }

  // Go back from a profile to the suggestions list
  function handleBack() {
    setProfile(null)
    setIdentifiedName(null)
    setError(null)
  }

  // ── Photo search handler ──────────────────────────────────────────────────

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
      const token  = await getToken()

      // Step 1: identify the species from the photo
      const { data, error: fnError } = await supabase.functions.invoke('identify-species', {
        body: { imageBase64: base64, mimeType: file.type },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)

      const speciesName: string | null = data?.speciesName ?? null

      if (!speciesName) {
        setError("Couldn't identify a plant in that photo. Try a clearer image, or search by name.")
        setPhotoLoading(false)
        return
      }

      setIdentifiedName(speciesName)
      setPhotoLoading(false)

      // Step 2: fetch the full care profile for the identified species
      await fetchProfile(speciesName)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo identification failed.')
      setPhotoLoading(false)
    }
  }

  // Converts a File to a raw base64 string (strips the data: URI prefix)
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const isSearching = loading || photoLoading || suggestLoading
  const showSuggestions = !profile && suggestions.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 pt-6 pb-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Explore Plants</h1>
        <p className="text-sm text-gray-500 mt-1">
          Look up care guides for any houseplant by name or photo.
        </p>
      </div>

      {/* ── Search controls (always visible) ────────────────────────────── */}
      <form onSubmit={handleNameSearch} className="flex gap-2 mb-3">
        <input
          type="text"
          value={nameQuery}
          onChange={e => setNameQuery(e.target.value)}
          placeholder="e.g. Monstera, Pothos, filadendren…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          disabled={isSearching}
        />
        <button
          type="submit"
          disabled={isSearching || !nameQuery.trim()}
          className="bg-brand text-white font-semibold px-4 py-3 rounded-xl text-sm hover:bg-brand-light transition-colors disabled:opacity-50"
        >
          Search
        </button>
      </form>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isSearching}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-brand hover:text-brand transition-colors disabled:opacity-50 mb-5"
      >
        <span className="text-lg">📸</span>
        <span className="font-medium">Identify from a photo</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* ── Loading states ───────────────────────────────────────────────── */}
      {suggestLoading && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-3 animate-pulse">🔍</div>
          <p className="text-sm font-medium">Finding matches…</p>
        </div>
      )}
      {photoLoading && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-3 animate-pulse">📸</div>
          <p className="text-sm font-medium">Identifying plant…</p>
        </div>
      )}
      {loading && !photoLoading && (
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-3 animate-pulse">🌿</div>
          <p className="text-sm font-medium">Fetching care guide…</p>
          {identifiedName && (
            <p className="text-xs text-brand mt-1">Identified: {identifiedName}</p>
          )}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && !isSearching && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Suggestion grid ──────────────────────────────────────────────── */}
      {showSuggestions && !isSearching && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            {suggestions.length} matches — tap the one you mean
          </p>
          <div className="grid grid-cols-2 gap-3">
            {suggestions.map((s) => (
              <button
                key={s.scientificName}
                onClick={() => selectSuggestion(s.scientificName)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-brand hover:shadow-sm active:scale-95 transition-all"
              >
                {/* Thumbnail — Wikipedia photo or green placeholder */}
                <div className="w-full aspect-square bg-brand-bg flex items-center justify-center overflow-hidden">
                  {s.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.thumbnailUrl}
                      alt={s.commonName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl">🌿</span>
                  )}
                </div>
                {/* Text info */}
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-900 leading-tight">
                    {s.commonName}
                  </p>
                  <p className="text-xs italic text-gray-500 mt-0.5 leading-tight">
                    {s.scientificName}
                  </p>
                  <p className="text-xs text-gray-600 mt-1.5 leading-snug line-clamp-3">
                    {s.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Species profile ──────────────────────────────────────────────── */}
      {profile && !isSearching && (
        <SpeciesProfileCard
          profile={profile}
          identifiedFrom={identifiedName}
          onBack={suggestions.length > 0 ? handleBack : undefined}
          onRefresh={() => fetchProfile(profile.species_name, true)}
        />
      )}
    </div>
  )
}

// ── Formatted content renderer ────────────────────────────────────────────────
// Renders a species profile text value with smart formatting:
//   • Lines starting with "• " or "- " become a styled bullet list
//   • Multiple paragraphs (separated by blank lines) are stacked
//   • Plain text falls back to a single paragraph

function FormattedContent({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Detect bullet-formatted content
  const hasBullets = lines.some(l => l.startsWith('• ') || l.startsWith('- ') || l.startsWith('* '))

  if (hasBullets) {
    return (
      <ul className="space-y-2">
        {lines.map((line, i) => {
          // Strip the bullet character
          const content = line.replace(/^[•\-\*]\s*/, '').trim()
          if (!content) return null
          return (
            <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
              <span className="text-brand mt-0.5 flex-shrink-0 select-none">•</span>
              <span>{content}</span>
            </li>
          )
        })}
      </ul>
    )
  }

  // Multiple paragraphs (double-newline separation)
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  if (paragraphs.length > 1) {
    return (
      <div className="space-y-2">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-gray-700 leading-relaxed">{p}</p>
        ))}
      </div>
    )
  }

  // Plain text
  return <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
}

// ── Species Profile Card ──────────────────────────────────────────────────────
// Displays the full encyclopedic profile for a species.

function SpeciesProfileCard({
  profile,
  identifiedFrom,
  onBack,
  onRefresh,
}: {
  profile: SpeciesProfile
  identifiedFrom: string | null
  onBack?: () => void
  onRefresh: () => void
}) {
  const sections: { key: string; label: string; value: string | null }[] = [
    { key: 'light',            label: '☀️ Light',              value: profile.light            },
    { key: 'watering',         label: '💧 Watering',           value: profile.watering         },
    { key: 'humidity',         label: '💨 Humidity',           value: profile.humidity         },
    { key: 'temperature',      label: '🌡️ Temperature',        value: profile.temperature      },
    { key: 'soil',             label: '🪴 Soil & Repotting',   value: profile.soil             },
    { key: 'pruning_tips',     label: '✂️ Pruning',            value: profile.pruning_tips     },
    { key: 'toxicity',         label: '⚠️ Toxicity',           value: profile.toxicity         },
    { key: 'common_problems',  label: '🐛 Common Problems',    value: profile.common_problems  },
    { key: 'disease_symptoms', label: '🔬 Disease & Symptoms', value: profile.disease_symptoms },
    { key: 'growth_habits',    label: '📏 Growth Habits',      value: profile.growth_habits    },
    { key: 'propagation',      label: '🌱 Propagation',        value: profile.propagation      },
  ]

  return (
    <div className="mt-2">

      {/* Back to results button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-brand font-medium mb-4 hover:underline"
        >
          ← Back to results
        </button>
      )}

      {/* Species header */}
      <div className="mb-4">
        {identifiedFrom && (
          <p className="text-xs text-brand font-medium mb-1">📸 Identified from photo</p>
        )}
        <h2 className="text-xl font-bold text-gray-900">
          {profile.common_names?.split(',')[0]?.trim() ?? profile.species_name}
        </h2>
        {profile.scientific_name && (
          <p className="text-sm italic text-gray-500">{profile.scientific_name}</p>
        )}
        {profile.common_names && (
          <p className="text-xs text-gray-400 mt-0.5">
            Also known as: {profile.common_names}
          </p>
        )}
      </div>

      {/* Care sections */}
      <div className="space-y-3">
        {sections.filter(s => s.value).map(section => (
          <div key={section.key} className="bg-brand-bg rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-brand mb-2">{section.label}</p>
            <FormattedContent text={section.value!} />
          </div>
        ))}
      </div>

      {/* Cache timestamp and refresh */}
      <p className="text-xs text-gray-400 mt-4 text-center">
        Guide generated {formatTimestamp(profile.fetched_at)}
        {' · '}
        <button onClick={onRefresh} className="text-brand underline">
          Refresh
        </button>
      </p>
    </div>
  )
}
