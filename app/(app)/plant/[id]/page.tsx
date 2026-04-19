'use client'
// app/(app)/plant/[id]/page.tsx
// Plant Detail — the most-used screen, redesigned as a single editorial
// scroll. Hero photo → status strip → AI diagnosis card → log book →
// dossier → species quick-facts (expandable) → photo strip. Pinned dock
// of quick-care buttons floats above the bottom nav.
//
// All data fetching and mutations happen client-side via the Supabase
// browser client. Logic mirrors the previous 3-tab version; only the JSX
// and styling have been rewritten.

import React from 'react'
import { createClient } from '@/lib/supabase/client'
import JSZip from 'jszip'
import {
  formatDate,
  formatTimestamp,
  relativeTime,
  CARE_LOG_LABELS,
  computeStreak,
} from '@/lib/utils'
import type { Plant, PlantPhoto, CareLog, AnalysisResult, SpeciesProfile, NoteCategory, MeasurementUnit } from '@/lib/types'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon, type IconName } from '@/components/Icon'
import { BigTitle, Chip, HairlineButton, SectionLabel } from '@/components/ui'
import { PlantPhoto as PlantPhotoPlaceholder } from '@/components/PlantPhoto'

// ── Care-action taxonomy ────────────────────────────────────────────────

type CareType = CareLog['type']

interface CareAction { type: CareType; label: string; icon: IconName }

const PRIMARY_ACTIONS: CareAction[] = [
  { type: 'watered',    label: 'Water',  icon: 'drop'     },
  { type: 'misted',     label: 'Mist',   icon: 'mist'     },
  { type: 'fertilized', label: 'Feed',   icon: 'leaf'     },
  { type: 'pruned',     label: 'Prune',  icon: 'scissors' },
]

const MORE_ACTIONS: CareAction[] = [
  { type: 'repotted',      label: 'Repot',     icon: 'pot'   },
  { type: 'pest_treatment', label: 'Treat',    icon: 'bug'   },
  { type: 'moved',         label: 'Move',      icon: 'move'  },
  { type: 'measured',      label: 'Measure',   icon: 'ruler' },
  { type: 'note',          label: 'Note',      icon: 'edit'  },
]

const REMINDER_OPTIONS = [3, 5, 7, 10, 14, 21]

// Structured note categories (Phase 15 — Gap 4). Maps each NoteCategory to an
// icon so the category picker reads as a field-guide taxonomy, not a mood wheel.
const NOTE_CATEGORIES: Array<{ key: NoteCategory; label: string; icon: IconName }> = [
  { key: 'growth',      label: 'Growth',      icon: 'leaf'    },
  { key: 'pest',        label: 'Pest',        icon: 'bug'     },
  { key: 'environment', label: 'Environment', icon: 'sun'     },
  { key: 'concern',     label: 'Concern',     icon: 'warning' },
  { key: 'general',     label: 'General',     icon: 'edit'    },
]

// Unit options for `measured` logs (Phase 15 — Gap 6). Short allowlist keeps
// the AI trend comparison reliable (no unit conversion needed to compare).
const MEASURE_UNITS: MeasurementUnit[] = ['cm', 'in', 'mm', 'ft', 'leaves', 'stems', 'flowers', 'pups']

// Timeline item — care logs + analyses merged by date
type TimelineItem =
  | { kind: 'care';     id: string; date: string; data: CareLog }
  | { kind: 'analysis'; id: string; date: string; data: AnalysisResult }

export default function PlantDetailPage() {
  const params   = useParams<{ id: string }>()
  const id       = params.id
  const router   = useRouter()
  const supabase = createClient()

  // ── Core state ────────────────────────────────────────────────────────
  const [plant,          setPlant]          = useState<Plant | null>(null)
  const [photos,         setPhotos]         = useState<PlantPhoto[]>([])
  const [careLogs,       setCareLogs]       = useState<CareLog[]>([])
  const [lastWateredLog, setLastWateredLog] = useState<CareLog | null>(null)
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null)
  const [allAnalyses,    setAllAnalyses]    = useState<AnalysisResult[]>([])
  const [speciesProfile, setSpeciesProfile] = useState<SpeciesProfile | null>(null)
  const [relatedPlants,  setRelatedPlants]  = useState<Array<{ id: string; nickname: string }>>([])
  const [loading,        setLoading]        = useState(true)

  // ── UI state ──────────────────────────────────────────────────────────
  const [uploading,       setUploading]     = useState(false)
  const [loggingCare,     setLoggingCare]   = useState(false)
  const [showNoteInput,   setShowNoteInput] = useState(false)
  const [noteText,        setNoteText]      = useState('')
  const [showMore,        setShowMore]      = useState(false)
  const [analyzing,       setAnalyzing]     = useState(false)
  const [analyzeGated,    setAnalyzeGated]  = useState(false)
  const [fetchingSpecies, setFetchingSpecies] = useState(false)
  const [savingReminder,      setSavingReminder]      = useState(false)
  const [savingFertilizing,   setSavingFertilizing]   = useState(false)
  const [compareMode,         setCompareMode]         = useState(false)
  const [selectedForCompare,  setSelectedForCompare]  = useState<Set<string>>(new Set())
  const [speciesOpen,       setSpeciesOpen]       = useState(false)
  const [timelineFilter,    setTimelineFilter]    = useState<'all' | 'care' | 'notes' | 'analysis'>('all')
  const [totalCareLogs,     setTotalCareLogs]     = useState(0)
  const [loadingMoreLogs,   setLoadingMoreLogs]   = useState(false)
  const [showMeasureInput,  setShowMeasureInput]  = useState(false)
  const [editing,           setEditing]           = useState(false)
  const [saving,          setSaving]        = useState(false)
  const [deleting,        setDeleting]      = useState(false)
  const [error,           setError]         = useState<string | null>(null)

  // ── Edit form state ───────────────────────────────────────────────────
  const [nickname,         setNickname]         = useState('')
  const [editSpecies,      setEditSpecies]      = useState('')
  const [location,         setLocation]         = useState('')
  const [potSize,          setPotSize]          = useState('')
  const [soilType,         setSoilType]         = useState('')
  const [acquiredDate,     setAcquiredDate]     = useState('')
  const [lastRepottedDate, setLastRepottedDate] = useState('')
  const [notesField,       setNotesField]       = useState('')
  const [tagsField,        setTagsField]        = useState<string[]>([])
  const [pestNotesField,   setPestNotesField]   = useState('')
  const [lastTreatmentDate, setLastTreatmentDate] = useState('')

  // ── Diary note state ──────────────────────────────────────────────────
  const [noteCategory,     setNoteCategory]     = useState<NoteCategory | null>(null)
  const [downloadingZip,   setDownloadingZip]   = useState(false)
  const [lightboxIndex,    setLightboxIndex]    = useState<number | null>(null)

  // ── Measurement state ─────────────────────────────────────────────────
  const [measureValue,     setMeasureValue]     = useState('')
  const [measureUnit,      setMeasureUnit]      = useState<MeasurementUnit>('cm')
  const [measureNote,      setMeasureNote]      = useState('')

  // ── Toast state ───────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const fileInputRef  = useRef<HTMLInputElement>(null)
  const heroScrollRef = useRef<HTMLDivElement>(null)
  const [heroIndex, setHeroIndex] = useState(0)

  function handleHeroScroll() {
    const el = heroScrollRef.current
    if (!el) return
    setHeroIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const species = plant?.species || latestAnalysis?.species
    if (!species) return
    fetchSpeciesProfileFromDB(species)
    // Fetch other plants of the same species owned by this user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('plants').select('id, nickname').eq('user_id', user.id).eq('species', species).neq('id', id)
        .then(({ data }) => { if (data) setRelatedPlants(data) })
    })
  }, [plant?.species, latestAnalysis?.species]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill edit form species from AI analysis when the plant has no manual species set.
  useEffect(() => {
    if (!editSpecies && latestAnalysis?.species) setEditSpecies(latestAnalysis.species)
  }, [latestAnalysis?.species]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close "More" dock panel when clicking outside.
  useEffect(() => {
    function close() { setShowMore(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([fetchPlant(), fetchPhotos(), fetchCareLogs(), fetchLastWatered(), fetchAnalyses()])
    setLoading(false)
  }

  // ── Fetchers ──────────────────────────────────────────────────────────
  async function fetchPlant() {
    const { data, error } = await supabase.from('plants').select('*').eq('id', id).single()
    if (error || !data) { router.push('/'); return }
    setPlant(data)
    setNickname(data.nickname)
    setEditSpecies(data.species ?? '')
    setLocation(data.location ?? '')
    setPotSize(data.pot_size ?? '')
    setSoilType(data.soil_type ?? '')
    setAcquiredDate(data.acquired_date ?? '')
    setLastRepottedDate(data.last_repotted_date ?? '')
    setNotesField(data.notes ?? '')
    setTagsField(data.tags ?? [])
    setPestNotesField(data.pest_notes ?? '')
    setLastTreatmentDate(data.last_treatment_date ?? '')
  }

  async function fetchPhotos() {
    const { data } = await supabase.from('photos').select('*').eq('plant_id', id).order('created_at', { ascending: false })
    if (data) setPhotos(data)
  }

  async function fetchCareLogs() {
    const { data, count } = await supabase
      .from('care_logs')
      .select('*', { count: 'exact' })
      .eq('plant_id', id)
      .order('logged_at', { ascending: false })
      .range(0, 19)
    if (data) setCareLogs(data)
    setTotalCareLogs(count ?? 0)
  }

  async function loadMoreCareLogs() {
    setLoadingMoreLogs(true)
    const start = careLogs.length
    const { data } = await supabase
      .from('care_logs')
      .select('*')
      .eq('plant_id', id)
      .order('logged_at', { ascending: false })
      .range(start, start + 19)
    if (data) setCareLogs(prev => [...prev, ...data])
    setLoadingMoreLogs(false)
  }

  async function fetchLastWatered() {
    const { data } = await supabase.from('care_logs').select('*').eq('plant_id', id).eq('type', 'watered').order('logged_at', { ascending: false }).limit(1)
    setLastWateredLog(data?.[0] ?? null)
  }

  async function fetchAnalyses() {
    const { data } = await supabase.from('analysis_results').select('*').eq('plant_id', id).order('created_at', { ascending: false })
    if (data && data.length > 0) {
      setLatestAnalysis(data[0])
      setAllAnalyses(data)
    } else {
      setLatestAnalysis(null)
      setAllAnalyses([])
    }
  }

  async function fetchSpeciesProfileFromDB(speciesName: string) {
    const { data } = await supabase.from('species_profiles').select('*').eq('species_name', speciesName).single()
    if (data) setSpeciesProfile(data)
  }

  // ── Photo upload ──────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadPhoto(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadPhoto(file: File) {
    setUploading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ext = file.type === 'image/webp' ? 'webp'
                : file.type === 'image/png'  ? 'png'
                : file.type === 'image/gif'  ? 'gif'
                : 'jpg'
      const path = `${user!.id}/${id}/${Date.now()}.${ext}`
      const buffer = await file.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('plant-photos').upload(path, buffer, { contentType: file.type })
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('photos').insert({
        plant_id: id, user_id: user!.id, storage_path: path,
      })
      if (dbError) throw dbError

      await fetchPhotos()
      showToast('Photo added')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.')
    } finally {
      setUploading(false)
    }
  }

  // ── Care logging ──────────────────────────────────────────────────────
  async function logCare(
    type: CareType,
    customNote?: string | null,
    extras?: {
      category?: NoteCategory | null
      measurement_value?: number | null
      measurement_unit?: MeasurementUnit | null
    }
  ) {
    setLoggingCare(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('care_logs').insert({
        plant_id: id,
        user_id: user!.id,
        type,
        notes: customNote ?? null,
        category:          extras?.category          ?? null,
        measurement_value: extras?.measurement_value ?? null,
        measurement_unit:  extras?.measurement_unit  ?? null,
      })
      if (error) throw error

      const label = type === 'note' ? 'Note saved' : CARE_LOG_LABELS[type]
      showToast(label)
      if (type === 'watered') { await fetchLastWatered(); router.refresh() }
      await fetchCareLogs()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save care log.')
    } finally {
      setLoggingCare(false)
    }
  }

  async function handleNoteSubmit() {
    if (!noteText.trim()) return
    await logCare('note', noteText.trim(), { category: noteCategory ?? 'general' })
    setNoteText('')
    setNoteCategory(null)
    setShowNoteInput(false)
  }

  // ── Reminder ──────────────────────────────────────────────────────────
  async function setReminder(days: number | null) {
    setSavingReminder(true)
    const { error } = await supabase.from('plants')
      .update({ watering_interval_days: days }).eq('id', id)
    if (!error) {
      setPlant(prev => prev ? { ...prev, watering_interval_days: days } : prev)
    }
    setSavingReminder(false)
  }

  async function setFertilizingReminder(days: number | null) {
    setSavingFertilizing(true)
    const { error } = await supabase.from('plants')
      .update({ fertilizing_interval_days: days }).eq('id', id)
    if (!error) {
      setPlant(prev => prev ? { ...prev, fertilizing_interval_days: days } : prev)
    }
    setSavingFertilizing(false)
  }

  async function handleDeletePhoto(photo: PlantPhoto) {
    const ok = window.confirm('Delete this photo? This cannot be undone.')
    if (!ok) return
    // Remove from storage and DB in parallel
    await Promise.all([
      supabase.storage.from('plant-photos').remove([photo.storage_path]),
      supabase.from('photos').delete().eq('id', photo.id),
    ])
    await fetchPhotos()
    showToast('Photo deleted')
  }

  async function handleDeleteCareLog(logId: string) {
    const ok = window.confirm('Delete this log entry? This cannot be undone.')
    if (!ok) return
    const { error } = await supabase.from('care_logs').delete().eq('id', logId)
    if (error) { setError('Failed to delete log entry.'); return }
    showToast('Entry deleted')
    await fetchCareLogs()
  }

  async function handleEditNoteLog(logId: string, newText: string) {
    const { error } = await supabase.from('care_logs').update({ notes: newText.trim() || null }).eq('id', logId)
    if (error) { setError('Failed to update note.'); return }
    showToast('Note updated')
    setCareLogs(prev => prev.map(l => l.id === logId ? { ...l, notes: newText.trim() || null } : l))
  }

  async function downloadAllPhotos() {
    if (photos.length === 0 || !plant) return
    setDownloadingZip(true)
    try {
      const zip = new JSZip()
      await Promise.all(photos.map(async (photo, i) => {
        const url = getPhotoUrl(photo)
        const ext = photo.storage_path.split('.').pop() ?? 'jpg'
        const filename = `${String(i + 1).padStart(2, '0')}-${formatTimestamp(photo.created_at).replace(/[^a-z0-9]/gi, '-')}.${ext}`
        const res = await fetch(url)
        const buf = await res.arrayBuffer()
        zip.file(filename, buf)
      }))
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${plant.nickname.replace(/[^a-z0-9]/gi, '-')}-photos.zip`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(`Downloaded ${photos.length} photos`)
    } catch {
      setError('Photo export failed. Please try again.')
    } finally {
      setDownloadingZip(false)
    }
  }

  async function downloadPhoto(photo: PlantPhoto) {
    try {
      const url = getPhotoUrl(photo)
      const ext = photo.storage_path.split('.').pop() ?? 'jpg'
      const filename = `${plant?.nickname ?? 'plant'}-${formatTimestamp(photo.created_at).replace(/[^a-z0-9]/gi, '-')}.${ext}`
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      setError('Failed to download photo.')
    }
  }

  function toggleCompareSelect(photoId: string) {
    setSelectedForCompare(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) next.delete(photoId)
      else if (next.size < 2) next.add(photoId)
      return next
    })
  }

  // ── AI Analysis ───────────────────────────────────────────────────────
  async function handleAnalyze(targetPhoto?: PlantPhoto) {
    if (photos.length === 0) {
      setError('Add a photo of your plant first, then run analysis.')
      return
    }
    setAnalyzing(true)
    setError(null)
    try {
      const latestPhoto = targetPhoto ?? photos[0]
      const imageUrl = supabase.storage.from('plant-photos').getPublicUrl(latestPhoto.storage_path).data.publicUrl

      const previousAnalyses = allAnalyses.slice(0, 3).map(r => ({
        date:         new Date(r.created_at).toLocaleDateString(),
        species:      r.species,
        health:       r.health,
        health_score: r.health_score,   // Gap 5 — trend data
        care:         r.care,            // Gap 3 — prior recommendations
      }))
      const recentCareLogs = careLogs.slice(0, 10).map(l => ({
        type: l.type,
        notes: l.notes,
        date: new Date(l.logged_at).toLocaleDateString(),
        category:          l.category,            // Gap 4
        measurement_value: l.measurement_value,   // Gap 6
        measurement_unit:  l.measurement_unit,    // Gap 6
      }))

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const now = new Date()
      const hasPlantContext =
        plant?.location || plant?.pot_size || plant?.soil_type ||
        plant?.notes || plant?.pest_notes || plant?.last_treatment_date

      const { data, error: fnError } = await supabase.functions.invoke('analyze-plant', {
        body: {
          imageUrl, previousAnalyses, recentCareLogs,
          speciesProfile: speciesProfile ?? null,  // whole row — now carries pruning_tips, disease_symptoms, seasonal_care
          plantContext: hasPlantContext ? {
            location:            plant?.location            ?? null,
            pot_size:            plant?.pot_size            ?? null,
            soil_type:           plant?.soil_type           ?? null,
            plant_notes:         plant?.notes               ?? null,   // Gap 2
            pest_notes:          plant?.pest_notes          ?? null,   // Gap 2
            last_treatment_date: plant?.last_treatment_date ?? null,   // Gap 2
          } : null,
          seasonContext: { month: now.getMonth() + 1, hemisphere: 'northern' },
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (fnError) throw new Error(fnError.message || 'Analysis failed')
      if (data?.error) throw new Error(data.error)
      if (!data?.result) throw new Error('Unexpected response from analysis service.')

      const result = data.result
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('analysis_results').insert({
        plant_id: id, user_id: user!.id, photo_id: latestPhoto.id,
        species: result.species, health: result.health,
        health_score: typeof result.health_score === 'number' ? result.health_score : null,
        care: result.care,
      })

      if (result.species && !speciesProfile) fetchSpeciesProfileFromAI(result.species)
      await fetchAnalyses()
      showToast('Analysis complete')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Confirmation gate: require a window.confirm before spending an AI credit,
  // and block rapid double-taps with a 3s cooldown after each click.
  function handleAnalyzeClick(targetPhoto?: PlantPhoto) {
    if (analyzeGated || analyzing) return
    const ok = window.confirm('This will use an AI credit. Continue?')
    if (!ok) return
    setAnalyzeGated(true)
    setTimeout(() => setAnalyzeGated(false), 3000)
    void handleAnalyze(targetPhoto)
  }

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

  // ── Edit & delete ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!nickname.trim()) { setError('Nickname cannot be empty.'); return }
    setSaving(true)
    setError(null)

    const newSpecies       = editSpecies.trim() || null
    const speciesChanged   = newSpecies !== (plant?.species ?? null)

    const { error } = await supabase.from('plants').update({
      nickname: nickname.trim(),
      species: newSpecies,
      location: location.trim() || null,
      pot_size: potSize.trim() || null,
      soil_type: soilType.trim() || null,
      acquired_date: acquiredDate || null,
      last_repotted_date: lastRepottedDate || null,
      notes: notesField.trim() || null,
      tags: tagsField,
      pest_notes: pestNotesField.trim() || null,
      last_treatment_date: lastTreatmentDate || null,
    }).eq('id', id)

    if (error) {
      setError('Could not save changes.')
    } else {
      setEditing(false)
      // When the user manually changes the species name, clear the cached
      // species profile so it will be re-fetched for the corrected name.
      if (speciesChanged) setSpeciesProfile(null)
      await fetchPlant()
    }
    setSaving(false)
  }

  async function handleDelete() {
    const ok = window.confirm(
      `Delete ${plant?.nickname}? This will remove all photos, care logs, and analysis history. This cannot be undone.`
    )
    if (!ok) return
    setDeleting(true)

    // Remove storage files before deleting the plant row (cascade removes the photos
    // table rows but leaves the actual files in Supabase Storage as orphans).
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: files } = await supabase.storage
        .from('plant-photos')
        .list(`${user.id}/${id}`)
      if (files && files.length > 0) {
        const paths = files.map(f => `${user.id}/${id}/${f.name}`)
        await supabase.storage.from('plant-photos').remove(paths)
      }
    }

    await supabase.from('plants').delete().eq('id', id)
    router.push('/plants')
  }

  function buildTimeline(): TimelineItem[] {
    const items: TimelineItem[] = [
      ...careLogs.map(l => ({ kind: 'care' as const, id: l.id, date: l.logged_at, data: l })),
      ...allAnalyses.map(a => ({ kind: 'analysis' as const, id: a.id, date: a.created_at, data: a })),
    ]
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  function getPhotoUrl(photo: PlantPhoto): string {
    return supabase.storage.from('plant-photos').getPublicUrl(photo.storage_path).data.publicUrl
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="pb-40 animate-pulse">
        {/* Hero skeleton */}
        <div className="w-full h-[360px] bg-paper-alt" />
        {/* Status strip */}
        <div className="mx-5 mt-4 rounded-brand-lg border border-rule bg-paper-alt h-[70px]" />
        {/* Section label + card */}
        <div className="mx-5 mt-5 h-4 w-24 rounded bg-paper-alt" />
        <div className="mx-5 mt-2 rounded-brand-lg border border-rule bg-paper-alt h-[130px]" />
        <div className="mx-5 mt-5 h-4 w-24 rounded bg-paper-alt" />
        <div className="mx-5 mt-2 rounded-brand-lg border border-rule bg-paper-alt h-[100px]" />
      </div>
    )
  }

  if (!plant) return null

  const knownSpecies = plant.species || latestAnalysis?.species
  const speciesFromAI = !plant.species && !!latestAnalysis?.species
  const lastWatered    = lastWateredLog
  const lastFertilized = careLogs.find(l => l.type === 'fertilized')

  const daysSinceWatered = lastWatered
    ? Math.floor((Date.now() - new Date(lastWatered.logged_at).getTime()) / 86_400_000)
    : null
  const daysSinceFertilized = lastFertilized
    ? Math.floor((Date.now() - new Date(lastFertilized.logged_at).getTime()) / 86_400_000)
    : null

  const timeline = buildTimeline()
  const logsThisMonth = careLogs.filter(l => (Date.now() - new Date(l.logged_at).getTime()) < 30 * 86_400_000).length
  const totalCareEvents = careLogs.filter(l => l.type !== 'note').length
  const plantStreak = computeStreak(careLogs.map(l => l.logged_at))
  // Average days between watering logs (if ≥2 watered entries exist)
  const wateredLogs = careLogs.filter(l => l.type === 'watered').slice().reverse()
  const avgWateringDays = wateredLogs.length >= 2
    ? Math.round(wateredLogs.slice(1).reduce((sum, l, i) => {
        const diff = (new Date(l.logged_at).getTime() - new Date(wateredLogs[i].logged_at).getTime()) / 86_400_000
        return sum + diff
      }, 0) / (wateredLogs.length - 1))
    : null
  const lastMeasurementLog = careLogs.find(l => l.type === 'measured')
  // Most active calendar month: month name with the highest care log count.
  const mostActiveMonth = (() => {
    if (careLogs.length < 5) return null
    const counts = new Map<string, number>()
    for (const l of careLogs) {
      const d = new Date(l.logged_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    let best: string | null = null; let bestCount = 0
    counts.forEach((count, key) => { if (count > bestCount) { bestCount = count; best = key } })
    if (!best || bestCount < 3) return null
    const [yr, mo] = (best as string).split('-').map(Number)
    const label = new Date(yr, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    return { label, count: bestCount }
  })()
  // Measurement logs with parseable numeric values (e.g. "42cm", "18in") — ascending by date.
  const measurementPoints = careLogs
    .filter(l => l.type === 'measured' && l.notes)
    .map(l => ({ date: l.logged_at, value: parseFloat(l.notes!.match(/[\d.]+/)?.[0] ?? ''), label: l.notes! }))
    .filter(p => !isNaN(p.value))
    .reverse()

  const wateringStatus: 'overdue' | 'due-soon' | 'good' | 'unset' =
    !plant.watering_interval_days ? 'unset'
    : daysSinceWatered === null ? 'overdue'
    : daysSinceWatered > plant.watering_interval_days ? 'overdue'
    : daysSinceWatered >= plant.watering_interval_days - 1 ? 'due-soon'
    : 'good'

  const fertilizingStatus: 'overdue' | 'due-soon' | 'good' | 'unset' =
    !plant.fertilizing_interval_days ? 'unset'
    : daysSinceFertilized === null ? 'overdue'
    : daysSinceFertilized > plant.fertilizing_interval_days ? 'overdue'
    : daysSinceFertilized >= plant.fertilizing_interval_days - 1 ? 'due-soon'
    : 'good'

  // Repotting reminder: flag if last repotted > 12 months ago.
  const daysSinceRepot = plant.last_repotted_date
    ? Math.floor((Date.now() - new Date(`${plant.last_repotted_date}T12:00:00`).getTime()) / 86_400_000)
    : null
  const dueForRepot = daysSinceRepot !== null && daysSinceRepot > 365

  const daysSinceAnalysis = latestAnalysis
    ? Math.floor((Date.now() - new Date(latestAnalysis.created_at).getTime()) / 86_400_000)
    : null
  const analysisStale = daysSinceAnalysis !== null && daysSinceAnalysis > 14

  // Health scores from all analyses, most recent last (for sparkline).
  const healthScores = allAnalyses
    .filter(a => a.health_score !== null)
    .map(a => a.health_score as number)
    .reverse()
  // Health trend: compare last two scores
  const healthTrend: 'improving' | 'declining' | 'stable' | null = healthScores.length >= 2
    ? healthScores[healthScores.length - 1] > healthScores[healthScores.length - 2] ? 'improving'
    : healthScores[healthScores.length - 1] < healthScores[healthScores.length - 2] ? 'declining'
    : 'stable'
    : null

  // Which primary care actions were already logged today.
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const doneToday = new Set(
    careLogs
      .filter(l => { const d = new Date(l.logged_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === todayStr })
      .map(l => l.type)
  )

  // Winter banner: northern hemisphere Nov–Feb with a watering interval set.
  const currentMonth = new Date().getMonth() + 1
  const isWinterNorth = [11, 12, 1, 2].includes(currentMonth)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="pb-40 relative">

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="relative w-full h-[360px] bg-black">
        {/* Scroll-snap photo carousel */}
        {photos.length > 0 ? (
          <div
            ref={heroScrollRef}
            onScroll={handleHeroScroll}
            className="absolute inset-0 flex overflow-x-auto"
            style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            {photos.map(photo => (
              <div key={photo.id} className="shrink-0 w-full h-full" style={{ scrollSnapAlign: 'start' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getPhotoUrl(photo)} alt={plant.nickname} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0">
            <PlantPhotoPlaceholder name={plant.id} label={plant.nickname} showLabel={false} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex flex-col items-center gap-2 p-5 rounded-brand-lg backdrop-blur disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <Icon name="camera" size={28} stroke={1.7} className="text-paper" />
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-paper/80">Add your first photo</span>
              </button>
            </div>
          </div>
        )}

        {/* Top chrome: back, share, camera, more */}
        <div className="absolute top-0 left-0 right-0 pt-10 px-4 flex justify-between items-center">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur"
            style={{ background: 'rgba(255,255,255,0.9)' }}
          >
            <Icon name="back" size={18} stroke={1.9} className="text-ink" />
          </button>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  showToast('Link copied')
                } catch {
                  showToast('Copy failed')
                }
              }}
              aria-label="Copy link"
              className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur"
              style={{ background: 'rgba(255,255,255,0.9)' }}
            >
              <Icon name="arrow-up" size={18} stroke={1.9} className="text-ink" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Add photo"
              className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.9)' }}
            >
              <Icon name="camera" size={18} stroke={1.9} className="text-ink" />
            </button>
            <button
              onClick={() => setEditing(v => !v)}
              aria-label={editing ? 'Close edit' : 'Edit'}
              className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur"
              style={{ background: 'rgba(255,255,255,0.9)' }}
            >
              <Icon name={editing ? 'close' : 'dots'} size={18} stroke={1.9} className="text-ink" />
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Gradient + caption */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}
        />
        <div className="absolute bottom-4 left-5 right-5 text-white">
          <div className="font-mono text-[10px] tracking-[0.18em] uppercase opacity-75 mb-1">
            Plate № {String(plant.id).slice(0, 3).toUpperCase()}
            {plant.location && ` · ${plant.location}`}
            {plant.acquired_date && (() => {
              const months = Math.floor((Date.now() - new Date(`${plant.acquired_date}T12:00:00`).getTime()) / (86_400_000 * 30.44))
              return months > 0 ? ` · ${months}mo` : null
            })()}
            {careLogs.length > 0 && ` · ${relativeTime(careLogs[0].logged_at)}`}
          </div>
          <div className="font-serif italic leading-none tracking-[-0.02em]" style={{ fontSize: 40 }}>
            {plant.nickname}
          </div>
          {knownSpecies && (
            <button
              className="mt-1 flex items-start gap-1.5 text-left flex-col"
              onClick={() => { navigator.clipboard.writeText(knownSpecies).then(() => showToast('Species name copied')).catch(() => {}) }}
              aria-label="Copy species name"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] opacity-90">{knownSpecies}</span>
                {speciesFromAI && (
                  <span className="font-mono text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)' }}>
                    AI ID
                  </span>
                )}
              </div>
              {speciesProfile?.scientific_name && speciesProfile.scientific_name !== knownSpecies && (
                <span className="font-mono text-[10px] tracking-[0.04em] italic" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {speciesProfile.scientific_name}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Dot indicators (2–4 photos) or numeric counter (5+ photos) */}
        {photos.length > 1 && (
          <div className="absolute bottom-[72px] left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {photos.length <= 4 ? (
              photos.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: i === heroIndex ? 16 : 6,
                    height: 6,
                    background: i === heroIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                  }}
                />
              ))
            ) : (
              <div
                className="font-mono text-[10px] tracking-[0.1em] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.9)' }}
              >
                {heroIndex + 1} / {photos.length}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && (
        <div className="mx-5 mt-3 flex items-start justify-between px-3 py-2 bg-danger-soft border border-rule rounded-brand text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="ml-2 text-danger/70">
            <Icon name="close" size={14} stroke={2} />
          </button>
        </div>
      )}

      {/* ── Status strip ──────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 bg-paper-alt border-b border-rule grid grid-cols-2 gap-x-4 gap-y-3.5">
        <StatusStat
          label="Watered"
          value={daysSinceWatered === null ? '—' : `${daysSinceWatered}d`}
          sub={
            wateringStatus === 'overdue' && daysSinceWatered !== null && plant.watering_interval_days
              ? `${daysSinceWatered - plant.watering_interval_days}d overdue`
              : plant.watering_interval_days ? `every ${plant.watering_interval_days}d` : 'no schedule'
          }
          tone={wateringStatus}
        />
        <StatusStat
          label="Fed"
          value={daysSinceFertilized === null ? '—' : `${daysSinceFertilized}d`}
          sub={
            fertilizingStatus === 'overdue' && daysSinceFertilized !== null && plant.fertilizing_interval_days
              ? `${daysSinceFertilized - plant.fertilizing_interval_days}d overdue`
              : plant.fertilizing_interval_days ? `every ${plant.fertilizing_interval_days}d` : 'no schedule'
          }
          tone={fertilizingStatus}
        />
        <StatusStat
          label="Care total"
          value={String(totalCareEvents)}
          sub={logsThisMonth > 0 ? `${logsThisMonth} this month` : totalCareEvents === 0 ? 'start logging' : '0 this month'}
          tone={totalCareEvents > 10 ? 'good' : totalCareEvents > 0 ? 'due-soon' : 'unset'}
        />
        <StatusStat
          label="Streak"
          value={plantStreak > 0 ? `${plantStreak}d` : '—'}
          sub={plantStreak > 0 ? 'consecutive' : 'no streak yet'}
          tone={plantStreak >= 7 ? 'good' : plantStreak > 0 ? 'due-soon' : 'unset'}
        />
      </div>

      {/* ── Done today strip ─────────────────────────────────────────── */}
      {doneToday.size > 0 && (
        <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 bg-accent-soft border border-rule rounded-brand">
          <Icon name="check" size={13} stroke={2.2} className="text-accent shrink-0" />
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-accent">
            Today · {Array.from(doneToday).map(t => CARE_LOG_LABELS[t] || t).join(' · ')}
          </span>
        </div>
      )}

      {/* ── Repotting nudge ──────────────────────────────────────────── */}
      {dueForRepot && (
        <div className="mx-5 mt-3 flex items-start gap-2.5 px-3.5 py-3 bg-paper-alt border border-rule rounded-brand text-[12px] text-ink-soft">
          <Icon name="pot" size={14} stroke={1.9} className="mt-0.5 shrink-0 text-ink-muted" />
          <span>It&rsquo;s been over a year since the last repot — consider checking the roots.</span>
        </div>
      )}

      {/* ── Winter care banner ────────────────────────────────────────── */}
      {isWinterNorth && plant.watering_interval_days && (
        <div className="mx-5 mt-3 flex items-start gap-2.5 px-3.5 py-3 bg-warn-soft border border-rule rounded-brand text-[12px] text-warn">
          <Icon name="thermometer" size={14} stroke={1.9} className="mt-0.5 shrink-0" />
          <span>Winter mode — reduce watering frequency and hold off on fertilizing until spring.</span>
        </div>
      )}

      {/* ── Edit form (collapsible) ───────────────────────────────────── */}
      {editing && (
        <EditForm
          nickname={nickname}          setNickname={setNickname}
          editSpecies={editSpecies}    setEditSpecies={setEditSpecies}
          location={location}          setLocation={setLocation}
          potSize={potSize}            setPotSize={setPotSize}
          soilType={soilType}          setSoilType={setSoilType}
          acquiredDate={acquiredDate}  setAcquiredDate={setAcquiredDate}
          lastRepottedDate={lastRepottedDate} setLastRepottedDate={setLastRepottedDate}
          notes={notesField}           setNotes={setNotesField}
          tags={tagsField}             setTags={setTagsField}
          pestNotes={pestNotesField}   setPestNotes={setPestNotesField}
          lastTreatmentDate={lastTreatmentDate} setLastTreatmentDate={setLastTreatmentDate}
          onSave={handleSave}          saving={saving}
          onDelete={handleDelete}      deleting={deleting}
        />
      )}

      {/* ── AI diagnosis card ─────────────────────────────────────────── */}
      <div className="px-5 pt-5">
        <div className="flex items-baseline justify-between pb-3.5">
          <div className="font-mono text-[10px] text-ink-muted tracking-[0.14em] uppercase flex items-center gap-2">
            § 01 · AI Diagnosis{allAnalyses.length > 0 ? ` — ${allAnalyses.length}` : ''}
            {daysSinceAnalysis !== null && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                analysisStale ? 'bg-warn-soft text-warn' : 'bg-paper-alt text-ink-muted'
              }`}>
                {daysSinceAnalysis === 0 ? 'today' : daysSinceAnalysis === 1 ? '1d ago' : `${daysSinceAnalysis}d ago`}
              </span>
            )}
          </div>
          <button
            onClick={() => handleAnalyzeClick()}
            disabled={analyzing || analyzeGated || photos.length === 0}
            className={`text-[11px] font-medium inline-flex items-center gap-1 disabled:opacity-40 ${
              analysisStale ? 'text-warn' : 'text-accent'
            }`}
          >
            <Icon name="camera" size={12} stroke={1.9} />
            {analyzing ? 'Analyzing…' : latestAnalysis ? 'Re-analyze' : 'Analyze'}
          </button>
        </div>

        {!latestAnalysis ? (
          <div className="bg-card rounded-brand-lg border border-rule p-5 text-center">
            <Icon name="sparkle" size={22} stroke={1.8} className="text-accent mx-auto" />
            <div className="font-serif italic text-[17px] text-ink mt-3 leading-snug">
              {photos.length === 0 ? 'Snap a photo to unlock AI diagnosis.' : 'Run the first analysis to get a diagnosis.'}
            </div>
            <p className="text-xs text-ink-soft mt-2">
              Claude will spot early signs of stress and suggest next steps.
            </p>
            {photos.length === 0 ? (
              <HairlineButton icon="camera" onClick={() => fileInputRef.current?.click()} variant="outline" fullWidth={false}>
                Add a photo
              </HairlineButton>
            ) : (
              <HairlineButton icon="sparkle" onClick={() => handleAnalyzeClick()} fullWidth={false}>
                Analyze plant
              </HairlineButton>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-brand-lg border border-rule overflow-hidden">
            {latestAnalysis.health && (
              <div className="px-4 py-3.5 border-b border-rule">
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5">
                    <Icon name="sparkle" size={14} stroke={1.9} className="text-accent" />
                    <span className="text-[11px] text-accent font-semibold uppercase tracking-[0.1em]">
                      Verdict
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {healthScores.length >= 2 && (
                      <span className="text-ink-muted">
                        <Sparkline scores={healthScores} />
                      </span>
                    )}
                    {healthScores.length >= 2 && (() => {
                      const delta = healthScores[healthScores.length - 1] - healthScores[healthScores.length - 2]
                      if (delta === 0) return null
                      return (
                        <span className={`font-mono text-[11px] font-bold ${delta > 0 ? 'text-accent' : 'text-danger'}`}>
                          {delta > 0 ? '↑' : '↓'}
                        </span>
                      )
                    })()}
                    {latestAnalysis.health_score !== null && (
                      <span className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        latestAnalysis.health_score >= 4 ? 'bg-accent-soft text-accent'
                        : latestAnalysis.health_score >= 3 ? 'bg-warn-soft text-warn'
                        : 'bg-danger-soft text-danger'
                      }`}>
                        {latestAnalysis.health_score}/5
                      </span>
                    )}
                    {healthTrend && (
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded tracking-[0.06em] ${
                        healthTrend === 'improving' ? 'bg-accent-soft text-accent'
                        : healthTrend === 'declining' ? 'bg-danger-soft text-danger'
                        : 'bg-paper-alt text-ink-muted'
                      }`}>
                        {healthTrend === 'improving' ? '↑ improving' : healthTrend === 'declining' ? '↓ declining' : '→ stable'}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="font-serif italic text-[18px] text-ink leading-snug tracking-[-0.01em]"
                  style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}
                >
                  &ldquo;{latestAnalysis.health}&rdquo;
                </div>
              </div>
            )}

            {latestAnalysis.care && (
              <div className="px-4 py-3 border-b border-rule">
                <div className="text-[11px] text-ink-soft font-semibold uppercase tracking-[0.1em] mb-1.5">
                  Care tips
                </div>
                <CareList text={latestAnalysis.care} />
              </div>
            )}

            {analysisStale && (
              <div className="px-4 py-2.5 border-b border-rule flex items-center gap-2">
                <Icon name="clock" size={12} stroke={2} className="text-warn shrink-0" />
                <span className="text-[11px] text-warn">
                  Analysis is {daysSinceAnalysis}d old — consider re-analyzing for fresh insight.
                </span>
              </div>
            )}

            <div className="p-3 flex gap-2">
              <button
                onClick={() => logCare('watered')}
                disabled={loggingCare}
                className="flex-1 py-3 rounded-full bg-accent text-paper text-[13px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="check" size={14} stroke={2.2} className="text-paper" />
                Mark watered
              </button>
              <button
                onClick={() => setShowNoteInput(v => !v)}
                className="px-4 py-3 rounded-full border border-rule bg-transparent text-ink text-[13px] font-medium inline-flex items-center gap-1.5"
              >
                <Icon name="edit" size={14} stroke={1.9} />
                Add note
              </button>
            </div>
          </div>
        )}

        {showNoteInput && (
          <div className="mt-3 bg-card border border-rule rounded-brand-lg p-4">
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-2.5">
              Observation
            </div>
            {/* Structured note categories (Gap 4) */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {NOTE_CATEGORIES.map(c => (
                <button
                  key={c.key}
                  onClick={() => setNoteCategory(prev => prev === c.key ? null : c.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors inline-flex items-center gap-1 ${
                    noteCategory === c.key
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-transparent text-ink-soft border-rule'
                  }`}
                >
                  <Icon name={c.icon} size={11} stroke={1.9} />
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="What did you notice? How does it look?"
              autoFocus
              rows={3}
              className="w-full px-3 py-2.5 border border-rule rounded-brand text-[13px] bg-paper text-ink resize-none"
            />
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => { setShowNoteInput(false); setNoteText(''); setNoteCategory(null) }}
                className="flex-1 py-2 rounded-full border border-rule text-ink-soft text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleNoteSubmit}
                disabled={!noteText.trim()}
                className="flex-1 py-2 bg-ink text-paper rounded-full text-[13px] font-medium disabled:opacity-50"
              >
                Save entry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Measure input (Gap 6 — structured numeric + unit) ─────────── */}
      {showMeasureInput && (
        <div className="mx-5 mt-3 bg-card border border-rule rounded-brand-lg p-4">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-2">
            Record measurement
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={measureValue}
              onChange={e => setMeasureValue(e.target.value)}
              placeholder="42"
              autoFocus
              className="w-24 px-3 py-2.5 border border-rule rounded-brand text-[13px] bg-paper text-ink tabular-nums"
            />
            <div className="flex flex-wrap gap-1.5">
              {MEASURE_UNITS.map(u => (
                <button
                  key={u}
                  onClick={() => setMeasureUnit(u)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    measureUnit === u
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-transparent text-ink-soft border-rule'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={measureNote}
            onChange={e => setMeasureNote(e.target.value)}
            placeholder="Optional — what did you measure? (e.g. tallest stem)"
            className="w-full px-3 py-2.5 border border-rule rounded-brand text-[13px] bg-paper text-ink"
          />
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => { setShowMeasureInput(false); setMeasureValue(''); setMeasureNote('') }}
              className="flex-1 py-2 rounded-full border border-rule text-ink-soft text-[13px] font-medium"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const v = parseFloat(measureValue)
                if (!Number.isFinite(v)) return
                await logCare('measured', measureNote.trim() || null, {
                  measurement_value: v,
                  measurement_unit:  measureUnit,
                })
                setMeasureValue('')
                setMeasureNote('')
                setShowMeasureInput(false)
              }}
              disabled={!Number.isFinite(parseFloat(measureValue)) || loggingCare}
              className="flex-1 py-2 bg-ink text-paper rounded-full text-[13px] font-medium disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Log book ──────────────────────────────────────────────────── */}
      <SectionLabel
        number="§ 02"
        title={`Log book${careLogs.length > 0 ? ` — ${careLogs.length}` : ''}`}
        action={careLogs.length > 0 ? 'Export CSV' : undefined}
        onAction={() => {
          const header = 'Date,Type,Category,Measurement,Unit,Notes\n'
          const rows = careLogs.map(l => {
            const dt       = new Date(l.logged_at).toLocaleString()
            const notesCsv = (l.notes ?? '').replace(/"/g, '""')
            const meas     = l.measurement_value !== null ? String(l.measurement_value) : ''
            return `"${dt}","${l.type}","${l.category ?? ''}","${meas}","${l.measurement_unit ?? ''}","${notesCsv}"`
          }).join('\n')
          const blob = new Blob([header + rows], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${plant?.nickname ?? 'plant'}-care-log.csv`
          a.click()
          URL.revokeObjectURL(url)
        }}
      />
      <div className="px-5">
        {/* Filter chips */}
        {timeline.length > 0 && (() => {
          const careCount     = timeline.filter(i => i.kind === 'care' && i.data.type !== 'note').length
          const notesCount    = timeline.filter(i => i.kind === 'care' && i.data.type === 'note').length
          const analysisCount = timeline.filter(i => i.kind === 'analysis').length
          const labels: Record<string, string> = {
            all:      `All ${timeline.length}`,
            care:     careCount     > 0 ? `Care ${careCount}`         : 'Care',
            notes:    notesCount    > 0 ? `Notes ${notesCount}`       : 'Notes',
            analysis: analysisCount > 0 ? `Analysis ${analysisCount}` : 'Analysis',
          }
          return (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {(['all', 'care', 'notes', 'analysis'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTimelineFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                    timelineFilter === f
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-transparent text-ink-soft border-rule'
                  }`}
                >
                  {labels[f]}
                </button>
              ))}
            </div>
          )
        })()}

        {(() => {
          const filtered = timeline.filter(item => {
            if (timelineFilter === 'care') return item.kind === 'care' && item.data.type !== 'note'
            if (timelineFilter === 'notes') return item.kind === 'care' && item.data.type === 'note'
            if (timelineFilter === 'analysis') return item.kind === 'analysis'
            return true
          })

          if (filtered.length === 0) return (
            <div className="bg-card border border-rule rounded-brand p-5 text-center">
              <p className="text-sm text-ink-soft">No entries yet.</p>
              <p className="text-xs text-ink-muted mt-1">Tap the dock below to log your first care action.</p>
            </div>
          )

          // Remaining care logs on the server beyond what's already loaded.
          // Analyses are always fully loaded; only care_logs are paginated.
          const remainingOnServer = Math.max(0, totalCareLogs - careLogs.length)

          return (
            <>
              {filtered.map((item, i) => {
                const itemMonth = new Date(item.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                const prevMonth = i > 0 ? new Date(filtered[i - 1].date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null
                const showMonthSep = prevMonth !== null && itemMonth !== prevMonth
                return (
                  <React.Fragment key={item.id}>
                    {showMonthSep && (
                      <div className="flex items-center gap-2 pt-1 pb-0.5">
                        <div className="h-px flex-1 bg-rule" />
                        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-muted">{itemMonth}</span>
                        <div className="h-px flex-1 bg-rule" />
                      </div>
                    )}
                    <HistoryRow
                      item={item}
                      isLast={i === filtered.length - 1 && remainingOnServer === 0}
                      onDelete={item.kind === 'care' ? () => handleDeleteCareLog(item.id) : undefined}
                      onEditNote={item.kind === 'care' && item.data.type === 'note' ? (text) => handleEditNoteLog(item.id, text) : undefined}
                      photoUrl={(() => {
                        if (item.kind !== 'analysis' || !item.data.photo_id) return undefined
                        const p = photos.find(ph => ph.id === item.data.photo_id)
                        return p ? getPhotoUrl(p) : undefined
                      })()}
                    />
                  </React.Fragment>
                )
              })}
              {remainingOnServer > 0 && (
                <button
                  onClick={loadMoreCareLogs}
                  disabled={loadingMoreLogs}
                  className="w-full mt-2 py-2.5 text-[12px] text-accent font-medium font-mono tracking-[0.06em] uppercase disabled:opacity-40"
                >
                  {loadingMoreLogs ? 'Loading…' : `Load more · ${remainingOnServer} remaining`}
                </button>
              )}
            </>
          )
        })()}
      </div>

      {/* ── Dossier ───────────────────────────────────────────────────── */}
      <SectionLabel number="§ 03" title="Dossier" action="Edit" onAction={() => setEditing(true)} />
      <div className="mx-5 px-4 bg-card border border-rule rounded-brand-lg">
        {knownSpecies && <DossierRow
          label="Species"
          value={speciesProfile?.common_names
            ? `${knownSpecies} (${speciesProfile.common_names.split(',')[0].trim()})`
            : knownSpecies}
        />}
        {plant.location && <DossierRow label="Location" value={plant.location} />}
        {plant.pot_size && <DossierRow label="Pot" value={plant.pot_size} />}
        {plant.soil_type && <DossierRow label="Soil" value={plant.soil_type} />}
        {!plant.acquired_date && <DossierRow label="Tracked since" value={formatTimestamp(plant.created_at)} />}
        {plant.acquired_date && (() => {
          const months = Math.floor((Date.now() - new Date(`${plant.acquired_date}T12:00:00`).getTime()) / (86_400_000 * 30.44))
          const durationStr = months >= 12
            ? `${Math.floor(months / 12)}yr${months % 12 > 0 ? ` ${months % 12}mo` : ''}`
            : months >= 1 ? `${months}mo` : null
          return <DossierRow label="Acquired" value={durationStr ? `${formatDate(plant.acquired_date)} · ${durationStr}` : formatDate(plant.acquired_date)} />
        })()}
        {plant.last_repotted_date && (() => {
          const months = daysSinceRepot !== null ? Math.floor(daysSinceRepot / 30.44) : null
          const suffix = months !== null && months >= 1
            ? ` · ${months >= 12 ? `${Math.floor(months / 12)}yr ${months % 12}mo` : `${months}mo`} ago`
            : ''
          return <DossierRow label="Last repotted" value={`${formatDate(plant.last_repotted_date)}${suffix}`} />
        })()}
        {plant.watering_interval_days && <DossierRow label="Water interval" value={`Every ${plant.watering_interval_days} days`} />}
        {plant.fertilizing_interval_days && <DossierRow label="Feed interval" value={`Every ${plant.fertilizing_interval_days} days`} />}
        {careLogs.length > 0 && (() => {
          const firstLog = careLogs[careLogs.length - 1]
          const daysAgo = Math.floor((Date.now() - new Date(firstLog.logged_at).getTime()) / 86_400_000)
          const label = daysAgo >= 365
            ? `${Math.floor(daysAgo / 365)}yr ago`
            : daysAgo >= 30 ? `${Math.floor(daysAgo / 30)}mo ago` : `${daysAgo}d ago`
          return <DossierRow label="First tended" value={`${formatTimestamp(firstLog.logged_at)} · ${label}`} />
        })()}
        {(() => {
          const repotCount = careLogs.filter(l => l.type === 'repotted').length
          return repotCount > 0 ? <DossierRow label="Repotted" value={`${repotCount} time${repotCount === 1 ? '' : 's'}`} /> : null
        })()}
        {lastMeasurementLog?.notes && <DossierRow label="Last measured" value={lastMeasurementLog.notes} />}
        {measurementPoints.length >= 2 && (() => {
          const max = Math.max(...measurementPoints.map(p => p.value))
          return (
            <div className="py-2.5 border-t border-dashed border-rule">
              <div className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted mb-2">Growth over time</div>
              <div className="flex items-end gap-1.5" style={{ height: 40 }}>
                {measurementPoints.map((p, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                    <div
                      className="w-full rounded-sm bg-accent-soft relative"
                      style={{ height: Math.max(4, Math.round((p.value / max) * 36)) }}
                      title={p.label}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-1">
                {measurementPoints.map((p, i) => (
                  <div key={i} className="flex-1 font-mono text-[8px] text-ink-muted text-center truncate">
                    {new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
        {dueForRepot && (
          <div className="flex items-center gap-2 py-2.5 border-t border-dashed border-rule text-warn">
            <Icon name="warning" size={13} stroke={1.9} className="shrink-0" />
            <span className="text-[12px] font-medium">Consider repotting — last done {Math.floor((daysSinceRepot ?? 0) / 30)}mo ago</span>
          </div>
        )}
        {plant.notes && <DossierRow label="Notes" value={plant.notes} />}
        {plant.tags && plant.tags.length > 0 && (
          <div className="flex gap-2 py-2.5 border-t border-dashed border-rule flex-wrap items-start">
            <div className="w-20 shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase text-ink-muted pt-1">Tags</div>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {plant.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-accent-soft text-accent text-[11px] font-mono rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        )}
        {(plant.pest_notes || plant.last_treatment_date) && (
          <div className="border-t border-dashed border-rule">
            {plant.last_treatment_date && <DossierRow label="Last treated" value={formatDate(plant.last_treatment_date)} />}
            {plant.pest_notes && <DossierRow label="Pest notes" value={plant.pest_notes} last />}
          </div>
        )}
        {relatedPlants.length > 0 && (
          <div className="flex items-center gap-2 py-2.5 border-t border-dashed border-rule flex-wrap">
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-muted shrink-0">Also in collection</span>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {relatedPlants.map(p => (
                <Link key={p.id} href={`/plant/${p.id}`} className="px-2 py-0.5 bg-paper-alt text-ink-soft text-[11px] font-serif italic rounded-full border border-rule hover:border-accent transition-colors">
                  {p.nickname}
                </Link>
              ))}
            </div>
          </div>
        )}
        {mostActiveMonth && (
          <DossierRow label="Best month" value={`${mostActiveMonth.label} · ${mostActiveMonth.count} logs`} />
        )}
        {!knownSpecies && !plant.location && !plant.pot_size && !plant.acquired_date && !plant.last_repotted_date && !plant.watering_interval_days && !plant.notes && (!plant.tags || plant.tags.length === 0) && !plant.pest_notes && (
          <p className="py-4 text-sm text-ink-muted italic">Add details from the edit sheet.</p>
        )}
      </div>

      {/* ── Watering schedule chooser ─────────────────────────────────── */}
      {(() => {
        const wateredCount = careLogs.filter(l => l.type === 'watered').length
        const fedCount     = careLogs.filter(l => l.type === 'fertilized').length
        const mistedCount  = careLogs.filter(l => l.type === 'misted').length
        const prunedCount  = careLogs.filter(l => l.type === 'pruned').length
        if (wateredCount === 0 && fedCount === 0 && mistedCount === 0 && prunedCount === 0) return null
        const stats: Array<{ icon: IconName; label: string; count: number }> = ([
          { icon: 'drop'     as IconName, label: 'Watered', count: wateredCount },
          { icon: 'leaf'     as IconName, label: 'Fed',     count: fedCount },
          { icon: 'mist'     as IconName, label: 'Misted',  count: mistedCount },
          { icon: 'scissors' as IconName, label: 'Pruned',  count: prunedCount },
        ] as Array<{ icon: IconName; label: string; count: number }>).filter(s => s.count > 0)
        return (
          <div className="mx-5 mt-4 flex flex-wrap items-center gap-3">
            {stats.map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <Icon name={s.icon} size={12} stroke={1.9} className="text-accent" />
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-muted">
                  {s.label} {s.count}×
                </span>
              </div>
            ))}
            {avgWateringDays !== null && (
              <div className="flex items-center gap-1.5">
                <Icon name="clock" size={12} stroke={1.9} className="text-ink-muted" />
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-muted">
                  avg water {avgWateringDays}d
                </span>
              </div>
            )}
          </div>
        )
      })()}
      <SectionLabel number="§ 04" title="Watering schedule" />
      <div className="mx-5 px-4 py-3.5 bg-card border border-rule rounded-brand-lg">
        {plant.watering_interval_days && wateringStatus !== 'unset' ? (
          <div className={`text-xs mb-3 font-medium flex items-center gap-1.5 ${
            wateringStatus === 'overdue' ? 'text-danger'
            : wateringStatus === 'due-soon' ? 'text-warn'
            : 'text-accent'
          }`}>
            {wateringStatus === 'overdue' && daysSinceWatered !== null
              ? `Overdue by ${daysSinceWatered - plant.watering_interval_days}d`
              : wateringStatus === 'due-soon'
              ? 'Due today'
              : daysSinceWatered !== null
              ? (() => {
                  const daysLeft = plant.watering_interval_days - daysSinceWatered
                  const nextDate = new Date(Date.now() + daysLeft * 86_400_000)
                  const dateLabel = nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                  return `Next in ${daysLeft}d · ${dateLabel}`
                })()
              : 'Schedule set'
            }
          </div>
        ) : (
          <p className="text-xs text-ink-soft mb-3">Controls the watering status badge shown on the home screen.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_OPTIONS.map(d => (
            <Chip
              key={d}
              active={plant.watering_interval_days === d}
              onClick={() => !savingReminder && setReminder(d)}
            >
              {d}d
            </Chip>
          ))}
          {plant.watering_interval_days && (
            <Chip onClick={() => !savingReminder && setReminder(null)}>Remove</Chip>
          )}
        </div>
      </div>

      {/* ── Fertilizing schedule chooser ──────────────────────────────── */}
      <SectionLabel number="§ 05" title="Fertilizing schedule" />
      <div className="mx-5 px-4 py-3.5 bg-card border border-rule rounded-brand-lg">
        {plant.fertilizing_interval_days && fertilizingStatus !== 'unset' ? (
          <div className={`text-xs mb-3 font-medium flex items-center gap-1.5 ${
            fertilizingStatus === 'overdue' ? 'text-danger'
            : fertilizingStatus === 'due-soon' ? 'text-warn'
            : 'text-accent'
          }`}>
            {fertilizingStatus === 'overdue' && daysSinceFertilized !== null
              ? `Overdue by ${daysSinceFertilized - plant.fertilizing_interval_days}d`
              : fertilizingStatus === 'due-soon'
              ? 'Due today'
              : daysSinceFertilized !== null
              ? (() => {
                  const daysLeft = plant.fertilizing_interval_days - daysSinceFertilized
                  const nextDate = new Date(Date.now() + daysLeft * 86_400_000)
                  const dateLabel = nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                  return `Next in ${daysLeft}d · ${dateLabel}`
                })()
              : 'Schedule set'
            }
          </div>
        ) : (
          <p className="text-xs text-ink-soft mb-3">Controls the feeding status badge. Most houseplants benefit from fertilizing every 2–4 weeks in the growing season.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {REMINDER_OPTIONS.map(d => (
            <Chip
              key={d}
              active={plant.fertilizing_interval_days === d}
              onClick={() => !savingFertilizing && setFertilizingReminder(d)}
            >
              {d}d
            </Chip>
          ))}
          {plant.fertilizing_interval_days && (
            <Chip onClick={() => !savingFertilizing && setFertilizingReminder(null)}>Remove</Chip>
          )}
        </div>
      </div>

      {/* ── Species guide ─────────────────────────────────────────────── */}
      <SectionLabel
        number="§ 06"
        title="Species guide"
        action={speciesProfile ? (speciesOpen ? 'Collapse' : 'Expand') : undefined}
        onAction={() => setSpeciesOpen(v => !v)}
      />
      <div className="mx-5 px-4 bg-card border border-rule rounded-brand-lg">
        {!knownSpecies ? (
          <p className="py-4 text-sm text-ink-muted italic">
            Identify this plant&rsquo;s species to unlock the field-guide entry.
          </p>
        ) : !speciesProfile && fetchingSpecies ? (
          <p className="py-4 text-sm text-ink-soft">Fetching species guide…</p>
        ) : !speciesProfile ? (
          <div className="py-4">
            <p className="text-sm text-ink-soft mb-3">No guide yet for {knownSpecies}.</p>
            <HairlineButton icon="sparkle" onClick={() => fetchSpeciesProfileFromAI(knownSpecies)}>
              Generate species guide
            </HairlineButton>
          </div>
        ) : (
          <>
            <SpeciesRow icon="sun"         label="Light"    value={speciesProfile.light} colorClass="text-warn" />
            <SpeciesRow icon="drop"        label="Water"    value={speciesProfile.watering} colorClass="text-accent" />
            <SpeciesRow icon="humidity"    label="Humidity" value={speciesProfile.humidity} colorClass="text-accent" />
            <SpeciesRow icon="thermometer" label="Temp"     value={speciesProfile.temperature} colorClass="text-ink-soft" />
            <SpeciesRow icon="warning"     label="Toxic"    value={speciesProfile.toxicity} colorClass="text-danger" last={!speciesOpen} />
            {speciesOpen && (
              <div className="py-4 border-t border-dashed border-rule space-y-4">
                {speciesProfile.soil && <SpeciesBlock label="Soil" value={speciesProfile.soil} />}
                {speciesProfile.common_problems && <SpeciesBlock label="Common problems" value={speciesProfile.common_problems} />}
                {speciesProfile.growth_habits && <SpeciesBlock label="Growth" value={speciesProfile.growth_habits} />}
                {speciesProfile.propagation && <SpeciesBlock label="Propagation" value={speciesProfile.propagation} />}
                {speciesProfile.pruning_tips && <SpeciesBlock label="Pruning" value={speciesProfile.pruning_tips} />}
                {speciesProfile.disease_symptoms && <SpeciesBlock label="Disease symptoms" value={speciesProfile.disease_symptoms} />}
                {speciesProfile.seasonal_care && <SpeciesBlock label="Seasonal care" value={speciesProfile.seasonal_care} />}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => fetchSpeciesProfileFromAI(knownSpecies, true)}
                    disabled={fetchingSpecies}
                    className="inline-flex items-center gap-1.5 text-xs text-accent font-medium disabled:opacity-50"
                  >
                    <Icon name="sparkle" size={12} stroke={1.9} /> {fetchingSpecies ? 'Refreshing…' : 'Refresh guide'}
                  </button>
                  <a
                    href={`/explore?species=${encodeURIComponent(knownSpecies)}`}
                    className="inline-flex items-center gap-1 text-xs text-ink-soft font-medium hover:text-ink"
                  >
                    Field Guide <Icon name="chev" size={11} stroke={2} className="rotate-[-90deg]" />
                  </a>
                </div>
                {speciesProfile.fetched_at && (
                  <div className="font-mono text-[9px] tracking-[0.1em] text-ink-muted uppercase mt-1">
                    Guide fetched {relativeTime(speciesProfile.fetched_at)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Photos over time ──────────────────────────────────────────── */}
      {photos.length > 0 && (
        <>
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <div>
              <div className="font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                § 07 · Photos — {photos.length}
                {photos.length >= 2 && (() => {
                  const oldest = photos[photos.length - 1]
                  const newestTs = new Date(photos[0].created_at).getTime()
                  const oldestTs = new Date(oldest.created_at).getTime()
                  const months = Math.max(1, (newestTs - oldestTs) / (86_400_000 * 30.44))
                  const rate = Math.round((photos.length / months) * 10) / 10
                  return rate >= 0.5 ? ` · ${rate}/mo` : null
                })()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {photos.length >= 2 && (
                <button
                  onClick={() => { setCompareMode(v => !v); setSelectedForCompare(new Set()) }}
                  className="text-[12px] text-accent font-medium"
                >
                  {compareMode ? 'Done' : 'Compare'}
                </button>
              )}
              <button
                onClick={downloadAllPhotos}
                disabled={downloadingZip}
                className="text-[12px] text-ink-soft font-medium flex items-center gap-1 disabled:opacity-50"
              >
                <Icon name="chev-down" size={12} stroke={2} />
                {downloadingZip ? 'Zipping…' : 'Export all'}
              </button>
            </div>
          </div>
          <div className="vr-scroll flex gap-2 px-5 overflow-x-auto pb-1">
            {photos.map((photo, idx) => {
              const isSelected = selectedForCompare.has(photo.id)
              return (
                <div
                  key={photo.id}
                  className={`shrink-0 w-[110px] h-[140px] rounded-brand overflow-hidden border relative bg-paper-alt cursor-pointer ${
                    isSelected ? 'border-accent border-2' : 'border-rule'
                  }`}
                  onClick={compareMode
                    ? () => toggleCompareSelect(photo.id)
                    : () => setLightboxIndex(idx)
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getPhotoUrl(photo)} alt="" className="w-full h-full object-cover" />
                  <div className="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-[0.08em] uppercase" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {formatTimestamp(photo.created_at)}
                  </div>
                  {compareMode && isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <Icon name="check" size={11} stroke={2.5} className="text-paper" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Compare view: side-by-side when 2 photos selected */}
          {compareMode && selectedForCompare.size === 2 && (() => {
            const [idA, idB] = Array.from(selectedForCompare)
            const photoA = photos.find(p => p.id === idA)
            const photoB = photos.find(p => p.id === idB)
            if (!photoA || !photoB) return null
            return (
              <div className="mx-5 mt-3 rounded-brand-lg overflow-hidden border border-rule">
                <div className="grid grid-cols-2 gap-px bg-rule">
                  <div className="relative bg-paper-alt" style={{ aspectRatio: '1 / 1.2' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getPhotoUrl(photoA)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-[0.06em] uppercase" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {formatTimestamp(photoA.created_at)}
                    </div>
                  </div>
                  <div className="relative bg-paper-alt" style={{ aspectRatio: '1 / 1.2' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getPhotoUrl(photoB)} alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-[0.06em] uppercase" style={{ color: 'rgba(255,255,255,0.85)' }}>
                      {formatTimestamp(photoB.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── Dock: quick-care actions ──────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-40 px-3.5 pointer-events-none"
        style={{ bottom: 16 }}
      >
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <div
            id="quick-actions"
            onClick={e => e.stopPropagation()}
            className="bg-ink rounded-full p-1.5 flex items-center gap-1 shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
          >
            {PRIMARY_ACTIONS.map(a => (
              <DockButton
                key={a.type}
                action={a}
                onClick={() => logCare(a.type)}
                disabled={loggingCare}
                done={doneToday.has(a.type)}
                urgent={
                  (a.type === 'watered' && wateringStatus === 'overdue') ||
                  (a.type === 'fertilized' && fertilizingStatus === 'overdue')
                }
              />
            ))}
            <DockButton
              action={{ type: 'note', label: 'More', icon: 'plus' }}
              onClick={() => setShowMore(v => !v)}
              active={showMore}
            />
          </div>

          {showMore && (
            <div className="mt-2 bg-ink rounded-full p-1.5 flex items-center gap-1" onClick={e => e.stopPropagation()}>
              {MORE_ACTIONS.map(a => (
                <DockButton
                  key={a.type}
                  action={a}
                  onClick={() => {
                    if (a.type === 'note')     setShowNoteInput(true)
                    else if (a.type === 'measured') setShowMeasureInput(true)
                    else logCare(a.type)
                    setShowMore(false)
                  }}
                  disabled={loggingCare}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Photo lightbox ────────────────────────────────────────────── */}
      {lightboxIndex !== null && photos[lightboxIndex] && (() => {
        const photo = photos[lightboxIndex]
        return (
          <div
            className="fixed inset-0 z-[60] bg-black flex flex-col"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 pt-safe pt-5 pb-3 shrink-0" onClick={e => e.stopPropagation()}>
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {lightboxIndex + 1} / {photos.length} · {formatTimestamp(photo.created_at)}
              </div>
              <button onClick={() => setLightboxIndex(null)} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <Icon name="close" size={16} stroke={2} className="text-paper" />
              </button>
            </div>
            {/* Photo */}
            <div className="flex-1 relative overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getPhotoUrl(photo)} alt="" className="w-full h-full object-contain" />
              {/* Prev / Next */}
              {lightboxIndex > 0 && (
                <button
                  onClick={() => setLightboxIndex(i => i! - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(255,255,255,0.12)' }}
                >
                  <Icon name="back" size={18} className="text-paper" />
                </button>
              )}
              {lightboxIndex < photos.length - 1 && (
                <button
                  onClick={() => setLightboxIndex(i => i! + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(255,255,255,0.12)' }}
                >
                  <Icon name="chev" size={18} className="text-paper" />
                </button>
              )}
            </div>
            {/* Bottom actions */}
            <div className="flex items-center justify-center gap-3 py-6 shrink-0 flex-wrap px-5" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => { handleAnalyzeClick(photo); setLightboxIndex(null) }}
                disabled={analyzing || analyzeGated}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium text-paper disabled:opacity-50"
                style={{ background: 'rgba(76,106,72,0.7)' }}
              >
                <Icon name="sparkle" size={15} stroke={2} className="text-paper" />
                {analyzing ? 'Analyzing…' : 'Analyze'}
              </button>
              <button
                onClick={() => void downloadPhoto(photo)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium text-paper"
                style={{ background: 'rgba(255,255,255,0.14)' }}
              >
                <Icon name="chev-down" size={15} stroke={2} className="text-paper" />
                Download
              </button>
              <button
                onClick={() => { handleDeletePhoto(photo); setLightboxIndex(null) }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium"
                style={{ background: 'rgba(155,58,46,0.5)', color: '#EED8D3' }}
              >
                <Icon name="trash" size={15} stroke={2} className="text-danger-soft" />
                Delete
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div
          key={toast.key}
          className="toast-enter fixed z-50 bg-ink text-paper text-sm font-medium px-4 py-2 rounded-full shadow-lg pointer-events-none whitespace-nowrap left-1/2 -translate-x-1/2"
          style={{ bottom: 150 }}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function StatusStat({
  label, value, sub, tone,
}: { label: string; value: string; sub: string; tone: 'overdue' | 'due-soon' | 'good' | 'unset' }) {
  const colorClass = tone === 'overdue' ? 'text-danger'
                   : tone === 'due-soon' ? 'text-warn'
                   : tone === 'unset' ? 'text-ink-muted'
                   : 'text-accent'
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-ink-muted mb-0.5">
        {label}
      </div>
      <div className={`font-serif text-[22px] leading-none tracking-[-0.02em] ${colorClass}`}>
        {value}
      </div>
      <div className="font-sans text-[10px] text-ink-soft mt-0.5">{sub}</div>
    </div>
  )
}

function CareList({ text }: { text: string }) {
  // If the care string uses bullet-ish formatting, render as a list; else paragraph.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const bulletLines = lines.filter(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*'))

  if (bulletLines.length >= 2) {
    return (
      <div className="space-y-1.5">
        {bulletLines.map((l, i) => {
          const content = l.replace(/^[•\-*]\s*/, '')
          return (
            <div key={i} className="flex gap-2 items-start text-[13px] text-ink leading-snug">
              <span className="text-ink-muted font-mono mt-0.5">—</span>
              <span>{content}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return <p className="text-[13px] text-ink leading-snug" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>{text}</p>
}

function HistoryRow({ item, isLast, onDelete, onEditNote, photoUrl }: { item: TimelineItem; isLast: boolean; onDelete?: () => void; onEditNote?: (text: string) => void; photoUrl?: string }) {
  const [expanded,  setExpanded]  = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [editText,  setEditText]  = useState('')
  const iconName: IconName =
    item.kind === 'analysis'                    ? 'sparkle'
    : item.data.type === 'watered'              ? 'drop'
    : item.data.type === 'fertilized'           ? 'leaf'
    : item.data.type === 'pruned'               ? 'scissors'
    : item.data.type === 'misted'               ? 'mist'
    : item.data.type === 'repotted'             ? 'pot'
    : item.data.type === 'pest_treatment'       ? 'bug'
    : item.data.type === 'moved'                ? 'move'
    : item.data.type === 'measured'             ? 'ruler'
    : 'edit'

  const isAnalysis = item.kind === 'analysis'
  return (
    <div className={`flex gap-3 py-2.5 ${isLast ? '' : 'border-b border-dashed border-rule'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAnalysis ? 'bg-accent-soft' : 'bg-paper-alt'}`}>
        <Icon name={iconName} size={14} stroke={1.9} className={isAnalysis ? 'text-accent' : 'text-ink-soft'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-sans font-medium text-[13px] text-ink tracking-[-0.01em] capitalize inline-flex items-baseline gap-1.5">
            {item.kind === 'analysis' ? 'AI analysis' : CARE_LOG_LABELS[item.data.type] || item.data.type}
            {/* Category badge for structured notes (Gap 4) */}
            {item.kind === 'care' && item.data.type === 'note' && item.data.category && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-paper-alt text-ink-muted uppercase tracking-[0.08em]">
                {item.data.category}
              </span>
            )}
            {/* Structured measurement value (Gap 6) */}
            {item.kind === 'care' && item.data.type === 'measured' && item.data.measurement_value !== null && (
              <span className="font-mono text-[11px] text-accent font-semibold tabular-nums">
                {item.data.measurement_value}{item.data.measurement_unit ? ` ${item.data.measurement_unit}` : ''}
              </span>
            )}
          </span>
          <span className="font-mono text-[10px] text-ink-muted tracking-[0.04em] shrink-0">
            {formatTimestamp(item.date)}
          </span>
        </div>
        {item.kind === 'analysis' && (photoUrl || item.data.health) && (
          <div className={`mt-1.5 flex gap-2.5 ${photoUrl ? 'items-start' : ''}`}>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="analysis photo" className="w-14 h-14 rounded-lg object-cover border border-rule shrink-0" />
            )}
            {item.data.health && (
              <div className="font-serif italic text-[14px] text-ink leading-snug">
                &ldquo;{item.data.health}&rdquo;
              </div>
            )}
          </div>
        )}
        {item.kind === 'analysis' && item.data.health_score !== null && (
          <span className={`inline-block mt-1 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            item.data.health_score >= 4 ? 'bg-accent-soft text-accent'
            : item.data.health_score >= 3 ? 'bg-warn-soft text-warn'
            : 'bg-danger-soft text-danger'
          }`}>
            {item.data.health_score}/5
          </span>
        )}
        {item.kind === 'analysis' && item.data.care && (
          <>
            {expanded && (
              <div className="mt-2 pt-2 border-t border-dashed border-rule">
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-muted mb-1">Recommendations</div>
                <p className="text-[12px] text-ink-soft leading-relaxed">{item.data.care}</p>
              </div>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 text-[11px] text-accent font-medium"
            >
              {expanded ? 'Hide' : 'See recommendations'}
            </button>
          </>
        )}
        {item.kind === 'care' && item.data.type === 'measured' && item.data.notes && (
          // Structured measurements show value in the title badge; notes here are
          // optional context ("tallest stem"). Legacy measured rows use this to
          // display the full free-text measurement ("42cm tall").
          <div className={`mt-0.5 ${
            item.data.measurement_value !== null
              ? 'text-[12px] text-ink-soft'
              : 'font-mono text-[13px] text-accent font-semibold'
          }`}>{item.data.notes}</div>
        )}
        {item.kind === 'care' && item.data.type === 'note' && (
          editing ? (
            <div className="mt-1.5">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
                autoFocus
                className="w-full bg-paper-alt border border-rule rounded text-[12px] text-ink px-2.5 py-2 outline-none resize-none"
              />
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => { onEditNote?.(editText); setEditing(false) }}
                  className="text-[11px] text-accent font-medium"
                >Save</button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-[11px] text-ink-muted font-medium"
                >Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-start justify-between gap-2">
              <div className="font-serif italic text-[15px] text-ink leading-snug flex-1" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
                {item.data.notes ? `"${item.data.notes}"` : <span className="text-ink-muted text-[12px] not-italic">No note text</span>}
              </div>
              {onEditNote && (
                <button
                  onClick={() => { setEditText(item.data.notes ?? ''); setEditing(true) }}
                  className="text-ink-muted shrink-0 mt-px"
                  aria-label="Edit note"
                >
                  <Icon name="edit" size={12} stroke={1.7} />
                </button>
              )}
            </div>
          )
        )}
        {item.kind === 'care' && item.data.type !== 'measured' && item.data.type !== 'note' && item.data.notes && (
          <div className="text-[12px] text-ink-soft mt-0.5">{item.data.notes}</div>
        )}
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label="Delete entry"
          className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-danger shrink-0 mt-0.5"
        >
          <Icon name="trash" size={13} stroke={1.7} />
        </button>
      )}
    </div>
  )
}

function DossierRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex gap-4 py-2.5 ${last ? '' : 'border-b border-dashed border-rule'}`}>
      <div className="w-20 shrink-0 font-mono text-[10px] tracking-[0.1em] uppercase text-ink-muted pt-0.5">
        {label}
      </div>
      <div className="flex-1 font-sans text-[13px] text-ink leading-relaxed">{value}</div>
    </div>
  )
}

// Extract a single-line summary from potentially multi-line/bulleted AI text.
function firstLine(text: string): string {
  const clean = text.replace(/^[•\-]\s*/, '').trim()
  const nlIdx = clean.indexOf('\n')
  const dotIdx = clean.indexOf('. ')
  const end = Math.min(
    nlIdx > 0 ? nlIdx : Infinity,
    dotIdx > 0 ? dotIdx + 1 : Infinity,
  )
  return end === Infinity ? clean : clean.slice(0, end)
}

function SpeciesRow({
  icon, label, value, colorClass, last,
}: { icon: IconName; label: string; value: string | null; colorClass: string; last?: boolean }) {
  if (!value) return null
  return (
    <div className={`flex items-center gap-3 py-3 ${last ? '' : 'border-b border-dashed border-rule'}`}>
      <div className="w-7 h-7 rounded-lg bg-paper-alt flex items-center justify-center shrink-0">
        <Icon name={icon} size={14} stroke={1.9} className={colorClass} />
      </div>
      <div className="flex-1 text-[11px] text-ink-soft font-mono tracking-[0.08em] uppercase">{label}</div>
      <div className="font-sans text-[13px] text-ink font-medium text-right">{firstLine(value)}</div>
    </div>
  )
}

function SpeciesBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase font-semibold mb-1">
        {label}
      </div>
      <p className="font-serif text-[14px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
        {value}
      </p>
    </div>
  )
}

function DockButton({
  action, onClick, disabled, active, done, urgent,
}: { action: CareAction; onClick: () => void; disabled?: boolean; active?: boolean; done?: boolean; urgent?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 rounded-full disabled:opacity-50 ${
        active ? 'bg-white/10' : ''
      }`}
      style={{ color: done ? 'rgba(185,201,168,0.75)' : 'rgba(255,255,255,0.85)' }}
    >
      <div className="relative">
        <Icon name={action.icon} size={17} stroke={1.8} />
        {done && (
          <div className="absolute -top-1 -right-1.5 w-3 h-3 rounded-full bg-accent flex items-center justify-center">
            <Icon name="check" size={7} stroke={3} className="text-paper" />
          </div>
        )}
        {!done && urgent && (
          <div className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-danger" />
        )}
      </div>
      <span className="font-sans text-[10px] font-medium tracking-[-0.01em]">{action.label}</span>
    </button>
  )
}

// ─── Edit form ──────────────────────────────────────────────────────────
function EditForm({
  nickname, setNickname,
  editSpecies, setEditSpecies,
  location, setLocation,
  potSize, setPotSize,
  soilType, setSoilType,
  acquiredDate, setAcquiredDate,
  lastRepottedDate, setLastRepottedDate,
  notes, setNotes,
  tags, setTags,
  pestNotes, setPestNotes,
  lastTreatmentDate, setLastTreatmentDate,
  onSave, saving,
  onDelete, deleting,
}: {
  nickname: string; setNickname: (s: string) => void
  editSpecies: string; setEditSpecies: (s: string) => void
  location: string; setLocation: (s: string) => void
  potSize: string; setPotSize: (s: string) => void
  soilType: string; setSoilType: (s: string) => void
  acquiredDate: string; setAcquiredDate: (s: string) => void
  lastRepottedDate: string; setLastRepottedDate: (s: string) => void
  notes: string; setNotes: (s: string) => void
  tags: string[]; setTags: (t: string[]) => void
  pestNotes: string; setPestNotes: (s: string) => void
  lastTreatmentDate: string; setLastTreatmentDate: (s: string) => void
  onSave: () => void; saving: boolean
  onDelete: () => void; deleting: boolean
}) {
  return (
    <div className="px-5 py-5 bg-paper-alt border-b border-rule">
      <BigTitle italic className="!text-[24px] mb-3">Edit plant</BigTitle>
      <div className="space-y-3.5">
        <EditField label="Nickname *" value={nickname} onChange={setNickname} />
        <EditField label="Species"    value={editSpecies} onChange={setEditSpecies} placeholder="Monstera deliciosa" />
        <EditField label="Location"   value={location}    onChange={setLocation}    placeholder="Living room — east window" />
        <EditField label="Pot"        value={potSize}     onChange={setPotSize}     placeholder='6" terracotta' />
        <EditField label="Soil type"  value={soilType}    onChange={setSoilType}    placeholder="Well-draining, perlite mix" />
        <EditDate  label="Acquired"   value={acquiredDate} onChange={setAcquiredDate} />
        <EditDate  label="Last repotted" value={lastRepottedDate} onChange={setLastRepottedDate} />
        <div>
          <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[13px] text-ink resize-none"
          />
        </div>

        {/* Tag editor */}
        <TagEditor tags={tags} setTags={setTags} />

        {/* Pest & treatment */}
        <div className="pt-1">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
            Pest & treatment
          </div>
          <EditDate label="Last treatment date" value={lastTreatmentDate} onChange={setLastTreatmentDate} />
          <div className="mt-2.5">
            <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">Pest notes</label>
            <textarea
              value={pestNotes}
              onChange={e => setPestNotes(e.target.value)}
              rows={2}
              placeholder="Which pest, what product, how many treatments…"
              className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[13px] text-ink resize-none"
            />
          </div>
        </div>

        <HairlineButton onClick={onSave} disabled={saving || !nickname.trim()} fullWidth>
          {saving ? 'Saving…' : 'Save changes'}
        </HairlineButton>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="w-full py-3 rounded-full border border-rule text-danger text-sm font-medium disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete plant'}
        </button>
      </div>
    </div>
  )
}

function TagEditor({ tags, setTags }: { tags: string[]; setTags: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function addTag() {
    const t = input.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setInput('')
  }

  return (
    <div>
      <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">Tags</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5 mb-2">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-soft text-accent text-[11px] font-mono rounded-full">
            {tag}
            <button
              type="button"
              onClick={() => setTags(tags.filter(t => t !== tag))}
              className="text-accent/60 hover:text-accent"
            >
              <Icon name="close" size={10} stroke={2.5} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
          placeholder="e.g. rare, propagation, gift"
          className="flex-1 px-3.5 py-2.5 border border-rule rounded-brand bg-card text-[13px] text-ink"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!input.trim()}
          className="px-4 py-2.5 bg-paper border border-rule rounded-brand text-[13px] text-ink-soft font-medium disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null
  const w = 56, h = 18, pad = 2
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (w - pad * 2)
    const y = h - pad - ((s - 1) / 4) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = scores[scores.length - 1]
  const lineColor = last >= 4 ? '#4C6A48' : last >= 3 ? '#B4571E' : '#9B3A2E'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EditField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[14px] text-ink"
      />
    </div>
  )
}

function EditDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">{label}</label>
      <div className="relative mt-1.5">
        <div className="flex items-center justify-between w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[13px] pointer-events-none">
          <span className={value ? 'text-ink' : 'text-ink-muted'}>
            {value ? formatDate(value) : 'Tap to select'}
          </span>
          <Icon name="calendar" size={14} className="text-ink-muted" />
        </div>
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        />
      </div>
    </div>
  )
}
