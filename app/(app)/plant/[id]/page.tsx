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

import { createClient } from '@/lib/supabase/client'
import {
  formatDate,
  formatTimestamp,
  CARE_LOG_LABELS,
} from '@/lib/utils'
import type { Plant, PlantPhoto, CareLog, AnalysisResult, SpeciesProfile } from '@/lib/types'
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
  { type: 'repotted',      label: 'Repot',     icon: 'pot'  },
  { type: 'pest_treatment', label: 'Treat',    icon: 'bug'  },
  { type: 'moved',         label: 'Move',      icon: 'move' },
  { type: 'note',          label: 'Note',      icon: 'edit' },
]

const REMINDER_OPTIONS = [3, 5, 7, 10, 14, 21]

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
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null)
  const [allAnalyses,    setAllAnalyses]    = useState<AnalysisResult[]>([])
  const [speciesProfile, setSpeciesProfile] = useState<SpeciesProfile | null>(null)
  const [loading,        setLoading]        = useState(true)

  // ── UI state ──────────────────────────────────────────────────────────
  const [uploading,       setUploading]     = useState(false)
  const [loggingCare,     setLoggingCare]   = useState(false)
  const [showNoteInput,   setShowNoteInput] = useState(false)
  const [noteText,        setNoteText]      = useState('')
  const [showMore,        setShowMore]      = useState(false)
  const [analyzing,       setAnalyzing]     = useState(false)
  const [fetchingSpecies, setFetchingSpecies] = useState(false)
  const [savingReminder,  setSavingReminder] = useState(false)
  const [speciesOpen,     setSpeciesOpen]   = useState(false)
  const [editing,         setEditing]       = useState(false)
  const [saving,          setSaving]        = useState(false)
  const [deleting,        setDeleting]      = useState(false)
  const [error,           setError]         = useState<string | null>(null)

  // ── Edit form state ───────────────────────────────────────────────────
  const [nickname,         setNickname]         = useState('')
  const [editSpecies,      setEditSpecies]      = useState('')
  const [location,         setLocation]         = useState('')
  const [potSize,          setPotSize]          = useState('')
  const [acquiredDate,     setAcquiredDate]     = useState('')
  const [lastRepottedDate, setLastRepottedDate] = useState('')
  const [notesField,       setNotesField]       = useState('')

  // ── Toast state ───────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const species = plant?.species || latestAnalysis?.species
    if (species) fetchSpeciesProfileFromDB(species)
  }, [plant?.species, latestAnalysis?.species]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true)
    await Promise.all([fetchPlant(), fetchPhotos(), fetchCareLogs(), fetchAnalyses()])
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
    setAcquiredDate(data.acquired_date ?? '')
    setLastRepottedDate(data.last_repotted_date ?? '')
    setNotesField(data.notes ?? '')
  }

  async function fetchPhotos() {
    const { data } = await supabase.from('photos').select('*').eq('plant_id', id).order('created_at', { ascending: false })
    if (data) setPhotos(data)
  }

  async function fetchCareLogs() {
    const { data } = await supabase.from('care_logs').select('*').eq('plant_id', id).order('logged_at', { ascending: false }).limit(50)
    if (data) setCareLogs(data)
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
  async function logCare(type: CareType, customNote?: string) {
    setLoggingCare(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('care_logs').insert({
        plant_id: id, user_id: user!.id, type, notes: customNote ?? null,
      })
      if (error) throw error

      const label = type === 'note' ? 'Note saved' : CARE_LOG_LABELS[type]
      showToast(label)
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

  // ── AI Analysis ───────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (photos.length === 0) {
      setError('Add a photo of your plant first, then run analysis.')
      return
    }
    setAnalyzing(true)
    setError(null)
    try {
      const latestPhoto = photos[0]
      const imageUrl = supabase.storage.from('plant-photos').getPublicUrl(latestPhoto.storage_path).data.publicUrl

      const previousAnalyses = allAnalyses.slice(0, 3).map(r => ({
        date: new Date(r.created_at).toLocaleDateString(),
        species: r.species, health: r.health, care: r.care,
      }))
      const recentCareLogs = careLogs.slice(0, 10).map(l => ({
        type: l.type, notes: l.notes, date: new Date(l.logged_at).toLocaleDateString(),
      }))

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error: fnError } = await supabase.functions.invoke('analyze-plant', {
        body: {
          imageUrl, previousAnalyses, recentCareLogs,
          speciesProfile: speciesProfile ?? null,
          plantContext: (plant?.location || plant?.pot_size) ? {
            location: plant?.location ?? null, pot_size: plant?.pot_size ?? null,
          } : null,
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
        species: result.species, health: result.health, care: result.care,
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
    const { error } = await supabase.from('plants').update({
      nickname: nickname.trim(),
      species: editSpecies.trim() || null,
      location: location.trim() || null,
      pot_size: potSize.trim() || null,
      acquired_date: acquiredDate || null,
      last_repotted_date: lastRepottedDate || null,
      notes: notesField.trim() || null,
    }).eq('id', id)

    if (error) { setError('Could not save changes.') }
    else { setEditing(false); await fetchPlant() }
    setSaving(false)
  }

  async function handleDelete() {
    const ok = window.confirm(
      `Delete ${plant?.nickname}? This will remove all photos, care logs, and analysis history. This cannot be undone.`
    )
    if (!ok) return
    setDeleting(true)
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Icon name="leaf" size={40} className="text-accent animate-pulse" />
      </div>
    )
  }

  if (!plant) return null

  const knownSpecies = plant.species || latestAnalysis?.species
  const heroPhoto = photos[0]
  const lastWatered = careLogs.find(l => l.type === 'watered')
  const daysSinceWatered = lastWatered
    ? Math.floor((Date.now() - new Date(lastWatered.logged_at).getTime()) / 86_400_000)
    : null
  const timeline = buildTimeline()
  const logsThisMonth = careLogs.filter(l => (Date.now() - new Date(l.logged_at).getTime()) < 30 * 86_400_000).length

  const wateringStatus: 'overdue' | 'due-soon' | 'good' | 'unset' =
    !plant.watering_interval_days ? 'unset'
    : daysSinceWatered === null ? 'overdue'
    : daysSinceWatered > plant.watering_interval_days ? 'overdue'
    : daysSinceWatered >= plant.watering_interval_days - 1 ? 'due-soon'
    : 'good'

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="pb-40 relative">

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="relative w-full h-[360px] bg-black overflow-hidden">
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={getPhotoUrl(heroPhoto)} alt={plant.nickname} className="w-full h-full object-cover" />
        ) : (
          <PlantPhotoPlaceholder name={plant.id} label={plant.nickname} showLabel={false} />
        )}

        {/* Top chrome: back, camera, more */}
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
          </div>
          <div className="font-serif italic leading-none tracking-[-0.02em]" style={{ fontSize: 40 }}>
            {plant.nickname}
          </div>
          {knownSpecies && (
            <div className="text-[13px] mt-1 opacity-90">{knownSpecies}</div>
          )}
        </div>
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
      <div className="px-5 py-3.5 bg-paper-alt border-b border-rule grid grid-cols-3 gap-2.5">
        <StatusStat
          label="Watered"
          value={daysSinceWatered === null ? '—' : `${daysSinceWatered}d`}
          sub={plant.watering_interval_days ? `every ${plant.watering_interval_days}` : 'no schedule'}
          tone={wateringStatus}
        />
        <StatusStat
          label="Activity"
          value={String(logsThisMonth)}
          sub="logs · 30d"
          tone={logsThisMonth > 3 ? 'good' : logsThisMonth > 0 ? 'due-soon' : 'overdue'}
        />
        <StatusStat
          label="Photos"
          value={String(photos.length)}
          sub={photos.length === 0 ? 'add your first' : photos.length === 1 ? 'so far' : 'in the archive'}
          tone="good"
        />
      </div>

      {/* ── Edit form (collapsible) ───────────────────────────────────── */}
      {editing && (
        <EditForm
          nickname={nickname}          setNickname={setNickname}
          editSpecies={editSpecies}    setEditSpecies={setEditSpecies}
          location={location}          setLocation={setLocation}
          potSize={potSize}            setPotSize={setPotSize}
          acquiredDate={acquiredDate}  setAcquiredDate={setAcquiredDate}
          lastRepottedDate={lastRepottedDate} setLastRepottedDate={setLastRepottedDate}
          notes={notesField}           setNotes={setNotesField}
          onSave={handleSave}          saving={saving}
          onDelete={handleDelete}      deleting={deleting}
        />
      )}

      {/* ── AI diagnosis card ─────────────────────────────────────────── */}
      <div className="px-5 pt-5">
        <div className="flex items-baseline justify-between pb-3.5">
          <div className="font-mono text-[10px] text-ink-muted tracking-[0.14em] uppercase">
            § 01 · AI Diagnosis {latestAnalysis && `— ${formatTimestamp(latestAnalysis.created_at)}`}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || photos.length === 0}
            className="text-[11px] text-accent font-medium inline-flex items-center gap-1 disabled:opacity-40"
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
              <HairlineButton icon="sparkle" onClick={handleAnalyze} fullWidth={false}>
                Analyze plant
              </HairlineButton>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-brand-lg border border-rule overflow-hidden">
            {latestAnalysis.health && (
              <div className="px-4 py-3.5 border-b border-rule">
                <div className="inline-flex items-center gap-1.5 mb-2">
                  <Icon name="sparkle" size={14} stroke={1.9} className="text-accent" />
                  <span className="text-[11px] text-accent font-semibold uppercase tracking-[0.1em]">
                    Verdict
                  </span>
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
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="What did you notice?"
              onKeyDown={e => e.key === 'Enter' && handleNoteSubmit()}
              autoFocus
              className="flex-1 px-4 py-2.5 border border-rule rounded-brand text-sm bg-card text-ink"
            />
            <button
              onClick={handleNoteSubmit}
              disabled={!noteText.trim()}
              className="px-4 py-2.5 bg-ink text-paper rounded-brand text-sm font-medium disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* ── Log book ──────────────────────────────────────────────────── */}
      <SectionLabel number="§ 02" title="Log book" />
      <div className="px-5">
        {timeline.length === 0 ? (
          <div className="bg-card border border-rule rounded-brand p-5 text-center">
            <p className="text-sm text-ink-soft">No entries yet.</p>
            <p className="text-xs text-ink-muted mt-1">Tap the dock below to log your first care action.</p>
          </div>
        ) : (
          timeline.slice(0, 8).map((item, i) => (
            <HistoryRow key={item.id} item={item} isLast={i === Math.min(timeline.length, 8) - 1} />
          ))
        )}
      </div>

      {/* ── Dossier ───────────────────────────────────────────────────── */}
      <SectionLabel number="§ 03" title="Dossier" action="Edit" onAction={() => setEditing(true)} />
      <div className="mx-5 px-4 bg-card border border-rule rounded-brand-lg">
        {knownSpecies && <DossierRow label="Species" value={knownSpecies} />}
        {plant.location && <DossierRow label="Location" value={plant.location} />}
        {plant.pot_size && <DossierRow label="Pot" value={plant.pot_size} />}
        {plant.acquired_date && <DossierRow label="Acquired" value={formatDate(plant.acquired_date)} />}
        {plant.last_repotted_date && <DossierRow label="Last repotted" value={formatDate(plant.last_repotted_date)} />}
        {plant.watering_interval_days && <DossierRow label="Interval" value={`Water every ${plant.watering_interval_days} days`} />}
        {plant.notes && <DossierRow label="Notes" value={plant.notes} last />}
        {!knownSpecies && !plant.location && !plant.pot_size && !plant.acquired_date && !plant.last_repotted_date && !plant.watering_interval_days && !plant.notes && (
          <p className="py-4 text-sm text-ink-muted italic">Add details from the edit sheet.</p>
        )}
      </div>

      {/* ── Watering schedule chooser ─────────────────────────────────── */}
      <SectionLabel number="§ 04" title="Watering schedule" />
      <div className="mx-5 px-4 py-3.5 bg-card border border-rule rounded-brand-lg">
        <p className="text-xs text-ink-soft mb-3">
          Controls the watering status badge shown on the home screen.
        </p>
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

      {/* ── Species guide ─────────────────────────────────────────────── */}
      <SectionLabel
        number="§ 05"
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
                <button
                  onClick={() => fetchSpeciesProfileFromAI(knownSpecies, true)}
                  disabled={fetchingSpecies}
                  className="inline-flex items-center gap-1.5 text-xs text-accent font-medium disabled:opacity-50"
                >
                  <Icon name="sparkle" size={12} stroke={1.9} /> {fetchingSpecies ? 'Refreshing…' : 'Refresh guide'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Photos over time ──────────────────────────────────────────── */}
      {photos.length > 0 && (
        <>
          <SectionLabel number="§ 06" title={`Photos — ${photos.length}`} />
          <div className="vr-scroll flex gap-2 px-5 overflow-x-auto pb-1">
            {photos.map(photo => (
              <div
                key={photo.id}
                className="shrink-0 w-[110px] h-[140px] rounded-brand overflow-hidden border border-rule relative bg-paper-alt"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getPhotoUrl(photo)} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-[0.08em] uppercase" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {formatTimestamp(photo.created_at)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Dock: quick-care actions ──────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-40 px-3.5 pointer-events-none"
        style={{ bottom: 88 }}
      >
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <div
            id="quick-actions"
            className="bg-ink rounded-full p-1.5 flex items-center gap-1 shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
          >
            {PRIMARY_ACTIONS.map(a => (
              <DockButton key={a.type} action={a} onClick={() => logCare(a.type)} disabled={loggingCare} />
            ))}
            <DockButton
              action={{ type: 'note', label: 'More', icon: 'plus' }}
              onClick={() => setShowMore(v => !v)}
              active={showMore}
            />
          </div>

          {showMore && (
            <div className="mt-2 bg-ink rounded-full p-1.5 flex items-center gap-1">
              {MORE_ACTIONS.map(a => (
                <DockButton
                  key={a.type}
                  action={a}
                  onClick={() => {
                    if (a.type === 'note') setShowNoteInput(true)
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

function HistoryRow({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  const iconName: IconName =
    item.kind === 'analysis'                    ? 'sparkle'
    : item.data.type === 'watered'              ? 'drop'
    : item.data.type === 'fertilized'           ? 'leaf'
    : item.data.type === 'pruned'               ? 'scissors'
    : item.data.type === 'misted'               ? 'mist'
    : item.data.type === 'repotted'             ? 'pot'
    : item.data.type === 'pest_treatment'       ? 'bug'
    : item.data.type === 'moved'                ? 'move'
    : 'edit'

  const isAnalysis = item.kind === 'analysis'
  return (
    <div className={`flex gap-3 py-2.5 ${isLast ? '' : 'border-b border-dashed border-rule'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAnalysis ? 'bg-accent-soft' : 'bg-paper-alt'}`}>
        <Icon name={iconName} size={14} stroke={1.9} className={isAnalysis ? 'text-accent' : 'text-ink-soft'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="font-sans font-medium text-[13px] text-ink tracking-[-0.01em] capitalize">
            {item.kind === 'analysis' ? 'AI analysis' : CARE_LOG_LABELS[item.data.type] || item.data.type}
          </span>
          <span className="font-mono text-[10px] text-ink-muted tracking-[0.04em] shrink-0">
            {formatTimestamp(item.date)}
          </span>
        </div>
        {item.kind === 'analysis' && item.data.health && (
          <div className="font-serif italic text-[14px] text-ink mt-1 leading-snug">
            &ldquo;{item.data.health}&rdquo;
          </div>
        )}
        {item.kind === 'care' && item.data.notes && (
          <div className="text-[12px] text-ink-soft mt-0.5">{item.data.notes}</div>
        )}
      </div>
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
      <div className="font-sans text-[13px] text-ink font-medium text-right line-clamp-2">{value}</div>
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
  action, onClick, disabled, active,
}: { action: CareAction; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 rounded-full disabled:opacity-50 ${
        active ? 'bg-white/10' : ''
      }`}
      style={{ color: 'rgba(255,255,255,0.85)' }}
    >
      <Icon name={action.icon} size={17} stroke={1.8} />
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
  acquiredDate, setAcquiredDate,
  lastRepottedDate, setLastRepottedDate,
  notes, setNotes,
  onSave, saving,
  onDelete, deleting,
}: {
  nickname: string; setNickname: (s: string) => void
  editSpecies: string; setEditSpecies: (s: string) => void
  location: string; setLocation: (s: string) => void
  potSize: string; setPotSize: (s: string) => void
  acquiredDate: string; setAcquiredDate: (s: string) => void
  lastRepottedDate: string; setLastRepottedDate: (s: string) => void
  notes: string; setNotes: (s: string) => void
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
