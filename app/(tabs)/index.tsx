// app/(tabs)/index.tsx
// My Plants screen — shows the user's plant collection as a visual photo grid.
// Each card shows the plant's cover photo, nickname, species, and watering status.
// A banner at the top calls out any plants that need water today.

import { Image } from 'expo-image'
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
// This is used to drive the badge color and label on each card.
function computeWateringStatus(
  plant: Plant,
  lastWateredAt: string | null
): { status: WateringStatus; daysUntilWater: number | null } {
  // No reminder interval set → don't show any badge
  if (!plant.watering_interval_days) {
    return { status: 'unset', daysUntilWater: null }
  }

  // Has an interval but has never been logged as watered → treat as overdue
  if (!lastWateredAt) {
    return { status: 'overdue', daysUntilWater: null }
  }

  const lastWatered = new Date(lastWateredAt)
  const nextWatering = new Date(
    lastWatered.getTime() + plant.watering_interval_days * 24 * 60 * 60 * 1000
  )
  const msUntil = nextWatering.getTime() - Date.now()
  // Round up so "due today" shows as 0 rather than -a-few-hours
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
  // 'good' — show days remaining as a quiet indicator
  return daysUntil !== null ? `💧 ${daysUntil}d` : ''
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MyPlantsScreen() {
  const [plants, setPlants] = useState<PlantCard[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Refresh whenever this screen comes back into focus
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
      return
    }

    const plantIds = plantData.map(p => p.id)

    // ── Step 2: fetch the most recent photo path for each plant ────────────
    // One query returns all photos ordered newest-first. We then take the
    // first occurrence of each plant_id to get the cover photo.
    const { data: photoData } = await supabase
      .from('photos')
      .select('plant_id, storage_path')
      .in('plant_id', plantIds)
      .order('created_at', { ascending: false })

    // Build a map: plant_id → storage_path of cover photo
    const coverPaths: Record<string, string> = {}
    for (const photo of photoData || []) {
      if (!coverPaths[photo.plant_id]) {
        coverPaths[photo.plant_id] = photo.storage_path
      }
    }

    // Convert storage paths to public URLs (synchronous — no API call)
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

    // Build a map: plant_id → most recent watered timestamp
    const lastWateredMap: Record<string, string> = {}
    for (const log of waterData || []) {
      if (!lastWateredMap[log.plant_id]) {
        lastWateredMap[log.plant_id] = log.logged_at
      }
    }

    // ── Step 4: assemble enriched plant cards ──────────────────────────────
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

    setPlants(enriched)
    setLoading(false)
  }

  // Count plants that need watering now or very soon
  const needsAttentionCount = plants.filter(
    p => p.wateringStatus === 'overdue' || p.wateringStatus === 'due-soon'
  ).length

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
          <Text style={styles.headerTitle}>My Plants</Text>

          {/* Attention banner — shown when one or more plants need water */}
          {needsAttentionCount > 0 && (
            <View style={styles.attentionBanner}>
              <Text style={styles.attentionText}>
                💧 {needsAttentionCount}{' '}
                {needsAttentionCount === 1 ? 'plant needs' : 'plants need'} water
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
          /* ── Photo grid ─────────────────────────────────────────────── */
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
                    {/* Background: photo or green placeholder */}
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

                    {/* Bottom gradient overlay so text is legible over any photo */}
                    <View style={styles.cardGradient} />

                    {/* Watering status badge — top right corner */}
                    {label !== '' && (
                      <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.badgeText, { color: colors.text }]}>
                          {label}
                        </Text>
                      </View>
                    )}

                    {/* Plant name and species — bottom of card */}
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

      {/* Floating "Add Plant" button — always visible over content */}
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

const GRID_PADDING = 16   // horizontal padding around the grid
const CARD_GAP = 10       // space between cards (half applied to each side)

const styles = StyleSheet.create({
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },

  scroll: {
    flex: 1, backgroundColor: '#f8faf9',
  },
  scrollContent: {
    paddingBottom: 110,  // room for the floating Add button
  },

  // ── Header
  header: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#f8faf9',
  },
  headerTitle: {
    fontSize: 32, fontWeight: 'bold', color: '#2d6a4f',
  },

  // Attention banner — shown when plants need water
  attentionBanner: {
    marginTop: 12,
    backgroundColor: '#fff8e8',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#f0c060',
  },
  attentionText: {
    fontSize: 14, color: '#8a5d00', fontWeight: '600',
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

  // Each card takes half the grid width; padding creates the gap between cards
  cardOuter: {
    width: '50%',
    padding: CARD_GAP / 2,
  },

  // The inner container clips the photo to rounded corners
  cardInner: {
    aspectRatio: 3 / 4,   // portrait ratio — taller than wide, suits plant photos
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#d4eadf',  // fallback color while photo loads
  },

  // Placeholder shown when no photo has been added yet
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e8f5ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
  },

  // Semi-transparent dark gradient at the bottom of each card
  // Makes the white nickname text legible over any photo color
  cardGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '55%',
    // Fade from transparent (top) to dark (bottom)
    // React Native doesn't support CSS gradients, so we simulate with opacity + color
    backgroundColor: 'rgba(0,0,0,0.52)',
    // The fade effect uses a trick: make the top portion transparent via borderRadius
    // on a taller view. For a real gradient, add expo-linear-gradient later.
  },

  // Watering status badge — sits in the top-right corner of the card
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

  // Plant info at the bottom of the card, over the gradient
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
