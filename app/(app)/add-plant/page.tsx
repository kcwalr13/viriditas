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
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
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

  // Step 2 state
  const [nickname, setNickname] = useState('')
  const [location, setLocation] = useState('')
  const [customLocation, setCustomLocation] = useState('')

  // Step 3 state
  const [interval, setInterval] = useState<number>(7)

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

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
          watering_interval_days: interval,
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

  // Previously-entered locations pulled from their plants list would be
  // nicer UX, but keeping it simple: offer four sensible defaults + "Other".
  const LOCATION_PRESETS = ['Living Room', 'Bedroom', 'Bathroom', 'Kitchen', 'Office']

  return (
    <div className="min-h-screen flex flex-col bg-paper">
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
      <div className="px-5 pb-3 flex gap-1.5">
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
            onReset={() => { setPhotoPreview(null); setPhotoFile(null); setIdentifyResult(null); setSpeciesConfirmed(false) }}
            onTakePhoto={() => fileInputRef.current?.click()}
            manualSpeciesOpen={manualSpeciesOpen}
            manualSpecies={manualSpecies}
            setManualSpecies={setManualSpecies}
            onOpenManual={() => setManualSpeciesOpen(true)}
          />
        )}
        {step === 2 && (
          <Step2
            nickname={nickname} setNickname={setNickname}
            location={location} setLocation={setLocation}
            customLocation={customLocation} setCustomLocation={setCustomLocation}
            presets={LOCATION_PRESETS}
          />
        )}
        {step === 3 && (
          <Step3
            interval={interval} setInterval={setInterval}
            nickname={nickname}
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
        className="w-full mt-5 relative overflow-hidden rounded-brand-lg flex items-center justify-center border"
        style={{
          aspectRatio: '1 / 1',
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
        <div className="mt-4">
          <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
            Species name
          </label>
          <input
            type="text"
            value={manualSpecies}
            onChange={e => setManualSpecies(e.target.value)}
            placeholder="e.g. Monstera deliciosa"
            className="mt-1.5 w-full px-3.5 py-3 border border-rule rounded-brand bg-card text-[14px] text-ink"
          />
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
  presets,
}: {
  nickname: string; setNickname: (s: string) => void
  location: string; setLocation: (s: string) => void
  customLocation: string; setCustomLocation: (s: string) => void
  presets: string[]
}) {
  return (
    <div className="px-5 pt-2">
      <BigTitle>
        Give them a <span className="italic text-accent">home.</span>
      </BigTitle>
      <p className="text-sm text-ink-soft mt-2 leading-relaxed">
        A nickname makes the app more fun. Location helps match the right care.
      </p>

      <div className="mt-6">
        <label className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
          Nickname
        </label>
        <input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="Mabel, Corner Phil, Big Fern…"
          className="mt-1.5 w-full px-4 py-3.5 border border-rule rounded-brand bg-card font-serif italic text-[20px] text-ink"
          autoFocus
        />
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
    </div>
  )
}

// ─── Step 3: schedule ───────────────────────────────────────────────────
function Step3({
  interval, setInterval, nickname,
}: {
  interval: number
  setInterval: (n: number) => void
  nickname: string
}) {
  const options = [3, 5, 7, 10, 14, 21]
  return (
    <div className="px-5 pt-2 pb-4">
      <BigTitle>
        When should we <span className="italic text-accent">remind you?</span>
      </BigTitle>
      <p className="text-sm text-ink-soft mt-2 leading-relaxed">
        We&rsquo;ll suggest watering {nickname || 'your plant'} every {interval} days. You
        can always adjust.
      </p>

      <div className="mt-6 p-5 bg-card rounded-brand-lg border border-rule text-center">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
          Water every
        </div>
        <div className="font-serif italic text-accent leading-none mt-1" style={{ fontSize: 80 }}>
          {interval}
        </div>
        <div className="font-serif text-[18px] text-ink">day{interval === 1 ? '' : 's'}</div>

        <div className="mt-5 flex gap-1.5 flex-wrap justify-center">
          {options.map(d => (
            <Chip key={d} active={interval === d} onClick={() => setInterval(d)}>
              {d}d
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3.5 p-3 flex gap-2.5 bg-paper-alt border border-rule rounded-brand">
        <Icon name="sparkle" size={16} stroke={1.9} className="text-accent shrink-0" />
        <p className="text-xs text-ink-soft leading-relaxed">
          You can change this anytime from the plant detail screen. The watering
          status badge on the home screen updates automatically.
        </p>
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

// ─── helpers ────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      // Strip the data URL prefix to get raw base64
      resolve(res.includes(',') ? res.split(',')[1] : res)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
