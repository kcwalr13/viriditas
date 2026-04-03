'use client'
// app/(app)/MyPlantsClient.tsx
// Client component for the My Plants screen.
// Receives pre-fetched, enriched plant data from the Server Component (page.tsx).
import Link from 'next/link'
import Image from 'next/image'
import type { PlantCard } from './page'

interface Props {
  cards: PlantCard[]
  streak: number
}

export default function MyPlantsClient({ cards, streak }: Props) {
  const overdueCount  = cards.filter(c => c.wateringStatus === 'overdue').length
  const dueSoonCount  = cards.filter(c => c.wateringStatus === 'due-soon').length
  const hasReminders  = cards.some(c => c.wateringStatus !== 'unset')

  return (
    <div className="px-4 pt-6 pb-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">My Plants</h1>

        {/* Care streak chip */}
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-brand-bg text-brand text-sm font-medium rounded-full">
            {streak === 1 ? '🌿 Today' : `🔥 ${streak}-day streak`}
          </span>
        )}
      </div>

      {/* ── Attention banners ─────────────────────────────────────────── */}
      {overdueCount > 0 && (
        <div className="mb-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 font-medium">
          🚨 {overdueCount} {overdueCount === 1 ? 'plant needs' : 'plants need'} water now
        </div>
      )}
      {dueSoonCount > 0 && (
        <div className="mb-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700 font-medium">
          💧 {dueSoonCount} {dueSoonCount === 1 ? 'plant is' : 'plants are'} due for water soon
        </div>
      )}
      {hasReminders && overdueCount === 0 && dueSoonCount === 0 && (
        <div className="mb-2 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
          ✅ All caught up! Every plant is watered.
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-6xl mb-4">🌱</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Welcome to Viriditas</h2>
          <p className="text-sm text-gray-500 max-w-xs mb-8">
            Your personal plant companion. Add a plant to get started.
          </p>

          {/* Feature highlights — show the three main value props */}
          <div className="w-full max-w-xs space-y-3 mb-8 text-left">
            <div className="flex items-start gap-3 bg-brand-bg rounded-xl px-4 py-3">
              <span className="text-xl mt-0.5">📸</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">AI plant analysis</p>
                <p className="text-xs text-gray-500">Snap a photo for species ID and health tips</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-brand-bg rounded-xl px-4 py-3">
              <span className="text-xl mt-0.5">💧</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">Care tracking</p>
                <p className="text-xs text-gray-500">Log watering, fertilizing, and more — see your history</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-brand-bg rounded-xl px-4 py-3">
              <span className="text-xl mt-0.5">📖</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">Species guides</p>
                <p className="text-xs text-gray-500">Detailed care profiles for any houseplant</p>
              </div>
            </div>
          </div>

          <Link
            href="/add-plant"
            className="bg-brand text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-light transition-colors"
          >
            Add Your First Plant
          </Link>
        </div>
      )}

      {/* ── Plant grid ───────────────────────────────────────────────── */}
      {cards.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {cards.map(({ plant, coverPhotoUrl, wateringStatus }) => (
              <Link
                key={plant.id}
                href={`/plant/${plant.id}`}
                className="group block relative rounded-2xl overflow-hidden bg-gray-100 aspect-square shadow-sm active:scale-95 transition-transform"
              >
                {/* Cover photo */}
                {coverPhotoUrl ? (
                  <Image
                    src={coverPhotoUrl}
                    alt={plant.nickname}
                    fill
                    sizes="(max-width: 640px) 50vw, 300px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-4xl bg-brand-bg">
                    🪴
                  </div>
                )}

                {/* Gradient overlay at bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Plant name */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-sm font-semibold leading-tight truncate">
                    {plant.nickname}
                  </p>
                  {plant.species && (
                    <p className="text-white/70 text-xs truncate">{plant.species}</p>
                  )}
                </div>

                {/* Watering status badge */}
                {wateringStatus !== 'unset' && (
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={wateringStatus} />
                  </div>
                )}
              </Link>
            ))}
          </div>

          {/* Add Plant button below grid */}
          <div className="mt-4 flex justify-end">
            <Link
              href="/add-plant"
              className="bg-brand text-white font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-brand-light transition-colors shadow-sm"
            >
              + Add Plant
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

// Colored dot badge for watering status
function StatusBadge({ status }: { status: 'overdue' | 'due-soon' | 'good' }) {
  const styles = {
    overdue:   'bg-red-500',
    'due-soon': 'bg-amber-400',
    good:      'bg-green-400',
  }
  const labels = {
    overdue:   'Overdue',
    'due-soon': 'Due soon',
    good:      'Good',
  }
  return (
    <span
      className={`block w-3 h-3 rounded-full ${styles[status]} ring-2 ring-white shadow`}
      title={labels[status]}
    />
  )
}
