'use client'
// app/(app)/plant/[id]/page.tsx
// Plant detail screen — rich profile for a single plant.
// Three-tab layout: Overview, History, Species.
// All data fetching and mutations happen client-side via the Supabase browser client.

import { createClient } from '@/lib/supabase/client'
import {
  formatDate,
  formatTimestamp,
  CARE_LOG_ICONS,
  CARE_LOG_LABELS,
} from '@/lib/utils'
import type { Plant, PlantPhoto, CareLog, AnalysisResult, SpeciesProfile } from '@/lib/types'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'history' | 'species'

// A unified timeline entry merging care logs and analysis results by date.
type TimelineItem =
  | { kind: 'care';     id: string; date: string; data: CareLog }
  | { kind: 'analysis'; id: string; date: string; data: AnalysisResult }

// ── Watering reminder options ────────────────────────────────────────────────

const REMINDER_OPTIONS = [
  { label: '3 days',  days: 3  },
  { label: '5 days',  days: 5  },
  { label: '7 days',  days: 7  },
  { label: '10 days', days: 10 },
  { label: '14 days', days: 14 },
]

// ── Primary care actions (always shown) ──────────────────────────────────────

const PRIMARY_CARE_ACTIONS: { type: CareLog['type']; label: string; icon: string }[] = [
  { type: 'watered',    label: 'Watered',    icon: '💧' },
  { type: 'fertilized', label: 'Fertilized', icon: '🌱' },
  { type: 'misted',     label: 'Misted',     icon: '🌫️' },
]

// ── Secondary care actions (shown in "More actions" expandable row) ───────────

const SECONDARY_CARE_ACTIONS: { type: CareLog['type']; label: string; icon: string }[] = [
  { type: 'repotted',      label: 'Repotted',      icon: '🪴' },
  { type: 'pruned',        label: 'Pruned',         icon: '✂️' },
  { type: 'pest_treatment', label: 'Pest Treatment', icon: '🐛' },
  { type: 'moved',         label: 'Moved',          icon: '📍' },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function PlantDetailPage() {
  const params   = useParams<{ id: string }>()
  const id       = params.id
  const router   = useRouter()
  const supabase = createClient()

  // ── Core state ─────────────────────────────────────────────────────────────
  const [plant,          setPlant]          = useState<Plant | null>(null)
  const [photos,         setPhotos]         = useState<PlantPhoto[]>([])
  const [careLogs,       setCareLogs]       = useState<CareLog[]>([])
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null)
  const [allAnalyses,    setAllAnalyses]    = useState<AnalysisResult[]>([])
  const [speciesProfile, setSpeciesProfile] = useState<SpeciesProfile | null>(null)
  const [loading,        setLoading]        = useState(true)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeTab,           setActiveTab]           = useState<Tab>('overview')
  const [uploading,           setUploading]           = useState(false)
  const [loggingCare,         setLoggingCare]         = useState(false)
  const [showNoteInput,       setShowNoteInput]       = useState(false)
  const [noteText,            setNoteText]            = useState('')
  const [showMoreActions,     setShowMoreActions]     = useState(false)
  const [analyzing,           setAnalyzing]           = useState(false)
  const [fetchingSpecies,     setFetchingSpecies]     = useState(false)
  const [savingReminder,      setSavingReminder]      = useState(false)
  const [editing,             setEditing]             = useState(false)
  const [saving,              setSaving]              = useState(false)
  const [deleting,            setDeleting]            = useState(false)
  const [error,               setError]               = useState<string | null>(null)

  // ── Edit form state ────────────────────────────────────────────────────────
  const [nickname,          setNickname]          = useState('')
  const [editSpecies,       setEditSpecies]       = useState('')
  const [location,          setLocation]          = useState('')
  const [potSize,           setPotSize]           = useState('')
  const [acquiredDate,      setAcquiredDate]      = useState('')
  const [lastRepottedDate,  setLastRepottedDate]  = useState('')
  const [notes,             setNotes]             = useState('')

  // ── Toast state ────────────────────────────────────────────────────────────
  // A lightweight self-dismissing notification shown after care actions.
  const [toast,         setToast]        = useState<{ message: string; key: number } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Shows a toast for 2.5 seconds, replacing any existing one.
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // File input ref for photo upload
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Initial data load ──────────────────────────────────────────────────────

  // Re-fetch everything when the plant ID changes (e.g. navigating between plants).
  // loadAll is defined below and is stable within a render — safe to omit from deps.
  useEffect(() => { loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // When species becomes known (either from the plant record or from an analysis),
  // look up the cached species profile from the database.
  // fetchSpeciesProfileFromDB is defined below — safe to omit from deps.
  useEffect(() => {
    const species = plant?.species || latestAnalysis?.species
    if (species) fetchSpeciesProfileFromDB(species)
  }, [plant?.species, latestAnalysis?.species]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    await Promise.all([fetchPlant(), fetchPhotos(), fetchCareLogs(), fetchAnalyses()])
    setLoading(false)
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchPlant() {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      router.push('/')
      return
    }
    setPlant(data)
    // Pre-fill the edit form whenever plant data refreshes
    setNickname(data.nickname)
    setEditSpecies(data.species ?? '')
    setLocation(data.location ?? '')
    setPotSize(data.pot_size ?? '')
    setAcquiredDate(data.acquired_date ?? '')
    setLastRepottedDate(data.last_repotted_date ?? '')
    setNotes(data.notes ?? '')
  }

  async function fetchPhotos() {
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('plant_id', id)
      .order('created_at', { ascending: false })

    if (data) setPhotos(data)
  }

  async function fetchCareLogs() {
    const { data } = await supabase
      .from('care_logs')
      .select('*')
      .eq('plant_id', id)
      .order('logged_at', { ascending: false })
      .limit(50)

    if (data) setCareLogs(data)
  }

  async function fetchAnalyses() {
    const { data } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('plant_id', id)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      setLatestAnalysis(data[0])
      setAllAnalyses(data)
    } else {
      setLatestAnalysis(null)
      setAllAnalyses([])
    }
  }

  async function fetchSpeciesProfileFromDB(speciesName: string) {
    const { data } = await supabase
      .from('species_profiles')
      .select('*')
      .eq('species_name', speciesName)
      .single()

    if (data) setSpeciesProfile(data)
  }

  // ── Photo upload ───────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadPhoto(file)
    // Clear the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadPhoto(file: File) {
    setUploading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Derive file extension from the MIME type
      const ext = file.type === 'image/webp' ? 'webp'
                : file.type === 'image/png'  ? 'png'
                : file.type === 'image/gif'  ? 'gif'
                : 'jpg'
      const path = `${user!.id}/${id}/${Date.now()}.${ext}`

      // On web we can use file.arrayBuffer() directly — much cleaner than the
      // manual base64→Uint8Array conversion needed in React Native.
      const buffer = await file.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(path, buffer, { contentType: file.type })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('photos').insert({
        plant_id: id,
        user_id:  user!.id,
        storage_path: path,
      })

      if (dbError) throw dbError

      await fetchPhotos()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.')
    } finally {
      setUploading(false)
    }
  }

  // ── Care logging ───────────────────────────────────────────────────────────

  async function logCare(type: CareLog['type'], customNote?: string) {
    setLoggingCare(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('care_logs').insert({
        plant_id: id,
        user_id:  user!.id,
        type,
        notes: customNote ?? null,
      })
      if (error) throw error

      // Show a brief confirmation toast using the action's icon + label
      const label = type === 'note' ? 'Note saved' : CARE_LOG_LABELS[type]
      showToast(`${CARE_LOG_ICONS[type]} ${label}`)

      // For "watered", refresh the My Plants Server Component in the background
      // so the watering badge is up-to-date when the user navigates back.
      if (type === 'watered') router.refresh()

      await fetchCareLogs()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save care log.')
    } finally {
      setLoggingCare(false)
    }
  }

  async function handleNoteSubmit() {
    if (!noteText.trim()) return
    await logCare('note', noteText.trim())
    setNoteText('')
    setShowNoteInput(false)
  }

  // ── Watering reminder ──────────────────────────────────────────────────────
  // On web there are no push notifications, so we just store the interval in
  // the database. The app still shows the watering status badge from this value.

  async function setReminder(days: number) {
    setSavingReminder(true)
    const { error } = await supabase
      .from('plants')
      .update({ watering_interval_days: days })
      .eq('id', id)
    if (!error) {
      setPlant(prev => prev ? { ...prev, watering_interval_days: days } : prev)
    }
    setSavingReminder(false)
  }

  async function removeReminder() {
    setSavingReminder(true)
    const { error } = await supabase
      .from('plants')
      .update({ watering_interval_days: null })
      .eq('id', id)
    if (!error) {
      setPlant(prev => prev ? { ...prev, watering_interval_days: null } : prev)
    }
    setSavingReminder(false)
  }

  // ── AI Analysis ────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (photos.length === 0) {
      alert('Add a photo of your plant first, then try analysis.')
      return
    }
    setAnalyzing(true)
    setError(null)
    try {
      // Get the public URL of the most recent photo
      const latestPhoto = photos[0]
      const { data: urlData } = supabase.storage
        .from('plant-photos')
        .getPublicUrl(latestPhoto.storage_path)
      const imageUrl = urlData.publicUrl

      // Pass up to 3 past analyses so Claude can comment on changes over time
      const previousAnalyses = allAnalyses.slice(0, 3).map(r => ({
        date:    new Date(r.created_at).toLocaleDateString(),
        species: r.species,
        health:  r.health,
        care:    r.care,
      }))

      // Pass recent care logs so the AI knows what the plant has received
      const recentCareLogs = careLogs.slice(0, 10).map(l => ({
        type:  l.type,
        notes: l.notes,
        date:  new Date(l.logged_at).toLocaleDateString(),
      }))

      // Auth token must be passed explicitly — supabase.functions.invoke
      // doesn't always inject it reliably
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error: fnError } = await supabase.functions.invoke('analyze-plant', {
        body: {
          imageUrl,
          previousAnalyses,
          recentCareLogs,
          speciesProfile: speciesProfile ?? null,
          plantContext: (plant?.location || plant?.pot_size) ? {
            location: plant?.location ?? null,
            pot_size: plant?.pot_size ?? null,
          } : null,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (fnError) throw new Error(fnError.message || 'Analysis failed')
      if (data?.error) throw new Error(data.error)
      if (!data?.result) throw new Error('Unexpected response from analysis service.')

      const result = data.result

      // Save result to DB so it becomes part of the plant's history
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('analysis_results').insert({
        plant_id: id,
        user_id:  user!.id,
        photo_id: latestPhoto.id,
        species:  result.species,
        health:   result.health,
        care:     result.care,
      })

      // If a species was identified and we don't have a profile yet, fetch one silently
      if (result.species && !speciesProfile) {
        fetchSpeciesProfileFromAI(result.species)
      }

      await fetchAnalyses()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Calls the fetch-species-info Edge Function to generate (or refresh) a species profile
  async function fetchSpeciesProfileFromAI(speciesName: string, forceRefresh = false) {
    setFetchingSpecies(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error: fnError } = await supabase.functions.invoke('fetch-species-info', {
        body: { speciesName, forceRefresh },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (data?.profile) setSpeciesProfile(data.profile)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch species info.')
    } finally {
      setFetchingSpecies(false)
    }
  }

  // ── Edit & Delete ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!nickname.trim()) {
      setError('Nickname cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('plants')
      .update({
        nickname:           nickname.trim(),
        species:            editSpecies.trim() || null,
        location:           location.trim() || null,
        pot_size:           potSize.trim() || null,
        acquired_date:      acquiredDate || null,
        last_repotted_date: lastRepottedDate || null,
        notes:              notes.trim() || null,
      })
      .eq('id', id)

    if (error) {
      setError('Could not save changes.')
    } else {
      setEditing(false)
      await fetchPlant()
    }
    setSaving(false)
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${plant?.nickname}? This will remove all photos, care logs, and analysis history. This cannot be undone.`
    )
    if (!confirmed) return

    setDeleting(true)
    await supabase.from('plants').delete().eq('id', id)
    router.push('/')
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Build a single sorted timeline from care logs + analyses for the History tab
  function buildTimeline(): TimelineItem[] {
    const items: TimelineItem[] = [
      ...careLogs.map(log => ({
        kind: 'care' as const,
        id:   log.id,
        date: log.logged_at,
        data: log,
      })),
      ...allAnalyses.map(a => ({
        kind: 'analysis' as const,
        id:   a.id,
        date: a.created_at,
        data: a,
      })),
    ]
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  // Returns a photo's public URL via the Supabase storage URL helper
  function getPhotoUrl(photo: PlantPhoto): string {
    const { data } = supabase.storage
      .from('plant-photos')
      .getPublicUrl(photo.storage_path)
    return data.publicUrl
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-4xl animate-pulse">🌿</div>
      </div>
    )
  }

  if (!plant) return null

  const knownSpecies = plant.species || latestAnalysis?.species
  const heroPhoto    = photos[0]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pb-24">

      {/* ── Fixed header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-brand text-sm font-medium">
          ← My Plants
        </Link>
        <h1 className="text-base font-semibold text-gray-900 truncate mx-2 flex-1 text-center">
          {plant.nickname}
        </h1>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-brand font-medium"
          >
            Edit
          </button>
        ) : (
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-gray-500 font-medium"
          >
            Cancel
          </button>
        )}
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex justify-between items-start">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold">×</button>
        </div>
      )}

      {/* ── Edit form ───────────────────────────────────────────────────────── */}
      {editing && (
        <div className="px-4 pt-4 pb-6 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Edit Plant</h2>
          <div className="space-y-4">

            {/* Nickname */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nickname <span className="text-brand">*</span>
              </label>
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* Species */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Species</label>
              <input
                type="text"
                value={editSpecies}
                onChange={e => setEditSpecies(e.target.value)}
                placeholder="e.g. Monstera deliciosa"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Living room — east window"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* Pot size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pot size</label>
              <input
                type="text"
                value={potSize}
                onChange={e => setPotSize(e.target.value)}
                placeholder="e.g. 6 inch terracotta"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            {/* Acquired date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date acquired</label>
              <div className="relative">
                <div className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 rounded-xl text-sm pointer-events-none">
                  <span className={acquiredDate ? 'text-gray-900' : 'text-gray-400'}>
                    {acquiredDate ? formatDate(acquiredDate) : 'Tap to select a date'}
                  </span>
                  <span>📅</span>
                </div>
                <input
                  type="date"
                  value={acquiredDate}
                  onChange={e => setAcquiredDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </div>
            </div>

            {/* Last repotted date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last repotted</label>
              <div className="relative">
                <div className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 rounded-xl text-sm pointer-events-none">
                  <span className={lastRepottedDate ? 'text-gray-900' : 'text-gray-400'}>
                    {lastRepottedDate ? formatDate(lastRepottedDate) : 'Tap to select a date'}
                  </span>
                  <span>📅</span>
                </div>
                <input
                  type="date"
                  value={lastRepottedDate}
                  onChange={e => setLastRepottedDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
              />
            </div>

            {/* Save / Delete buttons */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-brand text-white font-semibold py-3 rounded-xl hover:bg-brand-light transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full bg-red-50 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete Plant'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 mt-0 sticky top-[57px] z-10 bg-white">
        {(['overview', 'history', 'species'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-brand border-b-2 border-brand'
                : 'text-gray-500 border-b-2 border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}

      {/* ── OVERVIEW tab ────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>

          {/* Hero photo */}
          <div className="w-full aspect-[4/3] bg-gray-50 relative">
            {heroPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getPhotoUrl(heroPhoto)}
                alt={plant.nickname}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <span className="text-5xl mb-2">🌿</span>
                <span className="text-sm">No photos yet</span>
              </div>
            )}
          </div>

          {/* Hidden file input — triggered by "Add Photo" button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Quick-action care buttons */}
          <div className="px-4 pt-4">
            <div className="grid grid-cols-4 gap-2 mb-2">
              {PRIMARY_CARE_ACTIONS.map(action => (
                <button
                  key={action.type}
                  onClick={() => logCare(action.type)}
                  disabled={loggingCare}
                  className="flex flex-col items-center bg-brand-bg rounded-xl py-3 px-1 hover:bg-green-100 transition-colors disabled:opacity-50 active:scale-95"
                >
                  <span className="text-2xl mb-1">{action.icon}</span>
                  <span className="text-xs font-medium text-brand">{action.label}</span>
                </button>
              ))}

              {/* Add Photo button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex flex-col items-center bg-gray-50 rounded-xl py-3 px-1 hover:bg-gray-100 transition-colors disabled:opacity-50 active:scale-95"
              >
                <span className="text-2xl mb-1">{uploading ? '⏳' : '📷'}</span>
                <span className="text-xs font-medium text-gray-600">
                  {uploading ? 'Uploading' : 'Add Photo'}
                </span>
              </button>
            </div>

            {/* Note button (full-width, toggles text input) */}
            <button
              onClick={() => setShowNoteInput(!showNoteInput)}
              className="w-full flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 mb-2 hover:bg-gray-100 transition-colors"
            >
              <span className="text-lg">📝</span>
              <span className="text-sm font-medium text-gray-600">Add a note</span>
            </button>

            {showNoteInput && (
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="What did you notice?"
                  onKeyDown={e => e.key === 'Enter' && handleNoteSubmit()}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={handleNoteSubmit}
                  disabled={!noteText.trim()}
                  className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}

            {/* More actions toggle */}
            <button
              onClick={() => setShowMoreActions(!showMoreActions)}
              className="w-full text-left text-xs text-gray-400 font-medium py-1 mb-2"
            >
              {showMoreActions ? '▾ Fewer actions' : '▸ More actions'}
            </button>

            {showMoreActions && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {SECONDARY_CARE_ACTIONS.map(action => (
                  <button
                    key={action.type}
                    onClick={() => logCare(action.type)}
                    disabled={loggingCare}
                    className="flex flex-col items-center bg-gray-50 rounded-xl py-3 px-1 hover:bg-gray-100 transition-colors disabled:opacity-50 active:scale-95"
                  >
                    <span className="text-2xl mb-1">{action.icon}</span>
                    <span className="text-xs font-medium text-gray-500">{action.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 mx-4 my-2" />

          {/* AI Analysis section */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">AI Analysis</h2>
              <button
                onClick={handleAnalyze}
                disabled={analyzing || photos.length === 0}
                className="text-xs bg-brand text-white font-medium px-3 py-1.5 rounded-lg hover:bg-brand-light transition-colors disabled:opacity-50"
              >
                {analyzing ? 'Analyzing…' : latestAnalysis ? 'Re-analyze' : 'Analyze Plant'}
              </button>
            </div>

            {photos.length === 0 && (
              <p className="text-xs text-gray-400 italic">Add a photo to enable AI analysis.</p>
            )}

            {latestAnalysis && (
              <div className="bg-brand-bg rounded-xl p-4 space-y-3">
                {latestAnalysis.species && (
                  <div>
                    <span className="text-xs font-semibold text-brand uppercase tracking-wide">Species</span>
                    <p className="text-sm text-gray-800 mt-0.5">{latestAnalysis.species}</p>
                  </div>
                )}
                {latestAnalysis.health && (
                  <div>
                    <span className="text-xs font-semibold text-brand uppercase tracking-wide">Health</span>
                    <p className="text-sm text-gray-800 mt-0.5">{latestAnalysis.health}</p>
                  </div>
                )}
                {latestAnalysis.care && (
                  <div>
                    <span className="text-xs font-semibold text-brand uppercase tracking-wide">Care tips</span>
                    <p className="text-sm text-gray-800 mt-0.5">{latestAnalysis.care}</p>
                  </div>
                )}
                <p className="text-xs text-gray-400">{formatTimestamp(latestAnalysis.created_at)}</p>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 mx-4 my-2" />

          {/* Plant metadata */}
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Plant Info</h2>
            <dl className="space-y-2">
              {knownSpecies && (
                <div className="flex gap-2">
                  <dt className="text-xs text-gray-400 w-28 shrink-0">Species</dt>
                  <dd className="text-xs text-gray-700">{knownSpecies}</dd>
                </div>
              )}
              {plant.location && (
                <div className="flex gap-2">
                  <dt className="text-xs text-gray-400 w-28 shrink-0">Location</dt>
                  <dd className="text-xs text-gray-700">{plant.location}</dd>
                </div>
              )}
              {plant.pot_size && (
                <div className="flex gap-2">
                  <dt className="text-xs text-gray-400 w-28 shrink-0">Pot size</dt>
                  <dd className="text-xs text-gray-700">{plant.pot_size}</dd>
                </div>
              )}
              {plant.acquired_date && (
                <div className="flex gap-2">
                  <dt className="text-xs text-gray-400 w-28 shrink-0">Acquired</dt>
                  <dd className="text-xs text-gray-700">{formatDate(plant.acquired_date)}</dd>
                </div>
              )}
              {plant.last_repotted_date && (
                <div className="flex gap-2">
                  <dt className="text-xs text-gray-400 w-28 shrink-0">Last repotted</dt>
                  <dd className="text-xs text-gray-700">{formatDate(plant.last_repotted_date)}</dd>
                </div>
              )}
              {plant.notes && (
                <div className="flex gap-2">
                  <dt className="text-xs text-gray-400 w-28 shrink-0">Notes</dt>
                  <dd className="text-xs text-gray-700">{plant.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100 mx-4 my-2" />

          {/* Watering reminder */}
          <div className="px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Watering Reminder</h2>
            <p className="text-xs text-gray-400 mb-3">
              Sets the watering interval used for the status badge on the plant grid.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {REMINDER_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => setReminder(opt.days)}
                  disabled={savingReminder}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                    plant.watering_interval_days === opt.days
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand hover:text-brand'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {plant.watering_interval_days && (
              <button
                onClick={removeReminder}
                disabled={savingReminder}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Remove reminder
              </button>
            )}
          </div>

          {/* Photo strip — all photos in a scrollable row */}
          {photos.length > 1 && (
            <>
              <div className="h-px bg-gray-100 mx-4 my-2" />
              <div className="px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">
                  All Photos ({photos.length})
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map(photo => (
                    <div
                      key={photo.id}
                      className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getPhotoUrl(photo)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HISTORY tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="px-4 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Care &amp; Analysis History</h2>

          {buildTimeline().length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">No history yet.</p>
              <p className="text-xs mt-1">Log care events or run an analysis to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {buildTimeline().map(item => (
                <div key={item.id} className="flex gap-3">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 ${
                      item.kind === 'analysis' ? 'bg-brand-bg' : 'bg-gray-100'
                    }`}>
                      {item.kind === 'care'
                        ? CARE_LOG_ICONS[item.data.type] || '•'
                        : '🔬'}
                    </div>
                    <div className="w-px flex-1 bg-gray-100 mt-1" />
                  </div>

                  {/* Content */}
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">
                        {item.kind === 'care'
                          ? CARE_LOG_LABELS[item.data.type] || item.data.type
                          : 'AI Analysis'}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatTimestamp(item.date)}
                      </span>
                    </div>

                    {/* Care log notes */}
                    {item.kind === 'care' && item.data.notes && (
                      <p className="text-xs text-gray-500">{item.data.notes}</p>
                    )}

                    {/* Analysis result summary */}
                    {item.kind === 'analysis' && (
                      <div className="bg-gray-50 rounded-lg p-3 mt-1 space-y-1.5">
                        {item.data.species && (
                          <p className="text-xs text-gray-700">
                            <span className="font-medium text-brand">Species: </span>
                            {item.data.species}
                          </p>
                        )}
                        {item.data.health && (
                          <p className="text-xs text-gray-700">
                            <span className="font-medium text-brand">Health: </span>
                            {item.data.health}
                          </p>
                        )}
                        {item.data.care && (
                          <p className="text-xs text-gray-700">
                            <span className="font-medium text-brand">Care: </span>
                            {item.data.care}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SPECIES tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'species' && (
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              {knownSpecies ? `${knownSpecies} — Care Guide` : 'Species Guide'}
            </h2>
            {knownSpecies && (
              <button
                onClick={() => fetchSpeciesProfileFromAI(knownSpecies, true)}
                disabled={fetchingSpecies}
                className="text-xs text-brand font-medium disabled:opacity-50"
              >
                {fetchingSpecies ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>

          {/* No species identified yet */}
          {!knownSpecies && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm">Species not yet identified.</p>
              <p className="text-xs mt-1">Run an AI analysis to identify your plant.</p>
            </div>
          )}

          {/* Species known but profile loading */}
          {knownSpecies && fetchingSpecies && !speciesProfile && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-2xl mb-2 animate-pulse">🌿</p>
              <p className="text-sm">Fetching species guide…</p>
            </div>
          )}

          {/* Species profile not in cache — prompt to fetch */}
          {knownSpecies && !speciesProfile && !fetchingSpecies && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-3">No species guide yet for {knownSpecies}.</p>
              <button
                onClick={() => fetchSpeciesProfileFromAI(knownSpecies)}
                className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-light transition-colors"
              >
                Generate Species Guide
              </button>
            </div>
          )}

          {/* Full species profile */}
          {speciesProfile && (
            <div className="space-y-4">
              {[
                { key: 'light',           label: '☀️ Light',           value: speciesProfile.light },
                { key: 'watering',        label: '💧 Watering',        value: speciesProfile.watering },
                { key: 'humidity',        label: '💨 Humidity',        value: speciesProfile.humidity },
                { key: 'temperature',     label: '🌡️ Temperature',    value: speciesProfile.temperature },
                { key: 'soil',            label: '🪱 Soil',             value: speciesProfile.soil },
                { key: 'toxicity',        label: '⚠️ Toxicity',        value: speciesProfile.toxicity },
                { key: 'common_problems', label: '🐛 Common Problems', value: speciesProfile.common_problems },
                { key: 'growth_habits',   label: '📏 Growth Habits',   value: speciesProfile.growth_habits },
                { key: 'propagation',     label: '🌱 Propagation',     value: speciesProfile.propagation },
              ]
                .filter(row => row.value)
                .map(row => (
                  <div key={row.key} className="border-b border-gray-50 pb-3 last:border-0">
                    <p className="text-xs font-semibold text-brand mb-1">{row.label}</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{row.value}</p>
                  </div>
                ))
              }
              <p className="text-xs text-gray-400 pt-1">
                Guide generated {formatTimestamp(speciesProfile.fetched_at)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Toast notification ──────────────────────────────────────────────────
          Fixed above the bottom nav bar. Uses a CSS keyframe (toast-enter in
          globals.css) to slide up and fade in. The `key` prop ensures the
          animation re-triggers if the user taps another action while a toast
          is already visible. `pointer-events-none` prevents it from blocking taps. */}
      {toast && (
        <div
          key={toast.key}
          className="toast-enter fixed bottom-20 left-1/2 z-50 bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none whitespace-nowrap"
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
