'use client'
// app/(app)/add-plant/page.tsx
// Add Plant — 3-step chunked flow:
//   Step 1 — Identify: take/upload a photo → Claude identifies the species
//            (or skip and pick a name manually in step 2).
//   Step 2 — Place:    nickname + location.
//   Step 3 — Schedule: watering interval.
//
// The plant row is created at the end of step 3. If the user took a photo
// in step 1, it's uploaded and attached to the new plant afterwards.
import { createClient } from '@/lib/supabase/client'
import { fileToBase64 } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'
import { BigTitle, Chip, HairlineButton } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'

type Step = 1 | 2 | 3

interface IdentifyResult {
  speciesName: string
  confidence: number
}

export default function AddPlantPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>(1)

  // Step 1 state — photo + identified species
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [identifying, setIdentifying] = useState(false)
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null)
  const [speciesConfirmed, setSpeciesConfirmed] = useState(false)
  const [manualSpecies, setManualSpecies] = useState('')
  const [manualSpeciesOpen, setManualSpeciesOpen] = useState(false)
  const [manualSpeciesSuggestions, setManualSpeciesSuggestions] = useState<string[]>([])
  // Stored after Step 1 identification — forwarded to nickname generator
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [photoMimeType, setPhotoMimeType] = useState<string>('')

  // Step 2 state
  const [nickname, setNickname] = useState('')
  const [location, setLocation] = useState('')
  const [customLocation, setCustomLocation] = useState('')
  const [soilType, setSoilType] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')

  // Step 3 state — null means "no schedule" (skip)
  const [interval, setInterval] = useState<number | null>(7)
  const [fertilizingInterval, setFertilizingInterval] = useState<number | null>(null)
  // AI-suggested intervals — stored separately so Step 3 can show a "✨ AI suggested" label
  const [aiWateringDays, setAiWateringDays] = useState<number | null>(null)
  const [aiFeedingDays, setAiFeedingDays]   = useState<number | null>(null)
  const [intervalsAiPopulated, setIntervalsAiPopulated] = useState(false)

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [locationPresets, setLocationPresets] = useState<string[]>(
    ['Living Room', 'Bedroom', 'Bathroom', 'Kitchen', 'Office']
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Replace hardcoded location presets with the user's existing plant locations.
  useEffect(() => {
    async function loadLocations() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('plants').select('location').eq('user_id', session.user.id).not('location', 'is', null)
      const locs = [...new Set((data ?? []).map(p => p.location as string).filter(Boolean))]
      if (locs.length > 0) setLocationPresets(locs)
    }
    loadLocations()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // If ?species=... was passed (e.g. from Explore "I have one"), skip to step 2.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pre = params.get('species')
    if (pre) {
      setManualSpecies(pre)
      setManualSpeciesOpen(true)
      setStep(2)
    }
  }, [])

  // Debounced autocomplete: search species_profiles as the user types the
  // manual species name. Only fires after 300ms of no input; clears on short/empty queries.
  useEffect(() => {
    if (!manualSpecies || manualSpecies.length < 2) {
      setManualSpeciesSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('species_profiles')
        .select('species_name')
        .ilike('species_name', `%${manualSpecies}%`)
        .limit(6)
      setManualSpeciesSuggestions((data ?? []).map(d => d.species_name as string))
    }, 300)
    return () => clearTimeout(timer)
  }, [manualSpecies]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 1: photo + identify ──────────────────────────────────────────
  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setIdentifyResult(null)
    setSpeciesConfirmed(false)
    await identify(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function identify(file: File) {
    setIdentifying(true)
    setError(null)
    try {
      const base64 = await fileToBase64(file)
      setPhotoBase64(base64)
      setPhotoMimeType(file.type)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error: fnError } = await supabase.functions.invoke('identify-species', {
        body: { imageBase64: base64, mimeType: file.type },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (fnError) throw new Error(fnError.message || 'Identify failed')
      if (data?.error) throw new Error(data.error)
      if (data?.speciesName) {
        setIdentifyResult({ speciesName: data.speciesName, confidence: data.confidence ?? 0 })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not identify species.')
    } finally {
      setIdentifying(false)
    }
  }

  // Called by Step2 after auto-fetching the AI suggestions endpoint
  function handleCareSchedule(wateringDays: number | null, feedingDays: number | null) {
    setAiWateringDays(wateringDays)
    setAiFeedingDays(feedingDays)
    // Only pre-fill the schedule once (don't clobber manual changes if user navigates back)
    if (!intervalsAiPopulated) {
      if (wateringDays !== null) setInterval(wateringDays)
      if (feedingDays  !== null) setFertilizingInterval(feedingDays)
      setIntervalsAiPopulated(true)
    }
  }

  // ── Step 3: create plant + upload photo ───────────────────────────────
  async function handleFinish() {
    if (!nickname.trim()) {
      setError('Nickname is required.')
      setStep(2)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const finalSpecies = speciesConfirmed && identifyResult
        ? identifyResult.speciesName
        : (manualSpecies.trim() || null)

      const finalLocation = location === '__custom__'
        ? customLocation.trim() || null
        : (location || null)

      const { data: plant, error: insertError } = await supabase
        .from('plants')
        .insert({
          user_id: user.id,
          nickname: nickname.trim(),
          species: finalSpecies,
          location: finalLocation,
          soil_type: soilType.trim() || null,
          acquired_date: acquiredDate || null,
          watering_interval_days: interval,
          fertilizing_interval_days: fertilizingInterval,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Upload the identifying photo if one was provided.
      if (photoFile && plant) {
        const ext = photoFile.type === 'image/webp' ? 'webp'
                  : photoFile.type === 'image/png'  ? 'png'
                  : photoFile.type === 'image/gif'  ? 'gif'
                  : 'jpg'
        const path = `${user.id}/${plant.id}/${Date.now()}.${ext}`
        const buffer = await photoFile.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('plant-photos').upload(path, buffer, { contentType: photoFile.type })
        if (!uploadError) {
          await supabase.from('photos').insert({
            plant_id: plant.id, user_id: user.id, storage_path: path,
          })
        }
      }

      router.push(`/plant/${plant.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add plant.')
      setSubmitting(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-paper">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-4 flex items-center justify-between">
        <button
          onClick={() => (step > 1 ? setStep(((step - 1) as Step)) : router.back())}
          aria-label={step > 1 ? 'Back' : 'Close'}
          className="w-9 h-9 rounded-full bg-card border border-rule flex items-center justify-center"
        >
          <Icon name={step > 1 ? 'back' : 'close'} size={14} className="text-ink" />
        </button>
        <div className="font-mono text-[10px] tracking-[0.16em] text-ink-muted uppercase">
          Step {step} of 3
        </div>
        <div className="w-9" />
      </div>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-2 pb-3 flex gap-1.5">
        {[1, 2, 3].map(n => (
          <div
            key={n}
            className="flex-1 h-[3px] rounded-full transition-colors"
            style={{ background: n <= step ? '#4C6A48' : '#D9D0BD' }}
          />
        ))}
      </div>

      {/* ── Steps ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {step === 1 && (
          <Step1
            photoPreview={photoPreview}
            identifying={identifying}
            result={identifyResult}
            speciesConfirmed={speciesConfirmed}
            onConfirm={() => setSpeciesConfirmed(true)}
            onReset={() => { setPhotoPreview(null); setPhotoFile(null); setIdentifyResult(null); setSpeciesConfirmed(false); setPhotoBase64(null); setPhotoMimeType('') }}
            onTakePhoto={() => fileInputRef.current?.click()}
            manualSpeciesOpen={manualSpeciesOpen}
            manualSpecies={manualSpecies}
            setManualSpecies={s => { setManualSpecies(s); setManualSpeciesSuggestions([]) }}
            onOpenManual={() => setManualSpeciesOpen(true)}
            suggestions={manualSpeciesSuggestions}
            onSuggestionSelect={name => { setManualSpecies(name); setManualSpeciesSuggestions([]) }}
          />
        )}
        {step === 2 && (
          <Step2
            nickname={nickname} setNickname={setNickname}
            location={location} setLocation={setLocation}
            customLocation={customLocation} setCustomLocation={setCustomLocation}
            soilType={soilType} setSoilType={setSoilType}
            acquiredDate={acquiredDate} setAcquiredDate={setAcquiredDate}
            presets={locationPresets}
            speciesName={identifyResult?.speciesName || manualSpecies.trim()}
            imageBase64={photoBase64 ?? undefined}
            imageMimeType={photoMimeType || undefined}
            onCareSchedule={handleCareSchedule}
          />
        )}
        {step === 3 && (
          <Step3
            interval={interval} setInterval={setInterval}
            fertilizingInterval={fertilizingInterval} setFertilizingInterval={setFertilizingInterval}
            nickname={nickname}
            aiWateringDays={aiWateringDays}
            aiFeedingDays={aiFeedingDays}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelected}
          className="hidden"
        />

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 bg-danger-soft border border-rule rounded-brand text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {/* ── Footer action ────────────────────────────────────────────── */}
      <div className="px-5 pt-3 pb-5 bg-paper border-t border-rule">
        <HairlineButton
          fullWidth
          disabled={submitting || (step === 2 && !nickname.trim())}
          onClick={() => {
            if (step === 3) handleFinish()
            else setStep(((step + 1) as Step))
          }}
        >
          {step === 3
            ? (submitting ? 'Adding…' : 'Add to collection')
            : 'Continue'}
        </HairlineButton>
      </div>
    </div>
  )
}

// ─── Step 1: identify ───────────────────────────────────────────────────
function Step1({
  photoPreview, identifying, result, speciesConfirmed,
  onConfirm, onReset, onTakePhoto,
  manualSpeciesOpen, manualSpecies, setManualSpecies, onOpenManual,
  suggestions, onSuggestionSelect,
}: {
  photoPreview: string | null
  identifying: boolean
  result: { speciesName: string; confidence: number } | null
  speciesConfirmed: boolean
  onConfirm: () => void
  onReset: () => void
  onTakePhoto: () => void
  manualSpeciesOpen: boolean
  manualSpecies: string
  setManualSpecies: (s: string) => void
  onOpenManual: () => void
  suggestions: string[]
  onSuggestionSelect: (name: string) => void
}) {
  return (
    <div className="px-5 pt-2">
      <BigTitle>
        Let&rsquo;s meet your <span className="italic text-accent">plant.</span>
      </BigTitle>
      <p className="font-sans text-sm text-ink-soft mt-2 leading-relaxed">
        Snap a photo and we&rsquo;ll identify the species. You can always skip and
        name it yourself.
      </p>

      {/* Photo dropzone */}
      <button
        onClick={onTakePhoto}
        className="w-full mt-5 relative overflow-hidden rounded-brand-lg flex items-center justify-center border min-h-[200px] max-h-[45vh]"
        style={{
          borderStyle: 'dashed',
          borderColor: photoPreview ? '#4C6A48' : '#D9D0BD',
          background: photoPreview ? 'transparent' : '#EDE6D7',
        }}
      >
        {photoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoPreview} alt="plant" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center">
            <Icon name="camera" size={32} stroke={1.6} className="text-ink-soft mx-auto" />
            <div className="font-serif italic text-[18px] text-ink mt-2.5">Take a photograph</div>
            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-muted mt-1">
              or tap to upload
            </div>
          </div>
        )}
      </button>

      {/* Result */}
      {photoPreview && (
        <div className="mt-4 p-3.5 bg-card rounded-brand-lg border border-rule">
          {identifying ? (
            <div className="flex items-center gap-2.5">
              <Icon name="sparkle" size={16} stroke={1.9} className="text-accent animate-pulse" />
              <span className="text-sm text-ink-soft">Identifying species…</span>
            </div>
          ) : result ? (
            <>
              <div className="inline-flex items-center gap-1.5 mb-1.5">
                <Icon name="sparkle" size={14} stroke={1.9} className="text-accent" />
                <span className="text-[11px] text-accent font-semibold uppercase tracking-[0.1em]">
                  Match found{result.confidence > 0 && ` · ${Math.round(result.confidence * 100)}% confident`}
                </span>
              </div>
              <div className="font-serif italic text-[22px] text-ink">{result.speciesName}</div>
              <div className="mt-2.5 flex gap-1.5 flex-wrap">
                <Chip tone={speciesConfirmed ? 'accent' : 'neutral'} active={speciesConfirmed} onClick={onConfirm}>
                  {speciesConfirmed ? 'Confirmed' : 'Confirm'}
                </Chip>
                <Chip onClick={onReset}>Try another photo</Chip>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-ink-soft mb-2">Couldn&rsquo;t identify the species from that photo.</p>
              <Chip onClick={onReset}>Try again</Chip>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="mt-6 flex items-center gap-2.5 text-ink-muted">
        <div className="flex-1 h-px bg-rule" />
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase">or</span>
        <div className="flex-1 h-px bg-rule" />
      </div>

      {/* Manual species fallback */}
      {manualSpeciesOpen ? (
        <div className="mt-4 relative">
          <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
            Species name
          </label>
          <input
            type="text"
            value={manualSpecies}
            onChange={e => setManualSpecies(e.target.value)}
            placeholder="e.g. Monstera deliciosa"
            className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {/* Autocomplete dropdown from cached species_profiles */}
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-card border border-rule rounded-brand shadow-lg overflow-hidden">
              {suggestions.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSuggestionSelect(name)}
                  className="w-full px-3.5 py-2.5 text-left text-[13px] text-ink hover:bg-paper-alt border-b border-rule last:border-0 font-serif italic"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={onOpenManual}
          className="mt-4 w-full p-3.5 rounded-brand border border-rule bg-card flex items-center gap-2.5 text-left"
        >
          <Icon name="search" size={16} className="text-ink-soft" />
          <span className="text-[13px] text-ink-soft flex-1">Search by name…</span>
        </button>
      )}
    </div>
  )
}

// ─── Step 2: place ──────────────────────────────────────────────────────
function Step2({
  nickname, setNickname,
  location, setLocation,
  customLocation, setCustomLocation,
  soilType, setSoilType,
  acquiredDate, setAcquiredDate,
  presets,
  speciesName,
  imageBase64,
  imageMimeType,
  onCareSchedule,
}: {
  nickname: string; setNickname: (s: string) => void
  location: string; setLocation: (s: string) => void
  customLocation: string; setCustomLocation: (s: string) => void
  soilType: string; setSoilType: (s: string) => void
  acquiredDate: string; setAcquiredDate: (s: string) => void
  presets: string[]
  speciesName: string
  imageBase64?: string
  imageMimeType?: string
  onCareSchedule: (wateringDays: number | null, feedingDays: number | null) => void
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadingSugg, setLoadingSugg] = useState(false)
  const [suggFailed, setSuggFailed] = useState(false)

  // Auto-fetch on mount when a species is known — generates nicknames + care schedule in one shot
  useEffect(() => {
    if (speciesName) fetchSuggestions()
  }, [speciesName]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSuggestions() {
    setLoadingSugg(true)
    setSuggFailed(false)
    setSuggestions([])
    try {
      const res = await fetch('/api/suggest-nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speciesName,
          imageBase64: imageBase64 || undefined,
          mimeType: imageMimeType || undefined,
        }),
      })
      const data = await res.json() as {
        suggestions?: string[]
        wateringDays?: number | null
        feedingDays?: number | null
        error?: string
      }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed')
      setSuggestions(data.suggestions ?? [])
      onCareSchedule(data.wateringDays ?? null, data.feedingDays ?? null)
    } catch {
      setSuggFailed(true)
    } finally {
      setLoadingSugg(false)
    }
  }

  return (
    <div className="px-5 pt-2">
      <BigTitle>
        Give them a <span className="italic text-accent">home.</span>
      </BigTitle>
      <p className="text-sm text-ink-soft mt-2 leading-relaxed">
        A nickname makes the app more fun. Location helps match the right care.
      </p>

      <div className="mt-6">
        {/* Label row — ✨ Suggest button appears when a species is known */}
        <div className="flex items-center justify-between mb-1.5">
          <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
            Nickname
          </label>
          {speciesName && (
            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={loadingSugg}
              className="flex items-center gap-1 text-[11px] text-accent font-medium disabled:opacity-40"
            >
              {loadingSugg ? (
                <>
                  <span className="inline-block w-2.5 h-2.5 border border-accent border-t-transparent rounded-full animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={12} stroke={1.9} className="text-accent" />
                  <span>{suggFailed ? 'Try again' : suggestions.length > 0 ? 'Regenerate' : 'Suggest'}</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="Mabel, Corner Phil, Big Fern…"
          className="w-full px-4 py-3.5 border border-rule rounded-brand bg-card font-serif italic text-[20px] text-ink"
          autoFocus
        />
        {/* Suggestion chips — horizontal scroll rail */}
        {suggestions.length > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto vr-scroll pb-0.5">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setNickname(s)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-accent-soft border border-rule text-[12px] text-ink font-serif italic whitespace-nowrap"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5">
        <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
          Location
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map(p => (
            <Chip key={p} active={location === p} onClick={() => setLocation(p)}>
              {p}
            </Chip>
          ))}
          <Chip active={location === '__custom__'} onClick={() => setLocation('__custom__')}>
            + Other
          </Chip>
        </div>
        {location === '__custom__' && (
          <input
            value={customLocation}
            onChange={e => setCustomLocation(e.target.value)}
            placeholder="Where does it live?"
            className="mt-3 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[14px] text-ink"
          />
        )}
      </div>

      <div className="mt-5">
        <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
          Soil type <span className="normal-case tracking-normal text-ink-muted/60">(optional)</span>
        </label>
        <input
          value={soilType}
          onChange={e => setSoilType(e.target.value)}
          placeholder="e.g. Aroid mix, peat-based, succulent mix…"
          className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[14px] text-ink"
        />
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Soil type affects watering frequency — the AI uses it to give more accurate advice.
        </p>
      </div>

      <div className="mt-5">
        <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
          When did you get it? <span className="normal-case tracking-normal text-ink-muted/60">(optional)</span>
        </label>
        <input
          type="date"
          value={acquiredDate}
          onChange={e => setAcquiredDate(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[14px] text-ink"
        />
      </div>
    </div>
  )
}

// ─── Step 3: schedule ───────────────────────────────────────────────────
function Step3({
  interval, setInterval,
  fertilizingInterval, setFertilizingInterval,
  nickname,
  aiWateringDays,
  aiFeedingDays,
}: {
  interval: number | null
  setInterval: (n: number | null) => void
  fertilizingInterval: number | null
  setFertilizingInterval: (n: number | null) => void
  nickname: string
  aiWateringDays?: number | null
  aiFeedingDays?: number | null
}) {
  const options = [3, 5, 7, 10, 14, 21]
  const feedOptions = [14, 21, 30, 45, 60, 90]

  // True when the current value was the one the AI suggested
  const wateringIsAiSuggested = aiWateringDays !== null && aiWateringDays !== undefined && interval === aiWateringDays
  const feedingIsAiSuggested  = aiFeedingDays  !== null && aiFeedingDays  !== undefined && fertilizingInterval === aiFeedingDays

  return (
    <div className="px-5 pt-2 pb-4">
      <BigTitle>
        When should we <span className="italic text-accent">remind you?</span>
      </BigTitle>
      <p className="text-sm text-ink-soft mt-2 leading-relaxed">
        {interval
          ? `We'll suggest watering ${nickname || 'your plant'} every ${interval} days. You can always adjust.`
          : `No watering reminder — you can set one any time from the plant detail screen.`}
      </p>

      {interval !== null ? (
        <div className="mt-6 p-5 bg-card rounded-brand-lg border border-rule text-center">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
            Water every
          </div>
          <div className="font-serif italic text-accent leading-none mt-1" style={{ fontSize: 80 }}>
            {interval}
          </div>
          <div className="font-serif text-[18px] text-ink">day{interval === 1 ? '' : 's'}</div>
          {/* ✨ AI suggested badge */}
          {wateringIsAiSuggested && (
            <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent font-mono tracking-[0.1em] uppercase">
              <Icon name="sparkle" size={10} stroke={1.9} className="text-accent" />
              AI suggested
            </div>
          )}

          <div className="mt-5 flex gap-1.5 flex-wrap justify-center">
            {options.map(d => (
              <Chip key={d} active={interval === d} onClick={() => setInterval(d)}>
                {d}d
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 p-5 bg-paper-alt rounded-brand-lg border border-dashed border-rule text-center">
          <Icon name="calendar" size={24} stroke={1.6} className="text-ink-muted mx-auto" />
          <div className="font-serif italic text-[17px] text-ink mt-2">No schedule</div>
          <div className="text-xs text-ink-muted mt-1">You can set a reminder from the plant detail screen at any time.</div>
          <button
            onClick={() => setInterval(7)}
            className="mt-4 text-[12px] text-accent font-medium"
          >
            Set a reminder instead
          </button>
        </div>
      )}

      {interval !== null && (
        <>
          <div className="mt-3.5 p-3 flex gap-2.5 bg-paper-alt border border-rule rounded-brand">
            <Icon name="sparkle" size={16} stroke={1.9} className="text-accent shrink-0" />
            <p className="text-xs text-ink-soft leading-relaxed">
              You can change this anytime from the plant detail screen. The watering
              status badge on the home screen updates automatically.
            </p>
          </div>
          <button
            onClick={() => setInterval(null)}
            className="mt-4 w-full text-center text-[12px] text-ink-muted font-medium"
          >
            Skip for now — I&rsquo;ll set a reminder later
          </button>
        </>
      )}

      {/* ── Fertilizing schedule ── */}
      <div className="mt-6 pt-5 border-t border-rule">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">Fertilizing</div>
            <div className="text-[13px] text-ink-soft mt-0.5">Optional — how often to feed?</div>
          </div>
          {fertilizingInterval === null ? (
            <button
              onClick={() => setFertilizingInterval(30)}
              className="text-[12px] text-accent font-medium"
            >
              Set schedule
            </button>
          ) : (
            <button
              onClick={() => setFertilizingInterval(null)}
              className="text-[12px] text-ink-muted font-medium"
            >
              Skip
            </button>
          )}
        </div>
        {fertilizingInterval !== null && (
          <div className="p-4 bg-card rounded-brand border border-rule">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">
                Fertilize every
              </div>
              {feedingIsAiSuggested && (
                <div className="inline-flex items-center gap-1 text-[10px] text-accent font-mono tracking-[0.1em] uppercase">
                  <Icon name="sparkle" size={10} stroke={1.9} className="text-accent" />
                  AI suggested
                </div>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {feedOptions.map(d => (
                <Chip key={d} active={fertilizingInterval === d} onClick={() => setFertilizingInterval(d)}>
                  {d}d
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Small visual ghost so the screen doesn't feel empty while scrolling. */}
      <div className="mt-6 flex justify-center opacity-40">
        <div className="w-24 h-24 rounded-brand overflow-hidden border border-rule">
          <PlantPhoto name={nickname || 'new-plant'} showLabel={false} />
        </div>
      </div>
    </div>
  )
}

