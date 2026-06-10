// app/(app)/page.tsx
// Today — the new home screen. Shows a prioritized view of what needs doing:
// overdue water tasks, due-soon, the care streak, the collection preview, and
// a "journal" peek drawn from the most recent AI analysis.
//
// Server Component — fetches and enriches; passes a pre-computed shape to the
// client for rendering.
import { createClient } from '@/lib/supabase/server'
import { computeStreak, computeWateringStatus, computeFertilizingStatus, URGENCY_ORDER } from '@/lib/utils'
import type { CareLog, Plant, PlantPhoto, AnalysisResult, CareRecommendation } from '@/lib/types'
import TodayClient from './TodayClient'

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

// An assistant recommendation enriched with its plant's display data
// (Phase 1 — rendered in the "§ Assistant" section and the task list).
export type RecommendationCard = {
  rec: CareRecommendation
  plantNickname: string
  coverPhotoUrl: string | null
}

// The "journal peek" — we use the most recent AI analysis for any plant as
// a stand-in for the (future) generated journal entry.
export type JournalPeek = {
  plantId: string
  plantNickname: string
  plantSpecies: string | null
  createdAt: string
  health: string | null
  coverPhotoUrl: string | null
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
    return <TodayClient cards={[]} streak={0} journalPeek={null} tendedToday={0} activityDays={[]} weeklyLogs={0} recommendations={[]} userId={user.id} />
  }

  const plantIds = plants.map(p => p.id)

  // ── Photos + care logs + open recommendations (one Promise.all) ────────
  // The recommendations query soft-fails to an empty list on a database
  // where the Phase 1 migration hasn't been run yet.
  const [{ data: photos }, { data: careLogs }, { data: recRows }] = await Promise.all([
    supabase.from('photos')
      .select('*')
      .in('plant_id', plantIds)
      .order('created_at', { ascending: false }),
    supabase.from('care_logs')
      .select('*')
      .in('plant_id', plantIds)
      .order('logged_at', { ascending: false }),
    supabase.from('care_recommendations')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['proposed', 'accepted'])
      .order('created_at', { ascending: false }),
  ])

  // Build lookup maps — first hit per plant_id = most recent.
  const coverPhotoMap    = new Map<string, PlantPhoto>()
  const lastWateredMap   = new Map<string, CareLog>()
  const lastFertilizedMap = new Map<string, CareLog>()

  for (const photo of photos ?? []) {
    if (!coverPhotoMap.has(photo.plant_id)) coverPhotoMap.set(photo.plant_id, photo)
  }
  for (const log of careLogs ?? []) {
    if (log.type === 'watered'    && !lastWateredMap.has(log.plant_id))    lastWateredMap.set(log.plant_id, log)
    if (log.type === 'fertilized' && !lastFertilizedMap.has(log.plant_id)) lastFertilizedMap.set(log.plant_id, log)
  }

  function getPhotoUrl(path: string): string {
    return supabase.storage.from('plant-photos').getPublicUrl(path).data.publicUrl
  }

  const cards: PlantCard[] = plants.map(plant => {
    const coverPhoto        = coverPhotoMap.get(plant.id)
    const lastWateredLog    = lastWateredMap.get(plant.id) ?? null
    const lastFertilizedLog = lastFertilizedMap.get(plant.id) ?? null
    const daysSinceWatered = lastWateredLog
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

  // Sort by most urgent across both watering and fertilizing.
  cards.sort((a, b) => {
    const aUrgency = Math.min(URGENCY_ORDER[a.wateringStatus], URGENCY_ORDER[a.fertilizingStatus])
    const bUrgency = Math.min(URGENCY_ORDER[b.wateringStatus], URGENCY_ORDER[b.fertilizingStatus])
    return aUrgency - bUrgency
  })

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
        const coverPhoto = coverPhotoMap.get(p.id)
        return {
          plantId: p.id,
          plantNickname: p.nickname,
          plantSpecies: p.species,
          createdAt: latest.created_at,
          health: latest.health,
          coverPhotoUrl: coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : null,
        }
      })()
    : null

  // Count distinct plants that received any care log today (local midnight).
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const tendedToday = new Set(
    (careLogs ?? []).filter(l => new Date(l.logged_at) >= todayMidnight).map(l => l.plant_id)
  ).size

  // 14-day activity set: which local-date strings have at least one care log.
  const logDateSet = new Set<string>()
  for (const log of careLogs ?? []) {
    const d = new Date(log.logged_at)
    logDateSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  const activityDays = Array.from(logDateSet)

  // Count care logs in the last 7 days for the weekly summary.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
  const weeklyLogs = (careLogs ?? []).filter(l => new Date(l.logged_at) >= sevenDaysAgo).length

  // ── Assistant recommendations, enriched with plant display data ────────
  const recommendations: RecommendationCard[] = (recRows ?? []).flatMap((rec: CareRecommendation) => {
    const p = plants.find(pl => pl.id === rec.plant_id)
    if (!p) return []
    const coverPhoto = coverPhotoMap.get(p.id)
    return [{
      rec,
      plantNickname: p.nickname,
      coverPhotoUrl: coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : null,
    }]
  })

  return <TodayClient cards={cards} streak={streak} journalPeek={journalPeek} tendedToday={tendedToday} activityDays={activityDays} weeklyLogs={weeklyLogs} recommendations={recommendations} userId={user.id} />
}
