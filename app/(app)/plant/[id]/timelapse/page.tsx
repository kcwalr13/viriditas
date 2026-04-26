'use client'
// app/(app)/plant/[id]/timelapse/page.tsx
// Growth history as a scrubbable photo filmstrip.
//
// Loads all photos for the plant from the `photos` table, ordered
// oldest-first, and lets the user scrub through them to see how the
// plant has changed over time. A play button auto-advances the frames.
//
// Entry: Plant Detail → "Time-lapse" button in the actions area.
// Exit: back arrow → returns to plant detail.

import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Icon } from '@/components/Icon'
import { PlantPhoto } from '@/components/PlantPhoto'
import { formatDate } from '@/lib/utils'
import type { Plant, PlantPhoto as PlantPhotoType } from '@/lib/types'

// Milliseconds per frame when playing.
const PLAY_INTERVAL_MS = 700

export default function TimelapsePage() {
  const params   = useParams<{ id: string }>()
  const router   = useRouter()
  const supabase = createClient()
  const id       = params.id

  const [plant,   setPlant]   = useState<Plant | null>(null)
  const [photos,  setPhotos]  = useState<PlantPhotoType[]>([])
  const [loading, setLoading] = useState(true)
  const [frameIdx, setFrameIdx] = useState(0)
  const [playing,  setPlaying]  = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Load data ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data: plantRow } = await supabase
      .from('plants')
      .select('*')
      .eq('id', id)
      .single()
    setPlant(plantRow as Plant | null)

    // Photos ordered oldest-first so the filmstrip is chronological.
    const { data: photoRows } = await supabase
      .from('photos')
      .select('*')
      .eq('plant_id', id)
      .order('created_at', { ascending: true })
    const loaded = (photoRows ?? []) as PlantPhotoType[]
    setPhotos(loaded)
    // Start on the most recent frame.
    setFrameIdx(Math.max(0, loaded.length - 1))
    setLoading(false)
  }, [supabase, id])

  useEffect(() => { load() }, [load])

  // ── Play/pause auto-advance ─────────────────────────────────────────────
  useEffect(() => {
    if (playing && photos.length > 0) {
      intervalRef.current = setInterval(() => {
        setFrameIdx(i => {
          if (i >= photos.length - 1) {
            setPlaying(false)
            return i
          }
          return i + 1
        })
      }, PLAY_INTERVAL_MS)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, photos.length])

  // ── Derived values ──────────────────────────────────────────────────────
  function getPhotoUrl(photo: PlantPhotoType): string {
    return supabase.storage.from('plant-photos').getPublicUrl(photo.storage_path).data.publicUrl
  }

  // Days from first to last photo.
  function spanDays(): number {
    if (photos.length < 2) return 0
    const first = new Date(photos[0].created_at).getTime()
    const last  = new Date(photos[photos.length - 1].created_at).getTime()
    return Math.round((last - first) / (1000 * 60 * 60 * 24))
  }

  const frame    = photos[frameIdx]
  const frameUrl = frame ? getPhotoUrl(frame) : null
  const totalFrames = photos.length

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-rule border-t-ink rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col pb-10">

      {/* Top chrome */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-card border border-rule"
          aria-label="Back"
        >
          <Icon name="back" size={18} className="text-ink" />
        </button>
        <div className="font-mono text-[10px] tracking-[1.6px] uppercase text-ink-muted">
          Time-lapse · {plant?.nickname ?? '…'}
        </div>
        <div className="w-10" />
      </div>

      {/* Header */}
      <div className="px-5 pt-3 pb-2">
        <h1 className="font-serif text-[28px] leading-tight text-ink italic">
          {totalFrames} {totalFrames === 1 ? 'photo' : 'photos'}
          {spanDays() > 0 && ` · ${spanDays()} days`}
        </h1>
        <p className="text-[13px] text-ink-soft mt-1.5 leading-snug">
          Every photo of {plant?.nickname ?? 'this plant'}, stitched into a growth story.
        </p>
      </div>

      {totalFrames === 0 ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4 py-16">
          <div className="w-14 h-14 rounded-full bg-card border border-rule flex items-center justify-center">
            <Icon name="camera" size={22} className="text-ink-muted" />
          </div>
          <div>
            <p className="font-serif italic text-[17px] text-ink">No photos yet.</p>
            <p className="text-[13px] text-ink-soft mt-1">
              Add photos from the plant detail page to start building a time-lapse.
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="mt-2 px-5 py-2.5 rounded-full border border-rule text-[13px] font-medium text-ink"
          >
            Back to {plant?.nickname ?? 'plant'}
          </button>
        </div>
      ) : (
        <>
          {/* Main stage */}
          <div className="mx-5 mt-2 rounded-[22px] overflow-hidden border border-rule relative"
            style={{ aspectRatio: '1 / 1.05', background: '#000' }}
          >
            {frameUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={frameUrl}
                alt={`Frame ${frameIdx + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <PlantPhoto name={plant?.nickname ?? ''} showLabel={false} />
            )}

            {/* Gradient overlay for caption legibility */}
            <div className="absolute bottom-0 left-0 right-0 pt-10 pb-3 px-4"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)' }}
            >
              <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-white/80">
                Frame {frameIdx + 1} / {totalFrames} · {frame ? formatDate(frame.created_at) : ''}
              </div>
            </div>

            {/* Leaf count chip (from AI analysis if available — placeholder for now) */}
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full font-mono text-[10px] tracking-wide text-ink"
              style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)' }}
            >
              {frameIdx + 1} / {totalFrames}
            </div>
          </div>

          {/* Filmstrip */}
          <div className="px-5 mt-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1 vr-scroll">
              {photos.map((photo, i) => {
                const url = getPhotoUrl(photo)
                return (
                  <button
                    key={photo.id}
                    onClick={() => { setFrameIdx(i); setPlaying(false) }}
                    className="flex-shrink-0 rounded-[6px] overflow-hidden transition-all"
                    style={{
                      width: 44, height: 56,
                      border: i === frameIdx
                        ? '2px solid #4C6A48'
                        : '1px solid #D9D0BD',
                    }}
                    aria-label={`Frame ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Scrubber + play/pause */}
          <div className="px-5 mt-4 flex items-center gap-3">
            {/* Play/pause button */}
            <button
              onClick={() => {
                if (frameIdx >= totalFrames - 1) setFrameIdx(0)
                setPlaying(p => !p)
              }}
              className="w-11 h-11 rounded-full bg-ink flex items-center justify-center flex-shrink-0"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                /* Pause icon — two vertical bars */
                <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                  <rect x="2" y="2" width="3" height="12" rx="1" fill="#F4EFE6" />
                  <rect x="9" y="2" width="3" height="12" rx="1" fill="#F4EFE6" />
                </svg>
              ) : (
                /* Play icon — triangle */
                <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                  <path d="M2 1.5L13 8L2 14.5V1.5Z" fill="#F4EFE6" />
                </svg>
              )}
            </button>

            {/* Range scrubber */}
            <input
              type="range"
              min={0}
              max={Math.max(0, totalFrames - 1)}
              value={frameIdx}
              onChange={e => { setFrameIdx(Number(e.target.value)); setPlaying(false) }}
              className="flex-1"
              style={{ accentColor: '#4C6A48' }}
            />
          </div>

          {/* Stats summary */}
          <div className="mx-5 mt-5 p-4 bg-card border border-rule rounded-[14px]">
            <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink-muted mb-3">
              § — The story so far
            </div>
            <div className="grid grid-cols-3 gap-4">
              <StatCell label="Days" value={spanDays() > 0 ? String(spanDays()) : '—'} />
              <StatCell label="Photos" value={String(totalFrames)} />
              <StatCell label="First seen" value={photos[0] ? new Date(photos[0].created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[1px] uppercase text-ink-muted">{label}</div>
      <div className="font-serif italic text-[22px] text-ink leading-tight mt-0.5">{value}</div>
    </div>
  )
}
