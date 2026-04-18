// app/(app)/plants/page.tsx
// Plants — the full collection. Fetched server-side; rendered as a grid or
// list with optional groupings (all / by location / by status). Same data
// shape as the Today screen so both stay in sync.
import { createClient } from '@/lib/supabase/server'
import { computeWateringStatus, URGENCY_ORDER } from '@/lib/utils'
import type { CareLog, Plant, PlantPhoto } from '@/lib/types'
import PlantsClient from './PlantsClient'

export type PlantCard = {
  plant: Plant
  coverPhotoUrl: string | null
  wateringStatus: ReturnType<typeof computeWateringStatus>
  lastWateredLog: CareLog | null
  daysSinceWatered: number | null
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
    supabase.from('care_logs')
      .select('*')
      .in('plant_id', plantIds)
      .eq('type', 'watered')
      .order('logged_at', { ascending: false }),
  ])

  const coverPhotoMap  = new Map<string, PlantPhoto>()
  const lastWateredMap = new Map<string, CareLog>()

  for (const photo of photos ?? []) {
    if (!coverPhotoMap.has(photo.plant_id)) coverPhotoMap.set(photo.plant_id, photo)
  }
  for (const log of careLogs ?? []) {
    if (!lastWateredMap.has(log.plant_id)) lastWateredMap.set(log.plant_id, log)
  }

  function getPhotoUrl(path: string): string {
    return supabase.storage.from('plant-photos').getPublicUrl(path).data.publicUrl
  }

  const cards: PlantCard[] = plants.map(plant => {
    const coverPhoto     = coverPhotoMap.get(plant.id)
    const lastWateredLog = lastWateredMap.get(plant.id) ?? null
    const daysSinceWatered = lastWateredLog
      ? Math.floor((Date.now() - new Date(lastWateredLog.logged_at).getTime()) / 86_400_000)
      : null
    return {
      plant,
      coverPhotoUrl: coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : null,
      wateringStatus: computeWateringStatus(plant.watering_interval_days, lastWateredLog),
      lastWateredLog,
      daysSinceWatered,
    }
  })

  cards.sort((a, b) => URGENCY_ORDER[a.wateringStatus] - URGENCY_ORDER[b.wateringStatus])

  return <PlantsClient cards={cards} />
}
