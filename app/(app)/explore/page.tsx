'use client'
// app/(app)/explore/page.tsx
//
// Plant Encyclopedia — ad-hoc lookup tool.
// Users can search for any houseplant by name OR by photo.
//
// Name search:  type a species name → calls fetch-species-info → shows profile
// Photo search: upload/snap a photo → calls identify-species (base64, no storage)
//               → gets species name → calls fetch-species-info → shows profile
//
// Results are the same SpeciesProfile used on Plant Detail screens, with
// two additional sections: Pruning Tips and Disease Symptoms.

import { createClient } from '@/lib/supabase/client'
import { formatTimestamp } from '@/lib/utils'
import type { SpeciesProfile } from '@/lib/types'
import { useState, useRef } from 'react'

export default function ExplorePage() {
  const supabase = createClient()

  // ── Search state ────────────────────────────────────────────────────────────
  const [nameQuery,      setNameQuery]      = useState('')
  const [profile,        setProfile]        = useState<SpeciesProfile | null>(null)
  const [identifiedName, setIdentifiedName] = useState<string | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [photoLoading,   setPhotoLoading]   = useState(false) // identifying phase
  const [error,          setError]          = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Fetch the auth token — required when calling Edge Functions from the browser
  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not logged in')
    return session.access_token
  }

  // Call fetch-species-info and display the result.
  // Pass forceRefresh=true to bypass the cache and regenerate from AI.
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
      if (data?.profile) setProfile(data.profile)
      else throw new Error('No profile returned.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch species info.')
    } finally {
      setLoading(false)
    }
  }

  // ── Name search ─────────────────────────────────────────────────────────────

  async function handleNameSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!nameQuery.trim()) return
    setIdentifiedName(null)
    await fetchProfile(nameQuery)
  }

  // ── Photo search ─────────────────────────────────────────────────────────────

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Clear the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''

    setPhotoLoading(true)
    setError(null)
    setProfile(null)
    setIdentifiedName(null)

    try {
      // Read the file as base64 in the browser — no storage upload needed
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

  // Converts a File object to a raw base64 string (without the data: URI prefix)
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip the "data:image/jpeg;base64," prefix — Claude wants just the data
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const isSearching = loading || photoLoading

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 pt-6 pb-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Explore Plants</h1>
        <p className="text-sm text-gray-500 mt-1">
          Look up care guides for any houseplant by name or photo.
        </p>
      </div>

      {/* ── Search by name ──────────────────────────────────────────────────── */}
      <form onSubmit={handleNameSearch} className="flex gap-2 mb-3">
        <input
          type="text"
          value={nameQuery}
          onChange={e => setNameQuery(e.target.value)}
          placeholder="e.g. Monstera deliciosa, Pothos..."
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

      {/* ── Search by photo ──────────────────────────────────────────────────── */}
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

      {/* ── Loading states ───────────────────────────────────────────────────── */}
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

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && !isSearching && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {profile && !isSearching && (
        <SpeciesProfileCard
          profile={profile}
          identifiedFrom={identifiedName}
          onRefresh={() => fetchProfile(profile.species_name, true)}
        />
      )}
    </div>
  )
}

// ── Species Profile Card ──────────────────────────────────────────────────────
// Displays the full encyclopedic profile for a species.
// Mirrors the Species tab on Plant Detail, with the two new sections added.

function SpeciesProfileCard({
  profile,
  identifiedFrom,
  onRefresh,
}: {
  profile: SpeciesProfile
  identifiedFrom: string | null
  onRefresh: () => void
}) {
  // All content sections in display order
  const sections: { key: string; label: string; value: string | null }[] = [
    { key: 'light',            label: '☀️ Light',             value: profile.light            },
    { key: 'watering',         label: '💧 Watering',          value: profile.watering         },
    { key: 'humidity',         label: '💨 Humidity',          value: profile.humidity         },
    { key: 'temperature',      label: '🌡️ Temperature',       value: profile.temperature      },
    { key: 'soil',             label: '🪴 Soil & Repotting',  value: profile.soil             },
    { key: 'pruning_tips',     label: '✂️ Pruning',           value: profile.pruning_tips     },
    { key: 'toxicity',         label: '⚠️ Toxicity',          value: profile.toxicity         },
    { key: 'common_problems',  label: '🐛 Common Problems',   value: profile.common_problems  },
    { key: 'disease_symptoms', label: '🔬 Disease & Symptoms',value: profile.disease_symptoms },
    { key: 'growth_habits',    label: '📏 Growth Habits',     value: profile.growth_habits    },
    { key: 'propagation',      label: '🌱 Propagation',       value: profile.propagation      },
  ]

  return (
    <div className="mt-2">
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
            <p className="text-xs font-semibold text-brand mb-1">{section.label}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{section.value}</p>
          </div>
        ))}
      </div>

      {/* Cache timestamp */}
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
