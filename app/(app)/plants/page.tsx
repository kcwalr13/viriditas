// app/(app)/plants/page.tsx
// Plants — the full collection. Fetched server-side; rendered as a grid or
// list with optional groupings (all / by location / by status). Same data
// shape as the Today screen so both stay in sync.
import { createClient } from '@/lib/supabase/server'
import { computeWateringStatus, computeFertilizingStatus, URGENCY_ORDER } from '@/lib/utils'
import type { CareLog, Plant, PlantPhoto } from '@/lib/types'
import PlantsClient from './PlantsClient'

export type PlantCard = {
  plant: Plant
  coverPhotoUrl: string | null
  wateringStatus: ReturnType<typeof computeWateringStatus>
  fertilizingStatus: ReturnType<typeof computeFertilizingStatus>
  lastWateredLog: CareLog | null
  lastFertilizedLog: CareLog | null
  daysSinceWatered: number | null
  daysSinceFertilized: number | null
}

export default async function PlantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: plants } = await supabase
    .from('plants')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (!plants || plants.length === 0) {
    return <PlantsClient cards={[]} />
  }

  const plantIds = plants.map(p => p.id)

  const [{ data: photos }, { data: careLogs }] = await Promise.all([
    supabase.from('photos')
      .select('*')
      .in('plant_id', plantIds)
      .order('created_at', { ascending: false }),
    // Fetch both watered and fertilized logs in one query
    supabase.from('care_logs')
      .select('*')
      .in('plant_id', plantIds)
      .in('type', ['watered', 'fertilized'])
      .order('logged_at', { ascending: false }),
  ])

  const coverPhotoMap    = new Map<string, PlantPhoto>()
  const lastWateredMap   = new Map<string, CareLog>()
  const lastFertilizedMap = new Map<string, CareLog>()

  for (const photo of photos ?? []) {
    if (!coverPhotoMap.has(photo.plant_id)) coverPhotoMap.set(photo.plant_id, photo)
  }
  for (const log of careLogs ?? []) {
    if (log.type === 'watered'    && !lastWateredMap.has(log.plant_id))   lastWateredMap.set(log.plant_id, log)
    if (log.type === 'fertilized' && !lastFertilizedMap.has(log.plant_id)) lastFertilizedMap.set(log.plant_id, log)
  }

  function getPhotoUrl(path: string): string {
    return supabase.storage.from('plant-photos').getPublicUrl(path).data.publicUrl
  }

  const cards: PlantCard[] = plants.map(plant => {
    const coverPhoto         = coverPhotoMap.get(plant.id)
    const lastWateredLog     = lastWateredMap.get(plant.id) ?? null
    const lastFertilizedLog  = lastFertilizedMap.get(plant.id) ?? null
    const daysSinceWatered   = lastWateredLog
      ? Math.floor((Date.now() - new Date(lastWateredLog.logged_at).getTime()) / 86_400_000)
      : null
    const daysSinceFertilized = lastFertilizedLog
      ? Math.floor((Date.now() - new Date(lastFertilizedLog.logged_at).getTime()) / 86_400_000)
      : null
    return {
      plant,
      coverPhotoUrl: coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : null,
      wateringStatus:    computeWateringStatus(plant.watering_interval_days, lastWateredLog),
      fertilizingStatus: computeFertilizingStatus(plant.fertilizing_interval_days, lastFertilizedLog),
      lastWateredLog,
      lastFertilizedLog,
      daysSinceWatered,
      daysSinceFertilized,
    }
  })

  // Sort by most urgent status across both watering and fertilizing.
  // A plant that is overdue on either gets the highest urgency slot.
  cards.sort((a, b) => {
    const aUrgency = Math.min(URGENCY_ORDER[a.wateringStatus], URGENCY_ORDER[a.fertilizingStatus])
    const bUrgency = Math.min(URGENCY_ORDER[b.wateringStatus], URGENCY_ORDER[b.fertilizingStatus])
    return aUrgency - bUrgency
  })

  return <PlantsClient cards={cards} />
}
