// app/(app)/page.tsx
// My Plants screen — the home screen of the app.
// Server Component: fetches all plant data from Supabase, then passes it to
// the client component for rendering and interactivity.
import { createClient } from '@/lib/supabase/server'
import { computeStreak, computeWateringStatus, URGENCY_ORDER } from '@/lib/utils'
import type { CareLog, Plant, PlantPhoto } from '@/lib/types'
import MyPlantsClient from './MyPlantsClient'

// The enriched data shape we build server-side and pass to the client.
export type PlantCard = {
  plant: Plant
  coverPhotoUrl: string | null
  wateringStatus: ReturnType<typeof computeWateringStatus>
  lastWateredLog: CareLog | null
}

export default async function MyPlantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // ── Fetch plants ───────────────────────────────────────────────────────────
  const { data: plants } = await supabase
    .from('plants')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (!plants || plants.length === 0) {
    return <MyPlantsClient cards={[]} streak={0} />
  }

  const plantIds = plants.map(p => p.id)

  // ── Fetch cover photos (most recent per plant) ─────────────────────────────
  const { data: photos } = await supabase
    .from('photos')
    .select('*')
    .in('plant_id', plantIds)
    .order('created_at', { ascending: false })

  // ── Fetch care logs for watering status + streak ──────────────────────────
  const { data: careLogs } = await supabase
    .from('care_logs')
    .select('*')
    .in('plant_id', plantIds)
    .order('logged_at', { ascending: false })

  // ── Build lookup maps (first hit per plant_id = most recent) ──────────────
  const coverPhotoMap = new Map<string, PlantPhoto>()
  const lastWateredMap = new Map<string, CareLog>()

  for (const photo of (photos ?? [])) {
    if (!coverPhotoMap.has(photo.plant_id)) coverPhotoMap.set(photo.plant_id, photo)
  }
  for (const log of (careLogs ?? [])) {
    if (log.type === 'watered' && !lastWateredMap.has(log.plant_id)) {
      lastWateredMap.set(log.plant_id, log)
    }
  }

  // ── Build public URLs for cover photos ────────────────────────────────────
  function getPhotoUrl(path: string): string {
    const { data } = supabase.storage.from('plant-photos').getPublicUrl(path)
    return data.publicUrl
  }

  // ── Build enriched card array ─────────────────────────────────────────────
  const cards: PlantCard[] = plants.map(plant => {
    const coverPhoto = coverPhotoMap.get(plant.id)
    const lastWateredLog = lastWateredMap.get(plant.id) ?? null
    return {
      plant,
      coverPhotoUrl: coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : null,
      wateringStatus: computeWateringStatus(plant.watering_interval_days, lastWateredLog),
      lastWateredLog,
    }
  })

  // Sort by urgency (overdue first, then due-soon, good, unset)
  cards.sort((a, b) => URGENCY_ORDER[a.wateringStatus] - URGENCY_ORDER[b.wateringStatus])

  // ── Compute care streak across all plants ─────────────────────────────────
  // Fetch all care logs from the past year for streak computation.
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const { data: streakLogs } = await supabase
    .from('care_logs')
    .select('logged_at')
    .eq('user_id', user.id)
    .gte('logged_at', oneYearAgo.toISOString())

  const streak = computeStreak((streakLogs ?? []).map(l => l.logged_at))

  return <MyPlantsClient cards={cards} streak={streak} />
}
