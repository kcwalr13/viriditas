'use client'
// app/(app)/camera/page.tsx
// Camera-first capture screen. The FAB on every (app) screen routes here.
//
// Flow:
//   1. User arrives → sees "Ready" screen with a large capture button and
//      three mode pills (wired in v1.10.0):
//      - Snap     → photo journal entry (photos table + storage)
//      - Diagnose → photo opens an "Examine with AI" session on the plant's
//                   Diagnose screen (uploaded under the diagnosis session-photo
//                   path convention; NO photos row — transcript photos stay
//                   out of Timelapse / the photo strip)
//      - Identify → identify-species from base64 (no storage at all), with
//                   the same confirm/correct affordance Add Plant uses
//   2. User taps → device camera opens (capture="environment" on mobile;
//      file picker on desktop).
//   3. Snap/Diagnose: confirm sheet slides up with:
//      - Photo preview
//      - Best-guess plant (heuristic: last used in camera → first plant → none)
//      - Plant picker so they can correct the guess
//      - "This is a new plant" option → /add-plant (Snap mode only)
//      Identify: the AI result sheet slides up instead (no plant needed first).
//   4. On confirm →
//      - Snap: upload to Supabase Storage + photos table → plant detail.
//      - Diagnose: upload to {userId}/{plantId}/diagnosis/… → sessionStorage
//        handoff → /plant/[id]/diagnose auto-opens the examination.
//      - Identify: write species + is_name_verified to the chosen plant, or
//        hand off to /add-plant?species=… for a new one.
//
// NOTE: The HANDOFF.md spec also calls for logging a care_logs row of type
// 'photo' on confirm. That requires adding 'photo' to the care_logs_type_check
// constraint first. See the Supabase SQL migration in CLAUDE.md. Skipped here
// until the migration is confirmed run.

import { createClient } from '@/lib/supabase/client'
import { fileToBase64 } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import type { Plant } from '@/lib/types'

// How many recent plants to show in the picker before truncating.
const PICKER_LIMIT = 6

// localStorage key for remembering which plant was last used via camera.
const LAST_CAMERA_PLANT_KEY = 'viriditas.lastCameraPlant'

// sessionStorage key carrying a pre-uploaded diagnosis opening photo to the
// Diagnose screen, which consumes (and removes) it on load. Must match the
// constant in app/(app)/plant/[id]/diagnose/page.tsx.
const CAMERA_DIAGNOSE_HANDOFF_KEY = 'viriditas.cameraDiagnoseHandoff'

type CameraMode = 'snap' | 'diagnose' | 'identify'

// 'selected'/'uploading' belong to the Snap/Diagnose confirm sheet;
// 'identifying'/'identified' belong to the Identify result sheet.
type Stage = 'ready' | 'selected' | 'uploading' | 'identifying' | 'identified'

// What identify-species returns: speciesName is null when the photo doesn't
// show a recognizable plant; confidence is a word, not a number.
interface IdentifyResult {
  speciesName: string | null
  confidence: 'high' | 'medium' | 'low'
}

const MODES: Array<{ key: CameraMode; label: string }> = [
  { key: 'snap',     label: 'Snap' },
  { key: 'diagnose', label: 'Diagnose' },
  { key: 'identify', label: 'Identify' },
]

// Per-mode framing hint shown above the capture guide.
const MODE_HINTS: Record<CameraMode, string> = {
  snap:     'Frame your plant',
  diagnose: 'Frame the problem area',
  identify: 'Frame the whole plant',
}

export default function CameraPage() {
  const router   = useRouter()
  const supabase = createClient()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage,          setStage]          = useState<Stage>('ready')
  const [mode,           setMode]           = useState<CameraMode>('snap')
  const [photoFile,      setPhotoFile]      = useState<File | null>(null)
  const [photoPreview,   setPhotoPreview]   = useState<string | null>(null)
  const [plants,         setPlants]         = useState<Plant[]>([])
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [pickerOpen,     setPickerOpen]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null)
  const [identifySaving, setIdentifySaving] = useState(false)

  // ── Load the user's plants ──────────────────────────────────────────────
  const loadPlants = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .from('plants')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(PICKER_LIMIT)

    const loaded = (data ?? []) as Plant[]
    setPlants(loaded)

    // Best-guess heuristic:
    //   1. Plant last photographed via this camera screen (localStorage)
    //   2. First plant in the list (most recently created)
    //   3. null (user has no plants)
    const lastUsedId = typeof window !== 'undefined'
      ? localStorage.getItem(LAST_CAMERA_PLANT_KEY)
      : null
    const bestGuess = loaded.find(p => p.id === lastUsedId) ?? loaded[0] ?? null
    setSelectedId(bestGuess?.id ?? null)
  }, [supabase])

  useEffect(() => { loadPlants() }, [loadPlants])

  // ── Photo selection ─────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
    if (mode === 'identify') {
      void runIdentify(file)   // no plant confirm needed — straight to the AI
    } else {
      setStage('selected')     // Snap + Diagnose share the confirm sheet
    }
    // Clear the input so re-selecting the same photo (after "Retake") still
    // fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function triggerCamera() {
    fileInputRef.current?.click()
  }

  // Back to the ready screen, dropping the captured photo.
  function resetCapture() {
    setStage('ready')
    setPhotoFile(null)
    setPhotoPreview(null)
    setIdentifyResult(null)
    setError(null)
  }

  // Map the file's MIME type to a storage extension — same mapping the
  // Diagnose screen uses for session photos (more reliable than the filename,
  // which mobile cameras often omit).
  function extFor(file: File): string {
    return file.type === 'image/webp' ? 'webp'
         : file.type === 'image/png'  ? 'png'
         : file.type === 'image/gif'  ? 'gif'
         : 'jpg'
  }

  // ── Confirm: upload photo and navigate to plant ─────────────────────────
  async function handleConfirm() {
    if (!photoFile || !selectedId) return
    setStage('uploading')
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')

      const ext  = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${session.user.id}/${selectedId}/${Date.now()}.${ext}`

      // Upload to Supabase Storage (using arrayBuffer — reliable on web)
      const buffer = await photoFile.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(path, buffer, { contentType: photoFile.type })
      if (uploadError) throw uploadError

      // Insert photos row
      const { error: dbError } = await supabase
        .from('photos')
        .insert({ plant_id: selectedId, user_id: session.user.id, storage_path: path })
      if (dbError) throw dbError

      // Remember for next best-guess
      localStorage.setItem(LAST_CAMERA_PLANT_KEY, selectedId)

      // Navigate to the plant — the user can run AI analysis from there.
      router.push(`/plant/${selectedId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setStage('selected')
    }
  }

  // ── Diagnose mode: upload as a session opener and hand off ──────────────
  // The photo goes under the diagnosis session-photo path convention
  // ({userId}/{plantId}/diagnosis/{folder}/…) with NO photos row — exactly how
  // the Diagnose screen uploads its own session photos. The diagnose-plant
  // function only accepts paths under this prefix, so nothing changes
  // server-side. The Diagnose screen reads the sessionStorage handoff on load
  // and opens the examination with this photo as the opening turn.
  async function handleDiagnoseConfirm() {
    if (!photoFile || !selectedId) return
    setStage('uploading')
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')

      const path = `${session.user.id}/${selectedId}/diagnosis/${crypto.randomUUID()}/${Date.now()}.${extFor(photoFile)}`
      const buffer = await photoFile.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(path, buffer, { contentType: photoFile.type })
      if (uploadError) throw uploadError

      sessionStorage.setItem(
        CAMERA_DIAGNOSE_HANDOFF_KEY,
        JSON.stringify({ plantId: selectedId, photoPath: path })
      )
      localStorage.setItem(LAST_CAMERA_PLANT_KEY, selectedId)
      router.push(`/plant/${selectedId}/diagnose`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setStage('selected')
    }
  }

  // ── Identify mode: base64 → identify-species (no storage) ───────────────
  async function runIdentify(file: File) {
    setStage('identifying')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const base64 = await fileToBase64(file)
      const { data, error: fnError } = await supabase.functions.invoke('identify-species', {
        body: { imageBase64: base64, mimeType: file.type },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (fnError || data?.error) {
        throw new Error('Could not identify the species — try another photo.')
      }
      setIdentifyResult({
        speciesName: data?.speciesName ?? null,
        confidence: data?.confidence === 'high' || data?.confidence === 'medium' ? data.confidence : 'low',
      })
      setStage('identified')
    } catch (err) {
      setIdentifyResult(null)
      setError(err instanceof Error ? err.message : 'Identification failed — try again.')
      setStage('identified')   // the result sheet shows the error + retake
    }
  }

  // Confirm the AI name for an existing plant — the same owner assertion as
  // Add Plant's Confirm chip and the manual species edit, so it sets
  // is_name_verified (Phase 5 identity rule).
  async function handleIdentifyConfirm() {
    if (!identifyResult?.speciesName || !selectedId || identifySaving) return
    setIdentifySaving(true)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('plants')
        .update({ species: identifyResult.speciesName, is_name_verified: true })
        .eq('id', selectedId)
      if (updateError) throw updateError
      localStorage.setItem(LAST_CAMERA_PLANT_KEY, selectedId)
      router.push(`/plant/${selectedId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the species.')
      setIdentifySaving(false)
    }
  }

  // ── "New plant" path: hand off to add-plant with the photo pre-loaded ───
  function handleNewPlant() {
    // add-plant doesn't support a pre-loaded file yet. Navigate there and let
    // the user re-take the photo in the wizard.
    router.push('/add-plant')
  }

  // Identify mode's "Add as new plant": pre-fill the wizard with the AI name
  // via the same ?species= mechanism Explore's "I have one" uses (lands on
  // step 2 with the name set; saved names are verified by the wizard's rule).
  function handleIdentifyNewPlant() {
    const name = identifyResult?.speciesName
    router.push(name ? `/add-plant?species=${encodeURIComponent(name)}` : '/add-plant')
  }

  const selectedPlant = plants.find(p => p.id === selectedId) ?? null

  // Best-guess plant selector — shared by the Snap/Diagnose confirm sheet and
  // the Identify result sheet.
  function renderPlantPicker() {
    if (plants.length === 0) {
      return (
        <div className="text-sm text-ink-soft mb-4">
          No plants in your collection yet.
        </div>
      )
    }
    return (
      <div className="mb-4">
        {/* Currently selected plant */}
        <button
          onClick={() => setPickerOpen(p => !p)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-rule bg-card"
        >
          {selectedPlant ? (
            <>
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-rule flex-shrink-0">
                <PlantPhoto name={selectedPlant.nickname} showLabel={false} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-serif italic text-[17px] text-ink leading-tight">
                  {selectedPlant.nickname}
                </div>
                {selectedPlant.species && (
                  <div className="text-[11px] text-ink-soft mt-0.5">{selectedPlant.species}</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 text-left text-ink-soft text-sm">Choose a plant…</div>
          )}
          <Icon name="chev-down" size={16} className="text-ink-muted flex-shrink-0" />
        </button>

        {/* Expanded picker */}
        {pickerOpen && (
          <div className="mt-1 rounded-xl border border-rule bg-card overflow-hidden">
            {plants.map(plant => (
              <button
                key={plant.id}
                onClick={() => { setSelectedId(plant.id); setPickerOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-paper-alt transition-colors border-b border-rule last:border-b-0"
              >
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-rule flex-shrink-0">
                  <PlantPhoto name={plant.nickname} showLabel={false} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-serif italic text-[15px] text-ink">{plant.nickname}</div>
                </div>
                {plant.id === selectedId && (
                  <Icon name="check" size={14} className="text-accent" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0A0B0A] flex flex-col" style={{ zIndex: 60 }}>

      {/* Hidden file input — triggered on button click */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Top chrome */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 z-10">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}
          aria-label="Close camera"
        >
          <Icon name="close" size={18} className="text-white" stroke={2} />
        </button>

        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] tracking-[1.6px] uppercase text-white"
          style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          AI Vision
        </div>

        {/* Spacer to balance the layout */}
        <div className="w-10" />
      </div>

      {/* ── READY STAGE — before photo is chosen ── */}
      {stage === 'ready' && (
        <>
          {/* Background hint — gradient blobs suggesting life */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, #4C6A48, transparent)' }} />
            <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #B9C9A8, transparent)' }} />
          </div>

          {/* Framing guide */}
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="relative w-64 h-64">
              {/* Corner brackets */}
              {[
                'top-0 left-0 border-t-2 border-l-2',
                'top-0 right-0 border-t-2 border-r-2',
                'bottom-0 left-0 border-b-2 border-l-2',
                'bottom-0 right-0 border-b-2 border-r-2',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-5 h-5 border-white/60 rounded-sm ${cls}`} />
              ))}
              <div className="absolute inset-0 border border-white/20 rounded-xl" />

              {/* Hint text */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap
                px-3 py-2 rounded-full text-[12px] font-sans font-medium text-ink
                flex items-center gap-1.5"
                style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)' }}
              >
                <Icon name="leaf" size={13} className="text-accent" stroke={2} />
                {MODE_HINTS[mode]}
              </div>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="pb-16 flex flex-col items-center gap-5">
            {/* Mode pills — pick what the capture will do (v1.10.0) */}
            <div className="flex gap-2">
              {MODES.map(({ key, label }) => (
                <button key={key} onClick={() => setMode(key)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-sans font-medium"
                  style={{
                    background: mode === key ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.15)',
                    color: mode === key ? '#1F2A24' : '#fff',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Shutter row */}
            <div className="flex items-center justify-around w-full px-10">
              {/* Recent plant thumbnail */}
              {selectedPlant ? (
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/20">
                  <PlantPhoto name={selectedPlant.nickname} showLabel={false} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }} />
              )}

              {/* Shutter button */}
              <button
                onClick={triggerCamera}
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.25)', padding: 3 }}
                aria-label="Take photo"
              >
                <div className="w-full h-full rounded-full bg-white" />
              </button>

              {/* Flip camera placeholder */}
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}>
                <Icon name="move" size={20} className="text-white" stroke={1.8} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SELECTED / UPLOADING STAGE — confirm sheet ── */}
      {(stage === 'selected' || stage === 'uploading') && photoPreview && (
        <>
          {/* Photo preview as background */}
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Captured plant" className="w-full h-full object-cover" />
            {/* Darken bottom so sheet reads clearly */}
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
          </div>

          {/* Confirm sheet — slides up from bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-[28px] overflow-hidden"
            style={{ background: '#F4EFE6' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-rule" />
            </div>

            <div className="px-5 pb-10 pt-2">
              {/* Header — copy depends on what the capture will do */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-mono text-[9px] tracking-[1.6px] uppercase text-ink-muted mb-1">
                    {mode === 'diagnose' ? 'Photo ready' : 'Photo saved'}
                  </div>
                  <h2 className="font-serif text-[28px] leading-tight text-ink">
                    {mode === 'diagnose' ? 'Examine which plant?' : 'Which plant is this?'}
                  </h2>
                </div>
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-rule flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                </div>
              </div>

              {/* Best-guess selector */}
              {renderPlantPicker()}

              {/* Error */}
              {error && (
                <div className="text-danger text-sm mb-3">{error}</div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                {/* Confirm button — Snap saves a journal photo; Diagnose opens
                    an AI examination with this photo as the opening turn */}
                <button
                  onClick={mode === 'diagnose' ? handleDiagnoseConfirm : handleConfirm}
                  disabled={!selectedId || stage === 'uploading'}
                  className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-paper bg-ink
                    disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {stage === 'uploading' ? (
                    <>
                      <span className="w-4 h-4 border-2 border-paper/40 border-t-paper rounded-full animate-spin" />
                      {mode === 'diagnose' ? 'Preparing examination…' : 'Saving…'}
                    </>
                  ) : mode === 'diagnose' ? (
                    <>
                      <Icon name="sparkle" size={16} className="text-paper" stroke={2} />
                      {selectedPlant ? `Examine ${selectedPlant.nickname}` : 'Examine with AI'}
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={16} className="text-paper" stroke={2} />
                      {selectedPlant ? `Save to ${selectedPlant.nickname}` : 'Save photo'}
                    </>
                  )}
                </button>

                {/* New plant option — Snap only (an examination needs an
                    existing plant's history to be useful) */}
                {mode === 'snap' && (
                  <button
                    onClick={handleNewPlant}
                    disabled={stage === 'uploading'}
                    className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-ink
                      border border-rule bg-transparent disabled:opacity-40"
                  >
                    This is a new plant
                  </button>
                )}

                {/* Retake */}
                <button
                  onClick={resetCapture}
                  disabled={stage === 'uploading'}
                  className="text-center text-[13px] text-ink-soft py-1 disabled:opacity-40"
                >
                  Retake photo
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── IDENTIFYING / IDENTIFIED STAGE — AI result sheet (Identify mode) ── */}
      {(stage === 'identifying' || stage === 'identified') && photoPreview && (
        <>
          {/* Photo preview as background */}
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Captured plant" className="w-full h-full object-cover" />
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)' }} />
          </div>

          {/* Result sheet */}
          <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-[28px] overflow-hidden"
            style={{ background: '#F4EFE6' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-rule" />
            </div>

            <div className="px-5 pb-10 pt-2">
              {stage === 'identifying' ? (
                <div className="flex items-center gap-2.5 py-6">
                  <Icon name="sparkle" size={18} stroke={1.9} className="text-accent animate-pulse" />
                  <span className="text-sm text-ink-soft">Identifying species…</span>
                </div>
              ) : identifyResult?.speciesName ? (
                <>
                  {/* Header — the AI's match */}
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="inline-flex items-center gap-1.5">
                      <Icon name="sparkle" size={14} stroke={1.9} className="text-accent" />
                      <span className="text-[11px] text-accent font-semibold uppercase tracking-[0.1em]">
                        Match found · {identifyResult.confidence} confidence
                      </span>
                    </div>
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-rule flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <h2 className="font-serif italic text-[26px] leading-tight text-ink mb-1">
                    {identifyResult.speciesName}
                  </h2>
                  {/* Phase 5 identity rule, same microcopy stance as Add Plant:
                      this is the AI's guess until the owner asserts it. */}
                  <div className="mb-4 font-mono text-[9px] tracking-[0.1em] uppercase text-ink-muted">
                    AI-identified — confirming saves it as verified
                  </div>

                  {/* Which plant gets this name? */}
                  {renderPlantPicker()}

                  {/* Error */}
                  {error && (
                    <div className="text-danger text-sm mb-3">{error}</div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-2.5">
                    {plants.length > 0 && (
                      <button
                        onClick={handleIdentifyConfirm}
                        disabled={!selectedId || identifySaving}
                        className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-paper bg-ink
                          disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {identifySaving ? (
                          <>
                            <span className="w-4 h-4 border-2 border-paper/40 border-t-paper rounded-full animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Icon name="check" size={16} className="text-paper" stroke={2} />
                            {selectedPlant ? `Confirm for ${selectedPlant.nickname}` : 'Confirm species'}
                          </>
                        )}
                      </button>
                    )}

                    {/* New plant — pre-fills the wizard with the AI name */}
                    <button
                      onClick={handleIdentifyNewPlant}
                      disabled={identifySaving}
                      className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-ink
                        border border-rule bg-transparent disabled:opacity-40"
                    >
                      Add as new plant
                    </button>

                    {/* Retake */}
                    <button
                      onClick={resetCapture}
                      disabled={identifySaving}
                      className="text-center text-[13px] text-ink-soft py-1 disabled:opacity-40"
                    >
                      Retake photo
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* No match / failure */}
                  <h2 className="font-serif text-[26px] leading-tight text-ink mb-1.5">
                    No match.
                  </h2>
                  <p className="text-sm text-ink-soft mb-4">
                    {error ?? 'That photo didn’t show a plant the AI could recognize — try framing the whole plant in good light.'}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={resetCapture}
                      className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-paper bg-ink"
                    >
                      Retake photo
                    </button>
                    <button
                      onClick={handleIdentifyNewPlant}
                      className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-ink
                        border border-rule bg-transparent"
                    >
                      Add a plant manually
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
