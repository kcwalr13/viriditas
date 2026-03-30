// app/(tabs)/index.tsx
// My Plants screen — shows the user's plant collection as a visual photo grid.
// Phase 10D additions:
//   - Plants sorted by watering urgency (overdue first, then due-soon, then the rest)
//   - Smarter attention banner: shows overdue and due-soon counts separately
//   - "All caught up!" positive state when no plants need water
//   - Care streak tracking: consecutive days with at least one logged care event

import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native'
import PageContainer from '@/components/PageContainer'
import { supabase } from '@/lib/supabase'
import { Plant } from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────────────────

// The status of a plant's watering schedule
type WateringStatus = 'good' | 'due-soon' | 'overdue' | 'unset'

// A Plant enriched with display data computed after fetching
type PlantCard = Plant & {
  coverPhotoUrl: string | null   // public URL of most recent photo, or null
  lastWateredAt: string | null   // ISO timestamp of most recent 'watered' log
  wateringStatus: WateringStatus
  daysUntilWater: number | null  // positive = days left, negative = days overdue
}

// ── Watering status logic ──────────────────────────────────────────────────

// Computes watering status from the plant's interval and last-watered date.
function computeWateringStatus(
  plant: Plant,
  lastWateredAt: string | null
): { status: WateringStatus; daysUntilWater: number | null } {
  if (!plant.watering_interval_days) {
    return { status: 'unset', daysUntilWater: null }
  }
  if (!lastWateredAt) {
    return { status: 'overdue', daysUntilWater: null }
  }

  const lastWatered = new Date(lastWateredAt)
  const nextWatering = new Date(
    lastWatered.getTime() + plant.watering_interval_days * 24 * 60 * 60 * 1000
  )
  const msUntil = nextWatering.getTime() - Date.now()
  const daysUntil = Math.ceil(msUntil / (24 * 60 * 60 * 1000))

  if (daysUntil < 0) return { status: 'overdue', daysUntilWater: daysUntil }
  if (daysUntil <= 1) return { status: 'due-soon', daysUntilWater: daysUntil }
  return { status: 'good', daysUntilWater: daysUntil }
}

// ── Badge helpers ──────────────────────────────────────────────────────────

function badgeColors(status: WateringStatus) {
  if (status === 'overdue')  return { bg: '#d9534f', text: '#fff' }
  if (status === 'due-soon') return { bg: '#f0a500', text: '#fff' }
  return { bg: 'rgba(0,0,0,0.35)', text: '#fff' }
}

function badgeLabel(status: WateringStatus, daysUntil: number | null): string {
  if (status === 'overdue') {
    return daysUntil !== null ? `${Math.abs(daysUntil)}d overdue` : 'Water me!'
  }
  if (status === 'due-soon') {
    return daysUntil === 0 ? 'Water today' : 'Water tomorrow'
  }
  return daysUntil !== null ? `💧 ${daysUntil}d` : ''
}

// ── Streak helpers ─────────────────────────────────────────────────────────

// Convert any timestamp to a YYYY-MM-DD string in the user's local timezone.
// new Date(isoStr).getFullYear/Month/Date all use local time — consistent with
// how the user experiences their day.
function toLocalDateStr(isoStr: string): string {
  const d = new Date(isoStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Compute the number of consecutive calendar days (in local timezone) that had
// at least one logged care event, counting backwards from today.
// A streak of 1 means: only today (or only yesterday, if today has no care yet).
// We don't penalise for not having logged care YET today — the day isn't over.
function computeStreak(logTimestamps: string[]): number {
  if (logTimestamps.length === 0) return 0

  // Deduplicate into a Set of local date strings
  const dateSet = new Set(logTimestamps.map(toLocalDateStr))

  const todayStr = toLocalDateStr(new Date().toISOString())

  // Helper to subtract N days from a local date string
  function subtractDay(dateStr: string, n = 1): string {
    const d = new Date(dateStr)
    d.setDate(d.getDate() - n)
    return toLocalDateStr(d.toISOString())
  }

  // If today isn't logged yet, check if yesterday was — the streak could still
  // be alive (e.g. it's 8am and you haven't done anything today yet).
  let checkDate = todayStr
  if (!dateSet.has(checkDate)) {
    checkDate = subtractDay(checkDate)
    if (!dateSet.has(checkDate)) return 0  // no recent care at all
  }

  // Count consecutive days backwards from checkDate
  let streak = 0
  while (dateSet.has(checkDate)) {
    streak++
    checkDate = subtractDay(checkDate)
  }

  return streak
}

// ── Urgency sort ───────────────────────────────────────────────────────────

// Sort order: overdue first, then due-soon, then good, then unset.
// Plants within each tier keep their original order (newest created first).
const URGENCY_ORDER: Record<WateringStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  good: 2,
  unset: 3,
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MyPlantsScreen() {
  const [plants, setPlants] = useState<PlantCard[]>([])
  const [loading, setLoading] = useState(true)
  const [careStreak, setCareStreak] = useState(0)
  const router = useRouter()

  useFocusEffect(
    useCallback(() => {
      fetchPlants()
    }, [])
  )

  async function fetchPlants() {
    // ── Step 1: fetch the user's plants ────────────────────────────────────
    const { data: plantData, error: plantError } = await supabase
      .from('plants')
      .select('*')
      .order('created_at', { ascending: false })

    if (plantError || !plantData) {
      console.error('Error fetching plants:', plantError)
      setLoading(false)
      return
    }

    if (plantData.length === 0) {
      setPlants([])
      setLoading(false)
      // Still compute streak even with no plants
      await fetchStreak()
      return
    }

    const plantIds = plantData.map(p => p.id)

    // ── Step 2: fetch the most recent photo path for each plant ────────────
    const { data: photoData } = await supabase
      .from('photos')
      .select('plant_id, storage_path')
      .in('plant_id', plantIds)
      .order('created_at', { ascending: false })

    const coverPaths: Record<string, string> = {}
    for (const photo of photoData || []) {
      if (!coverPaths[photo.plant_id]) {
        coverPaths[photo.plant_id] = photo.storage_path
      }
    }

    const coverUrls: Record<string, string> = {}
    for (const [plantId, path] of Object.entries(coverPaths)) {
      const { data: urlData } = supabase.storage
        .from('plant-photos')
        .getPublicUrl(path)
      coverUrls[plantId] = urlData.publicUrl
    }

    // ── Step 3: fetch the most recent 'watered' event per plant ───────────
    const { data: waterData } = await supabase
      .from('care_logs')
      .select('plant_id, logged_at')
      .in('plant_id', plantIds)
      .eq('type', 'watered')
      .order('logged_at', { ascending: false })

    const lastWateredMap: Record<string, string> = {}
    for (const log of waterData || []) {
      if (!lastWateredMap[log.plant_id]) {
        lastWateredMap[log.plant_id] = log.logged_at
      }
    }

    // ── Step 4: assemble enriched plant cards, sorted by urgency ──────────
    const enriched: PlantCard[] = plantData.map(plant => {
      const lastWateredAt = lastWateredMap[plant.id] ?? null
      const { status, daysUntilWater } = computeWateringStatus(plant, lastWateredAt)
      return {
        ...plant,
        coverPhotoUrl: coverUrls[plant.id] ?? null,
        lastWateredAt,
        wateringStatus: status,
        daysUntilWater,
      }
    })

    // Sort so most urgent plants appear first — stable sort preserves creation
    // order within each urgency tier
    enriched.sort((a, b) =>
      URGENCY_ORDER[a.wateringStatus] - URGENCY_ORDER[b.wateringStatus]
    )

    setPlants(enriched)
    setLoading(false)

    // Fetch care streak independently (doesn't block the plant grid from rendering)
    await fetchStreak()
  }

  // Fetch all care log timestamps from the past year to compute the streak.
  // Any care action on any plant counts — the streak rewards daily engagement.
  async function fetchStreak() {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const { data: careData } = await supabase
      .from('care_logs')
      .select('logged_at')
      .gte('logged_at', oneYearAgo.toISOString())
      .order('logged_at', { ascending: false })

    const streak = computeStreak((careData || []).map(l => l.logged_at))
    setCareStreak(streak)
  }

  // ── Derived display state ──────────────────────────────────────────────
  const overdueCount  = plants.filter(p => p.wateringStatus === 'overdue').length
  const dueSoonCount  = plants.filter(p => p.wateringStatus === 'due-soon').length
  const hasReminders  = plants.some(p => p.watering_interval_days)
  // "All caught up" = at least one reminder is set AND nothing is overdue or due-soon
  const allCaughtUp   = hasReminders && overdueCount === 0 && dueSoonCount === 0

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    )
  }

  return (
    <PageContainer>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>My Plants</Text>

            {/* Care streak chip — only shown when streak >= 1 */}
            {careStreak > 0 && (
              <View style={styles.streakChip}>
                <Text style={styles.streakText}>
                  {careStreak === 1
                    ? '🌿 Today'
                    : `🔥 ${careStreak}-day streak`}
                </Text>
              </View>
            )}
          </View>

          {/* ── Attention banners ─────────────────────────────────────── */}

          {/* Overdue banner — highest urgency */}
          {overdueCount > 0 && (
            <View style={[styles.attentionBanner, styles.bannerOverdue]}>
              <Text style={[styles.attentionText, styles.bannerOverdueText]}>
                🚨 {overdueCount} {overdueCount === 1 ? 'plant is' : 'plants are'} overdue for water
              </Text>
            </View>
          )}

          {/* Due-soon banner — shown below overdue if any */}
          {dueSoonCount > 0 && (
            <View style={[styles.attentionBanner, styles.bannerDueSoon]}>
              <Text style={[styles.attentionText, styles.bannerDueSoonText]}>
                💧 {dueSoonCount} {dueSoonCount === 1 ? 'plant needs' : 'plants need'} water today or tomorrow
              </Text>
            </View>
          )}

          {/* "All caught up" — shown when reminders exist and nothing is overdue */}
          {allCaughtUp && (
            <View style={[styles.attentionBanner, styles.bannerGood]}>
              <Text style={[styles.attentionText, styles.bannerGoodText]}>
                ✅ All caught up — your plants are happy!
              </Text>
            </View>
          )}
        </View>

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {plants.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🌿</Text>
            <Text style={styles.emptyTitle}>Your collection is empty</Text>
            <Text style={styles.emptySubtext}>
              Add your first plant to start building your garden journal.
            </Text>
          </View>
        ) : (
          /* ── Photo grid — sorted by urgency ─────────────────────────── */
          <View style={styles.grid}>
            {plants.map(plant => {
              const colors = badgeColors(plant.wateringStatus)
              const label = plant.wateringStatus !== 'unset'
                ? badgeLabel(plant.wateringStatus, plant.daysUntilWater)
                : ''

              return (
                <View key={plant.id} style={styles.cardOuter}>
                  <TouchableOpacity
                    style={styles.cardInner}
                    onPress={() => router.push(`/plant/${plant.id}`)}
                    activeOpacity={0.88}
                  >
                    {plant.coverPhotoUrl ? (
                      <Image
                        source={{ uri: plant.coverPhotoUrl }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.placeholder}>
                        <Text style={styles.placeholderIcon}>🌱</Text>
                      </View>
                    )}

                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.72)']}
                      start={{ x: 0, y: 0.35 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />

                    {label !== '' && (
                      <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.badgeText, { color: colors.text }]}>
                          {label}
                        </Text>
                      </View>
                    )}

                    <View style={styles.cardInfo}>
                      <Text style={styles.cardNickname} numberOfLines={1}>
                        {plant.nickname}
                      </Text>
                      {plant.species ? (
                        <Text style={styles.cardSpecies} numberOfLines={1}>
                          {plant.species}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* Floating "Add Plant" button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/add-plant')}
      >
        <Text style={styles.addButtonText}>+ Add Plant</Text>
      </TouchableOpacity>
    </PageContainer>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const GRID_PADDING = 16
const CARD_GAP = 10

const styles = StyleSheet.create({
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },

  scroll: {
    flex: 1, backgroundColor: '#f8faf9',
  },
  scrollContent: {
    paddingBottom: 110,
  },

  // ── Header
  header: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#f8faf9',
  },

  // Title + streak chip on the same row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 32, fontWeight: 'bold', color: '#2d6a4f',
  },

  // Streak chip — sits to the right of the title
  streakChip: {
    backgroundColor: '#e8f5ee',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#b7d9c6',
  },
  streakText: {
    fontSize: 13, fontWeight: '700', color: '#2d6a4f',
  },

  // ── Attention banners (stacked when both overdue + due-soon exist)
  attentionBanner: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  attentionText: {
    fontSize: 14, fontWeight: '600',
  },

  // Overdue: red
  bannerOverdue: {
    backgroundColor: '#fff0f0',
    borderColor: '#f5b8b8',
  },
  bannerOverdueText: {
    color: '#b03030',
  },

  // Due-soon: amber
  bannerDueSoon: {
    backgroundColor: '#fff8e8',
    borderColor: '#f0c060',
  },
  bannerDueSoonText: {
    color: '#8a5d00',
  },

  // All caught up: green
  bannerGood: {
    backgroundColor: '#edfaf3',
    borderColor: '#9fd3b8',
  },
  bannerGoodText: {
    color: '#1f6b47',
  },

  // ── Empty state
  empty: {
    marginTop: 80, alignItems: 'center', paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 72, marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20, fontWeight: '700', color: '#333',
    marginBottom: 10, textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 15, color: '#888',
    textAlign: 'center', lineHeight: 22,
  },

  // ── Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING - CARD_GAP / 2,
  },

  cardOuter: {
    width: '50%',
    padding: CARD_GAP / 2,
  },

  cardInner: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#d4eadf',
  },

  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e8f5ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
  },

  badge: {
    position: 'absolute',
    top: 10, right: 10,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11, fontWeight: '700',
  },

  cardInfo: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 12,
  },
  cardNickname: {
    fontSize: 15, fontWeight: '700', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardSpecies: {
    fontSize: 12, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Floating Add Plant button
  addButton: {
    position: 'absolute',
    bottom: 30, right: 20,
    backgroundColor: '#2d6a4f',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 28,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addButtonText: {
    color: '#fff', fontSize: 16, fontWeight: '700',
  },
})
