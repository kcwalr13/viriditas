// app/(app)/page.tsx
// Today — the new home screen. Shows a prioritized view of what needs doing:
// overdue water tasks, due-soon, the care streak, the collection preview, and
// a "journal" peek drawn from the most recent AI analysis.
//
// Server Component — fetches and enriches; passes a pre-computed shape to the
// client for rendering.
import { createClient } from '@/lib/supabase/server'
import { computeStreak, computeWateringStatus, URGENCY_ORDER } from '@/lib/utils'
import type { CareLog, Plant, PlantPhoto, AnalysisResult } from '@/lib/types'
import TodayClient from './TodayClient'

export type PlantCard = {
  plant: Plant
  coverPhotoUrl: string | null
  wateringStatus: ReturnType<typeof computeWateringStatus>
  lastWateredLog: CareLog | null
  daysSinceWatered: number | null
}

// The "journal peek" — we use the most recent AI analysis for any plant as
// a stand-in for the (future) generated journal entry.
export type JournalPeek = {
  plantId: string
  plantNickname: string
  plantSpecies: string | null
  createdAt: string
  health: string | null
} | null

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // ── Fetch plants ───────────────────────────────────────────────────────
  const { data: plants } = await supabase
    .from('plants')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (!plants || plants.length === 0) {
    return <TodayClient cards={[]} streak={0} journalPeek={null} />
  }

  const plantIds = plants.map(p => p.id)

  // ── Photos + care logs (3 queries regardless of collection size) ───────
  const [{ data: photos }, { data: careLogs }] = await Promise.all([
    supabase.from('photos')
      .select('*')
      .in('plant_id', plantIds)
      .order('created_at', { ascending: false }),
    supabase.from('care_logs')
      .select('*')
      .in('plant_id', plantIds)
      .order('logged_at', { ascending: false }),
  ])

  // Build lookup maps — first hit per plant_id = most recent.
  const coverPhotoMap  = new Map<string, PlantPhoto>()
  const lastWateredMap = new Map<string, CareLog>()

  for (const photo of photos ?? []) {
    if (!coverPhotoMap.has(photo.plant_id)) coverPhotoMap.set(photo.plant_id, photo)
  }
  for (const log of careLogs ?? []) {
    if (log.type === 'watered' && !lastWateredMap.has(log.plant_id)) {
      lastWateredMap.set(log.plant_id, log)
    }
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

  // ── Streak ─────────────────────────────────────────────────────────────
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const { data: streakLogs } = await supabase
    .from('care_logs')
    .select('logged_at')
    .eq('user_id', user.id)
    .gte('logged_at', oneYearAgo.toISOString())
  const streak = computeStreak((streakLogs ?? []).map(l => l.logged_at))

  // ── Journal peek: most recent analysis with health text ────────────────
  const { data: latestAnalyses } = await supabase
    .from('analysis_results')
    .select('plant_id, health, created_at')
    .eq('user_id', user.id)
    .not('health', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const latest: Pick<AnalysisResult, 'plant_id' | 'health' | 'created_at'> | undefined = latestAnalyses?.[0]
  const journalPeek: JournalPeek = latest
    ? (() => {
        const p = plants.find(pl => pl.id === latest.plant_id)
        if (!p) return null
        return {
          plantId: p.id,
          plantNickname: p.nickname,
          plantSpecies: p.species,
          createdAt: latest.created_at,
          health: latest.health,
        }
      })()
    : null

  return <TodayClient cards={cards} streak={streak} journalPeek={journalPeek} />
}
