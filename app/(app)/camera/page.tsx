'use client'
// app/(app)/camera/page.tsx
// Camera-first capture screen. The FAB on every (app) screen routes here.
//
// Flow:
//   1. User arrives → sees "Ready" screen with a large capture button.
//   2. User taps → device camera opens (capture="environment" on mobile;
//      file picker on desktop).
//   3. After photo selection → confirm sheet slides up with:
//      - Photo preview
//      - Best-guess plant (heuristic: last used in camera → first plant → none)
//      - Plant picker so they can correct the guess
//      - "This is a new plant" option → /add-plant
//   4. On confirm → upload to Supabase Storage + photos table, then navigate
//      to the plant's detail page so the user can run analysis if they want.
//
// NOTE: The HANDOFF.md spec also calls for logging a care_logs row of type
// 'photo' on confirm. That requires adding 'photo' to the care_logs_type_check
// constraint first. See the Supabase SQL migration in CLAUDE.md. Skipped here
// until the migration is confirmed run.

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import type { Plant } from '@/lib/types'

// How many recent plants to show in the picker before truncating.
const PICKER_LIMIT = 6

// localStorage key for remembering which plant was last used via camera.
const LAST_CAMERA_PLANT_KEY = 'viriditas.lastCameraPlant'

type Stage = 'ready' | 'selected' | 'uploading'

export default function CameraPage() {
  const router   = useRouter()
  const supabase = createClient()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage,          setStage]         = useState<Stage>('ready')
  const [photoFile,      setPhotoFile]      = useState<File | null>(null)
  const [photoPreview,   setPhotoPreview]   = useState<string | null>(null)
  const [plants,         setPlants]         = useState<Plant[]>([])
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [pickerOpen,     setPickerOpen]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)

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
    setStage('selected')
    setError(null)
  }

  function triggerCamera() {
    fileInputRef.current?.click()
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

  // ── "New plant" path: hand off to add-plant with the photo pre-loaded ───
  function handleNewPlant() {
    // add-plant doesn't support a pre-loaded file yet. Navigate there and let
    // the user re-take the photo in the wizard.
    router.push('/add-plant')
  }

  const selectedPlant = plants.find(p => p.id === selectedId) ?? null

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
                Frame your plant
              </div>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="pb-16 flex flex-col items-center gap-5">
            {/* Mode pills */}
            <div className="flex gap-2">
              {['Snap', 'Diagnose', 'Identify'].map((m, i) => (
                <div key={m} className="px-3 py-1.5 rounded-full text-[11px] font-sans font-medium"
                  style={{
                    background: i === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.15)',
                    color: i === 0 ? '#1F2A24' : '#fff',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  {m}
                </div>
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
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-mono text-[9px] tracking-[1.6px] uppercase text-ink-muted mb-1">
                    Photo saved
                  </div>
                  <h2 className="font-serif text-[28px] leading-tight text-ink">
                    Which plant is this?
                  </h2>
                </div>
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-rule flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                </div>
              </div>

              {/* Best-guess selector */}
              {plants.length === 0 ? (
                <div className="text-sm text-ink-soft mb-4">
                  No plants in your collection yet.
                </div>
              ) : (
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
              )}

              {/* Error */}
              {error && (
                <div className="text-danger text-sm mb-3">{error}</div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                {/* Confirm button */}
                <button
                  onClick={handleConfirm}
                  disabled={!selectedId || stage === 'uploading'}
                  className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-paper bg-ink
                    disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {stage === 'uploading' ? (
                    <>
                      <span className="w-4 h-4 border-2 border-paper/40 border-t-paper rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Icon name="check" size={16} className="text-paper" stroke={2} />
                      {selectedPlant ? `Save to ${selectedPlant.nickname}` : 'Save photo'}
                    </>
                  )}
                </button>

                {/* New plant option */}
                <button
                  onClick={handleNewPlant}
                  disabled={stage === 'uploading'}
                  className="w-full py-3 rounded-full font-sans font-medium text-[14px] text-ink
                    border border-rule bg-transparent disabled:opacity-40"
                >
                  This is a new plant
                </button>

                {/* Retake */}
                <button
                  onClick={() => { setStage('ready'); setPhotoFile(null); setPhotoPreview(null) }}
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
    </div>
  )
}
