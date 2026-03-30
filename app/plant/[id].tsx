// app/plant/[id].tsx
// Plant detail screen — rich profile for a single plant.
// Three-tab layout: Overview, History, and Species Guide.
import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { scheduleWateringReminder, cancelNotification } from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import { Plant, PlantPhoto, AnalysisResult, CareLog, SpeciesProfile } from '@/lib/types'
import PageContainer from '@/components/PageContainer'

// AsyncStorage key for storing the scheduled notification ID for a plant.
// Notification IDs are device-specific so they live on-device, not in Supabase.
const reminderKey = (plantId: string) => `viriditas_reminder_${plantId}`

// Interval options shown as quick-pick chips in the reminder section
const REMINDER_OPTIONS = [
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '7 days', days: 7 },
  { label: '10 days', days: 10 },
  { label: '14 days', days: 14 },
]

type Tab = 'overview' | 'history' | 'species'

// A unified timeline entry merging care logs and analysis results by date.
// Used in the History tab to give a single chronological view of the plant's life.
type TimelineItem =
  | { kind: 'care'; id: string; date: string; data: CareLog }
  | { kind: 'analysis'; id: string; date: string; data: AnalysisResult }

export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  // ── Core data state ────────────────────────────────────────────────────────
  const [plant, setPlant] = useState<Plant | null>(null)
  const [photos, setPhotos] = useState<PlantPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Which tab is currently active
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // AI analysis
  const [analyzing, setAnalyzing] = useState(false)
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null)
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([])

  // Species profile — encyclopedic reference data fetched once per species and cached
  const [speciesProfile, setSpeciesProfile] = useState<SpeciesProfile | null>(null)
  const [fetchingSpeciesProfile, setFetchingSpeciesProfile] = useState(false)

  // Watering reminder — interval stored in Supabase, notification ID stored on-device
  const [reminderDays, setReminderDays] = useState<number | null>(null)
  const [savingReminder, setSavingReminder] = useState(false)

  // Care logs
  const [careLogs, setCareLogs] = useState<CareLog[]>([])
  const [loggingCare, setLoggingCare] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [showMoreActions, setShowMoreActions] = useState(false)

  // Edit form — pre-filled when editing starts
  const [nickname, setNickname] = useState('')
  const [species, setSpecies] = useState('')
  const [location, setLocation] = useState('')
  const [potSize, setPotSize] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [lastRepottedDate, setLastRepottedDate] = useState('')
  const [notes, setNotes] = useState('')

  // Reload all data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchPlant()
      fetchPhotos()
      fetchAnalysisHistory()
      fetchCareLogs()
    }, [id])
  )

  // When we know the species — either from the plants table (manually set) or from
  // the latest analysis result — look up the cached species profile in the DB.
  // latestAnalysis.species is the AI-identified name; plant.species is the user-set name.
  useEffect(() => {
    const species = plant?.species || latestAnalysis?.species
    if (species) {
      fetchSpeciesProfileFromDB(species)
    }
  }, [plant?.species, latestAnalysis?.species])

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchPlant() {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      Alert.alert('Error', 'Could not load this plant.')
      router.back()
    } else {
      setPlant(data)
      setNickname(data.nickname)
      setSpecies(data.species || '')
      setLocation(data.location || '')
      setPotSize(data.pot_size || '')
      setAcquiredDate(data.acquired_date || '')
      setLastRepottedDate(data.last_repotted_date || '')
      setNotes(data.notes || '')
      setReminderDays(data.watering_interval_days ?? null)
    }
    setLoading(false)
  }

  async function fetchPhotos() {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('plant_id', id)
      .order('created_at', { ascending: false }) // Newest first

    if (!error && data) {
      setPhotos(data)
      // Build a map of photo ID → public URL for displaying images
      const urls: Record<string, string> = {}
      for (const photo of data) {
        const { data: urlData } = supabase.storage
          .from('plant-photos')
          .getPublicUrl(photo.storage_path)
        urls[photo.id] = urlData.publicUrl
      }
      setPhotoUrls(urls)
    }
  }

  async function fetchAnalysisHistory() {
    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('plant_id', id)
      .order('created_at', { ascending: false })

    if (!error && data && data.length > 0) {
      setLatestAnalysis(data[0])        // Most recent — shown in the Overview tab
      setAnalysisHistory(data.slice(1)) // The rest — shown in the History tab
    } else {
      setLatestAnalysis(null)
      setAnalysisHistory([])
    }
  }

  // Check the local DB for a cached species profile — fast, free, no AI call needed
  async function fetchSpeciesProfileFromDB(speciesName: string) {
    const { data, error } = await supabase
      .from('species_profiles')
      .select('*')
      .eq('species_name', speciesName)
      .single()

    if (!error && data) setSpeciesProfile(data)
  }

  // Call the fetch-species-info Edge Function to get or create a species profile.
  // Pass forceRefresh: true to bypass the cache and regenerate the profile.
  async function fetchSpeciesProfileFromAI(speciesName: string, forceRefresh = false) {
    setFetchingSpeciesProfile(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error } = await supabase.functions.invoke('fetch-species-info', {
        body: { speciesName, forceRefresh },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (data?.profile) setSpeciesProfile(data.profile)
    } catch (err: any) {
      Alert.alert('Species info unavailable', err.message || 'Could not fetch species info.')
    } finally {
      setFetchingSpeciesProfile(false)
    }
  }

  async function fetchCareLogs() {
    const { data, error } = await supabase
      .from('care_logs')
      .select('*')
      .eq('plant_id', id)
      .order('logged_at', { ascending: false })
      .limit(50)

    if (!error && data) setCareLogs(data)
  }

  // ── Reminders ──────────────────────────────────────────────────────────────

  async function setReminder(days: number) {
    setSavingReminder(true)
    try {
      // Cancel any existing notification first
      const existingId = await AsyncStorage.getItem(reminderKey(id))
      if (existingId) await cancelNotification(existingId)

      // Schedule the new repeating notification via our safe wrapper
      const notificationId = await scheduleWateringReminder(
        plant?.nickname ?? 'Your plant',
        days
      )
      if (notificationId) {
        await AsyncStorage.setItem(reminderKey(id), notificationId)
      }

      // Persist the interval to Supabase so it shows in the UI across devices
      await supabase.from('plants').update({ watering_interval_days: days }).eq('id', id)
      setReminderDays(days)
    } catch {
      Alert.alert('Error', 'Could not set reminder. Please try again.')
    } finally {
      setSavingReminder(false)
    }
  }

  async function removeReminder() {
    setSavingReminder(true)
    try {
      const existingId = await AsyncStorage.getItem(reminderKey(id))
      if (existingId) {
        await cancelNotification(existingId)
        await AsyncStorage.removeItem(reminderKey(id))
      }
      await supabase.from('plants').update({ watering_interval_days: null }).eq('id', id)
      setReminderDays(null)
    } catch {
      Alert.alert('Error', 'Could not remove reminder.')
    } finally {
      setSavingReminder(false)
    }
  }

  // ── Care logs ──────────────────────────────────────────────────────────────

  // Reschedule the watering notification from NOW forward.
  // Called automatically after logging "watered" so the notification reflects
  // actual care timing rather than firing on the original schedule from when
  // the reminder was first set. This keeps the push alert in sync with the
  // in-app watering badge, which already recalculates from care_logs.
  // Silently no-ops if notifications aren't supported (Expo Go / web).
  async function rescheduleWateringNotification(days: number) {
    try {
      const existingId = await AsyncStorage.getItem(reminderKey(id))
      if (existingId) await cancelNotification(existingId)

      const notificationId = await scheduleWateringReminder(
        plant?.nickname ?? 'Your plant',
        days
      )
      if (notificationId) {
        await AsyncStorage.setItem(reminderKey(id), notificationId)
      }
    } catch {
      // Non-critical — notification sync failure should never interrupt care logging
      console.log('[Plant] Failed to reschedule watering notification after care log')
    }
  }

  // Log a care event. After logging "watered", the watering notification is
  // automatically rescheduled from the current time so the push alert stays
  // in sync with the in-app watering badge.
  async function logCare(type: CareLog['type'], customNote?: string) {
    setLoggingCare(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('care_logs').insert({
        plant_id: id,
        user_id: user!.id,
        type,
        notes: customNote ?? null,
      })
      if (error) throw error

      // Resync the watering notification to fire relative to the actual watering
      // date, not the original schedule. Only relevant when an interval is set.
      if (type === 'watered' && plant?.watering_interval_days) {
        await rescheduleWateringNotification(plant.watering_interval_days)
      }

      await fetchCareLogs()
    } catch {
      Alert.alert('Error', 'Could not save care log.')
    } finally {
      setLoggingCare(false)
    }
  }

  async function handleNoteSubmit() {
    if (!noteText.trim()) return
    await logCare('note', noteText.trim())
    setNoteText('')
    setShowNoteInput(false)
  }

  // ── AI Analysis ────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (photos.length === 0) {
      Alert.alert('No photos', 'Add a photo of your plant first, then try analysis.')
      return
    }

    setAnalyzing(true)
    try {
      const latestPhoto = photos[0]
      const imageUrl = photoUrls[latestPhoto.id]

      // Fetch up to 3 past analyses to send as context — lets Claude comment on progress
      const { data: historyData } = await supabase
        .from('analysis_results')
        .select('species, health, care, created_at')
        .eq('plant_id', id)
        .order('created_at', { ascending: false })
        .limit(3)

      const previousAnalyses = (historyData ?? []).map((r: any) => ({
        date: new Date(r.created_at).toLocaleDateString(),
        species: r.species,
        health: r.health,
        care: r.care,
      }))

      // Fetch recent care logs so the AI knows what care the plant has received
      const { data: careData } = await supabase
        .from('care_logs')
        .select('type, notes, logged_at')
        .eq('plant_id', id)
        .order('logged_at', { ascending: false })
        .limit(10)

      const recentCareLogs = (careData ?? []).map((l: any) => ({
        type: l.type,
        notes: l.notes,
        date: new Date(l.logged_at).toLocaleDateString(),
      }))

      // supabase.functions.invoke doesn't reliably inject the auth token in React Native,
      // so we fetch the session and pass the token explicitly
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error } = await supabase.functions.invoke('analyze-plant', {
        body: {
          imageUrl,
          previousAnalyses,
          recentCareLogs,
          speciesProfile: speciesProfile ?? null,
          // Location and pot size let the AI give more specific, grounded recommendations
          plantContext: (plant?.location || plant?.pot_size) ? {
            location: plant?.location ?? null,
            pot_size: plant?.pot_size ?? null,
          } : null,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (error) {
        console.error('[Analyze] Edge Function error:', error)
        let message = error.message || 'Edge Function call failed'
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) message = body.error
        } catch {}
        throw new Error(message)
      }
      if (data?.error) {
        console.error('[Analyze] Server-side error:', data.error)
        throw new Error(data.error)
      }
      if (!data?.result) {
        console.error('[Analyze] Unexpected response shape:', data)
        throw new Error('Unexpected response from analysis service.')
      }

      const result = data.result

      // Save the result to the DB so it becomes part of the plant's history
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('analysis_results').insert({
        plant_id: id,
        user_id: user!.id,
        photo_id: latestPhoto.id,
        species: result.species,
        health: result.health,
        care: result.care,
      })

      // If a species was identified and we don't have a profile yet, fetch one in the background
      if (result.species && !speciesProfile) {
        fetchSpeciesProfileFromAI(result.species)
      }

      await fetchAnalysisHistory()
    } catch (error: any) {
      console.error('[Analyze] Caught error:', error)
      Alert.alert('Analysis failed', error.message || 'Something went wrong. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Photo handling ─────────────────────────────────────────────────────────

  function handleAddPhoto() {
    // On web, Alert.alert doesn't support custom buttons — the browser's native
    // alert() ignores the buttons array. Skip straight to the file picker instead.
    if (Platform.OS === 'web') {
      pickImage('library')
      return
    }
    Alert.alert('Add Photo', 'Where would you like to get the photo?', [
      { text: 'Take Photo', onPress: () => pickImage('camera') },
      { text: 'Choose from Library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function pickImage(source: 'camera' | 'library') {
    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
      base64: true,
    }

    let result

    if (source === 'camera') {
      // Permission requests are native-only — browsers prompt automatically
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to take photos.')
          return
        }
      }
      result = await ImagePicker.launchCameraAsync(pickerOptions)
    } else {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Photo library access is required.')
          return
        }
      }
      result = await ImagePicker.launchImageLibraryAsync(pickerOptions)
    }

    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data.')
      return
    }
    // Pass the actual MIME type so Supabase stores the correct content-type.
    // Without this, WebP images uploaded from browsers get labelled image/jpeg,
    // which causes the Claude API to reject them during analysis.
    await uploadPhoto(asset.base64, asset.mimeType ?? 'image/jpeg')
  }

  async function uploadPhoto(base64: string, mimeType: string = 'image/jpeg') {
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Convert base64 → binary → Uint8Array → ArrayBuffer for upload.
      // React Native's Blob doesn't support .arrayBuffer(), so we do this manually.
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Use the correct file extension based on the actual MIME type
      const ext = mimeType === 'image/webp' ? 'webp'
                : mimeType === 'image/png'  ? 'png'
                : mimeType === 'image/gif'  ? 'gif'
                : 'jpg'
      const path = `${user!.id}/${id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(path, bytes.buffer, { contentType: mimeType })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('photos').insert({
        plant_id: id,
        user_id: user!.id,
        storage_path: path,
      })

      if (dbError) throw dbError

      fetchPhotos()
    } catch (error: any) {
      Alert.alert('Upload failed', error.message || 'Something went wrong.')
    } finally {
      setUploading(false)
    }
  }

  // ── Plant editing ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!nickname.trim()) {
      Alert.alert('Nickname cannot be empty.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('plants')
      .update({
        nickname: nickname.trim(),
        species: species.trim() || null,
        location: location.trim() || null,
        pot_size: potSize.trim() || null,
        acquired_date: acquiredDate.trim() || null,
        last_repotted_date: lastRepottedDate.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', id)

    setSaving(false)
    if (error) {
      Alert.alert('Error', 'Could not save changes.')
    } else {
      setEditing(false)
      fetchPlant()
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete Plant',
      `Are you sure you want to remove ${plant?.nickname}? This will also delete all photos and analysis history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('plants').delete().eq('id', id)
            router.back()
          },
        },
      ]
    )
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  function careLabel(type: CareLog['type']) {
    switch (type) {
      case 'watered':       return '💧 Watered'
      case 'fertilized':    return '🌿 Fertilized'
      case 'note':          return '📝 Note'
      case 'repotted':      return '🪴 Repotted'
      case 'pruned':        return '✂️ Pruned'
      case 'misted':        return '💦 Misted'
      case 'pest_treatment': return '🐛 Pest Treatment'
      case 'moved':         return '📍 Moved'
    }
  }

  // Merge care logs and analyses into one sorted timeline for the History tab
  function buildTimeline(): TimelineItem[] {
    const allAnalyses = latestAnalysis
      ? [latestAnalysis, ...analysisHistory]
      : analysisHistory

    const items: TimelineItem[] = [
      ...careLogs.map(log => ({
        kind: 'care' as const,
        id: log.id,
        date: log.logged_at,
        data: log,
      })),
      ...allAnalyses.map(a => ({
        kind: 'analysis' as const,
        id: a.id,
        date: a.created_at,
        data: a,
      })),
    ]

    // Sort newest first
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2d6a4f" /></View>
  }

  // ── Sub-renderers — defined before return so JSX can call them ─────────────

  function renderOverview() {
    return (
      <>
        {/* Full-width hero photo — the most recent photo fills the top of the tab */}
        <View style={styles.heroSection}>
          {photos.length > 0 ? (
            <Image
              source={{ uri: photoUrls[photos[0].id] }}
              style={styles.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroPlaceholderIcon}>🌿</Text>
              <Text style={styles.heroPlaceholderText}>No photos yet</Text>
            </View>
          )}
        </View>

        {/* Quick-action bar — four primary actions always visible without scrolling */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickAction, loggingCare && styles.disabledButton]}
            onPress={() => logCare('watered')}
            disabled={loggingCare}
          >
            <Text style={styles.quickActionIcon}>💧</Text>
            <Text style={styles.quickActionLabel}>Watered</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickAction, loggingCare && styles.disabledButton]}
            onPress={() => logCare('fertilized')}
            disabled={loggingCare}
          >
            <Text style={styles.quickActionIcon}>🌿</Text>
            <Text style={styles.quickActionLabel}>Fertilized</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickAction, loggingCare && styles.disabledButton]}
            onPress={() => setShowNoteInput(!showNoteInput)}
            disabled={loggingCare}
          >
            <Text style={styles.quickActionIcon}>📝</Text>
            <Text style={styles.quickActionLabel}>Note</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickAction, uploading && styles.disabledButton]}
            onPress={handleAddPhoto}
            disabled={uploading}
          >
            <Text style={styles.quickActionIcon}>{uploading ? '⏳' : '📷'}</Text>
            <Text style={styles.quickActionLabel}>{uploading ? 'Uploading' : 'Add Photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Secondary care actions — less frequent but real gardeners use these */}
        <TouchableOpacity
          style={styles.moreActionsToggle}
          onPress={() => setShowMoreActions(!showMoreActions)}
        >
          <Text style={styles.moreActionsToggleText}>
            {showMoreActions ? '▾ Fewer actions' : '▸ More actions'}
          </Text>
        </TouchableOpacity>

        {showMoreActions && (
          <View style={styles.secondaryActions}>
            {([
              { type: 'repotted',       icon: '🪴', label: 'Repotted' },
              { type: 'pruned',         icon: '✂️',  label: 'Pruned' },
              { type: 'misted',         icon: '💦', label: 'Misted' },
              { type: 'pest_treatment', icon: '🐛', label: 'Pest Tx' },
              { type: 'moved',          icon: '📍', label: 'Moved' },
            ] as { type: CareLog['type']; icon: string; label: string }[]).map(action => (
              <TouchableOpacity
                key={action.type}
                style={[styles.secondaryAction, loggingCare && styles.disabledButton]}
                onPress={() => logCare(action.type)}
                disabled={loggingCare}
              >
                <Text style={styles.secondaryActionIcon}>{action.icon}</Text>
                <Text style={styles.secondaryActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Inline note input — appears below the quick-action bar when Note is tapped */}
        {showNoteInput && (
          <View style={styles.noteInputRow}>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="e.g. Repotted, pruned, treated for pests..."
              placeholderTextColor="#aaa"
              returnKeyType="done"
              onSubmitEditing={handleNoteSubmit}
              autoFocus
            />
            <TouchableOpacity
              style={styles.noteSubmitButton}
              onPress={handleNoteSubmit}
              disabled={!noteText.trim()}
            >
              <Text style={styles.noteSubmitText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* AI analysis button */}
        {photos.length > 0 && (
          <TouchableOpacity
            style={[styles.analyzeButton, analyzing && styles.disabledButton]}
            onPress={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <View style={styles.analyzeButtonInner}>
                <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                <Text style={styles.analyzeButtonText}>Analyzing...</Text>
              </View>
            ) : (
              <Text style={styles.analyzeButtonText}>
                {latestAnalysis ? '🔍 Re-analyze Plant' : '🔍 Analyze Plant'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Latest analysis card */}
        {latestAnalysis && (
          <View style={styles.analysisCard}>
            <View style={styles.analysisCardHeader}>
              <Text style={styles.analysisTitle}>Latest Analysis</Text>
              <Text style={styles.analysisDate}>{formatDate(latestAnalysis.created_at)}</Text>
            </View>
            <View style={styles.analysisSection}>
              <Text style={styles.analysisSectionLabel}>🌿 SPECIES</Text>
              <Text style={styles.analysisSectionText}>{latestAnalysis.species}</Text>
            </View>
            <View style={styles.analysisSection}>
              <Text style={styles.analysisSectionLabel}>❤️ HEALTH</Text>
              <Text style={styles.analysisSectionText}>{latestAnalysis.health}</Text>
            </View>
            <View style={styles.analysisSection}>
              <Text style={styles.analysisSectionLabel}>💧 CARE TIPS</Text>
              <Text style={styles.analysisSectionText}>{latestAnalysis.care}</Text>
            </View>
            <Text style={styles.analysisDisclaimer}>AI-generated — use as guidance only.</Text>
          </View>
        )}

        {/* Watering reminder */}
        <View style={styles.reminderSection}>
          <Text style={styles.sectionTitle}>Watering Reminder</Text>
          {reminderDays ? (
            <View style={styles.reminderActive}>
              <Text style={styles.reminderActiveText}>💧 Every {reminderDays} days</Text>
              <TouchableOpacity onPress={removeReminder} disabled={savingReminder}>
                <Text style={styles.reminderRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.reminderNoneText}>No reminder set</Text>
          )}
          <View style={styles.reminderChips}>
            {REMINDER_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.days}
                style={[
                  styles.reminderChip,
                  reminderDays === option.days && styles.reminderChipActive,
                ]}
                onPress={() => setReminder(option.days)}
                disabled={savingReminder}
              >
                <Text style={[
                  styles.reminderChipText,
                  reminderDays === option.days && styles.reminderChipTextActive,
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Plant notes */}
        {plant?.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesText}>{plant.notes}</Text>
          </View>
        ) : null}

        {/* Plant details — location, pot, dates */}
        {(plant?.location || plant?.pot_size || plant?.acquired_date || plant?.last_repotted_date) ? (
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Details</Text>
            {plant.location ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>📍 Location</Text>
                <Text style={styles.detailValue}>{plant.location}</Text>
              </View>
            ) : null}
            {plant.pot_size ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🪴 Pot size</Text>
                <Text style={styles.detailValue}>{plant.pot_size}</Text>
              </View>
            ) : null}
            {plant.acquired_date ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🗓 Acquired</Text>
                <Text style={styles.detailValue}>{formatDate(plant.acquired_date)}</Text>
              </View>
            ) : null}
            {plant.last_repotted_date ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🪴 Last repotted</Text>
                <Text style={styles.detailValue}>{formatDate(plant.last_repotted_date)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Added date and delete */}
        <View style={styles.metaSection}>
          <Text style={styles.metaText}>
            Added{' '}
            {new Date(plant!.created_at).toLocaleDateString(undefined, {
              month: 'long', day: 'numeric', year: 'numeric',
            })}
          </Text>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete Plant</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  function renderHistory() {
    const timeline = buildTimeline()

    if (timeline.length === 0) {
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyTabIcon}>📋</Text>
          <Text style={styles.emptyTabTitle}>No history yet</Text>
          <Text style={styles.emptyTabText}>
            Log care events or run an AI analysis on the Overview tab to start building your plant's history.
          </Text>
        </View>
      )
    }

    return (
      <View style={{ paddingBottom: 16 }}>
        {timeline.map((item, index) => (
          <View key={item.id} style={styles.timelineItem}>
            {/* Left rail — dot and connecting line */}
            <View style={styles.timelineRail}>
              <View style={[
                styles.timelineDot,
                item.kind === 'analysis' && styles.timelineDotAnalysis,
              ]} />
              {index < timeline.length - 1 && <View style={styles.timelineLine} />}
            </View>

            {/* Right content */}
            <View style={styles.timelineContent}>
              <Text style={styles.timelineDate}>{formatDate(item.date)}</Text>

              {item.kind === 'care' ? (
                <>
                  <Text style={styles.timelineType}>{careLabel(item.data.type)}</Text>
                  {item.data.notes ? (
                    <Text style={styles.timelineNote}>{item.data.notes}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.timelineType}>🔍 AI Analysis</Text>
                  {item.data.species ? (
                    <Text style={styles.timelineNote}>Species: {item.data.species}</Text>
                  ) : null}
                  {item.data.health ? (
                    <Text style={styles.timelineNote}>{item.data.health}</Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        ))}
      </View>
    )
  }

  function renderSpecies() {
    // Still loading from scratch
    if (fetchingSpeciesProfile && !speciesProfile) {
      return (
        <View style={styles.emptyTab}>
          <ActivityIndicator size="large" color="#2d6a4f" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTabText}>Fetching species info...</Text>
        </View>
      )
    }

    // The best known species name — prefer the manually-set field, fall back to
    // the AI-identified species from the most recent analysis. plant.species is only
    // populated if the user typed it in the Edit form; the AI saves to analysis_results.
    const knownSpecies = plant?.species || latestAnalysis?.species

    // We already have a profile in state — show it immediately.
    // Check this before knownSpecies so we never block on a stale plant.species value.
    if (speciesProfile) {
      // falls through to the full profile render below
    } else if (!knownSpecies) {
      // No species identified yet at all
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyTabIcon}>🔍</Text>
          <Text style={styles.emptyTabTitle}>Species unknown</Text>
          <Text style={styles.emptyTabText}>
            Run an AI analysis on the Overview tab to identify your plant's species and unlock the full species guide.
          </Text>
        </View>
      )
    } else {
      // Species is known from AI but profile hasn't been loaded yet
      return (
        <View style={styles.emptyTab}>
          <Text style={styles.emptyTabIcon}>📖</Text>
          <Text style={styles.emptyTabTitle}>{knownSpecies}</Text>
          <TouchableOpacity
            style={styles.fetchProfileButton}
            onPress={() => fetchSpeciesProfileFromAI(knownSpecies)}
            disabled={fetchingSpeciesProfile}
          >
            <Text style={styles.fetchProfileText}>
              {fetchingSpeciesProfile ? 'Loading...' : 'Load Species Guide'}
            </Text>
          </TouchableOpacity>
        </View>
      )
    }

    // Full species profile
    const fields = [
      { label: '☀️ Light', value: speciesProfile.light },
      { label: '💧 Watering', value: speciesProfile.watering },
      { label: '💨 Humidity', value: speciesProfile.humidity },
      { label: '🌡️ Temperature', value: speciesProfile.temperature },
      { label: '🪴 Soil', value: speciesProfile.soil },
      { label: '⚠️ Toxicity', value: speciesProfile.toxicity },
      { label: '🐛 Common Problems', value: speciesProfile.common_problems },
      { label: '🌱 Growth Habits', value: speciesProfile.growth_habits },
      { label: '✂️ Propagation', value: speciesProfile.propagation },
    ].filter(f => f.value)

    return (
      <>
        {/* Species name header with refresh button */}
        <View style={styles.speciesHeader}>
          <View style={{ flex: 1, marginRight: 12 }}>
            {speciesProfile.common_names ? (
              <Text style={styles.speciesCommonName}>{speciesProfile.common_names}</Text>
            ) : null}
            {speciesProfile.scientific_name ? (
              <Text style={styles.speciesScientificName}>{speciesProfile.scientific_name}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => fetchSpeciesProfileFromAI(speciesProfile.species_name, true)}
            disabled={fetchingSpeciesProfile}
          >
            <Text style={styles.refreshText}>
              {fetchingSpeciesProfile ? 'Refreshing...' : 'Refresh'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* All care fields, no collapsing needed — it's their own tab */}
        {fields.map(field => (
          <View key={field.label} style={styles.speciesField}>
            <Text style={styles.speciesFieldLabel}>{field.label}</Text>
            <Text style={styles.speciesFieldValue}>{field.value}</Text>
          </View>
        ))}
      </>
    )
  }

  function renderEditForm() {
    return (
      <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
        <Text style={styles.editTitle}>Edit Plant</Text>

        <Text style={styles.editLabel}>Nickname *</Text>
        <TextInput
          style={styles.editInput}
          value={nickname}
          onChangeText={setNickname}
          placeholderTextColor="#aaa"
        />

        <Text style={styles.editLabel}>Species</Text>
        <TextInput
          style={styles.editInput}
          value={species}
          onChangeText={setSpecies}
          placeholder="e.g. Monstera deliciosa"
          placeholderTextColor="#aaa"
        />

        <Text style={styles.editLabel}>Location</Text>
        <TextInput
          style={styles.editInput}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Living room — east window"
          placeholderTextColor="#aaa"
        />

        <Text style={styles.editLabel}>Pot size</Text>
        <TextInput
          style={styles.editInput}
          value={potSize}
          onChangeText={setPotSize}
          placeholder="e.g. 6 inch terracotta"
          placeholderTextColor="#aaa"
        />

        <Text style={styles.editLabel}>Date acquired</Text>
        <TextInput
          style={styles.editInput}
          value={acquiredDate}
          onChangeText={setAcquiredDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#aaa"
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.editLabel}>Last repotted</Text>
        <TextInput
          style={styles.editInput}
          value={lastRepottedDate}
          onChangeText={setLastRepottedDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#aaa"
          keyboardType="numbers-and-punctuation"
        />

        <Text style={styles.editLabel}>Notes</Text>
        <TextInput
          style={[styles.editInput, styles.editTextArea]}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          placeholderTextColor="#aaa"
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Main return ────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Fixed header — always visible */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← My Plants</Text>
          </TouchableOpacity>
          <View style={styles.headerRow}>
            <View style={styles.headerTitles}>
              <Text style={styles.plantName} numberOfLines={1}>{plant?.nickname}</Text>
              {plant?.species ? (
                <Text style={styles.plantSpecies} numberOfLines={1}>{plant.species}</Text>
              ) : null}
            </View>
            {editing ? (
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={styles.headerAction}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.headerAction}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tab bar — hidden when editing so the edit form has full focus */}
        {!editing && (
          <View style={styles.tabBar}>
            {(['overview', 'history', 'species'] as Tab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                  {tab === 'overview' ? 'Overview' : tab === 'history' ? 'History' : 'Species'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Scrollable tab content */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {editing
            ? renderEditForm()
            : activeTab === 'overview'
              ? renderOverview()
              : activeTab === 'history'
                ? renderHistory()
                : renderSpecies()
          }
        </ScrollView>
      </KeyboardAvoidingView>
    </PageContainer>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  disabledButton: { opacity: 0.5 },

  // ── Header ──
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: { marginBottom: 8 },
  backText: { color: '#2d6a4f', fontSize: 15 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitles: { flex: 1, marginRight: 16 },
  plantName: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  plantSpecies: { fontSize: 13, color: '#888', marginTop: 2, fontStyle: 'italic' },
  headerAction: { fontSize: 16, color: '#2d6a4f', fontWeight: '600', paddingTop: 2 },

  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: '#2d6a4f' },
  tabLabel: { fontSize: 13, fontWeight: '500', color: '#aaa' },
  tabLabelActive: { color: '#2d6a4f', fontWeight: '700' },

  // ── Scroll area ──
  scrollArea: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { paddingBottom: 60 },

  // ── Hero photo ──
  heroSection: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#f4faf7',
  },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroPlaceholderIcon: { fontSize: 52 },
  heroPlaceholderText: { fontSize: 15, color: '#aaa', marginTop: 10 },

  // ── Quick-action bar ──
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 8,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    backgroundColor: '#f4faf7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4eadf',
  },
  quickActionIcon: { fontSize: 20, marginBottom: 4 },
  quickActionLabel: { fontSize: 10, color: '#2d6a4f', fontWeight: '600' },

  // ── Note input ──
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d4eadf',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#f4faf7',
  },
  noteSubmitButton: {
    backgroundColor: '#2d6a4f',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noteSubmitText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // ── Analyze button ──
  analyzeButton: {
    backgroundColor: '#2d6a4f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
  },
  analyzeButtonInner: { flexDirection: 'row', alignItems: 'center' },
  analyzeButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Analysis card ──
  analysisCard: {
    backgroundColor: '#f4faf7',
    borderRadius: 14,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#d4eadf',
  },
  analysisCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  analysisTitle: { fontSize: 15, fontWeight: '700', color: '#2d6a4f' },
  analysisDate: { fontSize: 12, color: '#aaa' },
  analysisSection: { marginBottom: 12 },
  analysisSectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#2d6a4f',
    letterSpacing: 0.8, marginBottom: 4,
  },
  analysisSectionText: { fontSize: 14, color: '#333', lineHeight: 22 },
  analysisDisclaimer: { fontSize: 12, color: '#aaa', marginTop: 4, fontStyle: 'italic' },

  // ── Reminder section ──
  reminderSection: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 10 },
  reminderActive: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reminderActiveText: { fontSize: 14, color: '#2d6a4f' },
  reminderRemoveText: { fontSize: 14, color: '#e74c3c' },
  reminderNoneText: { fontSize: 13, color: '#aaa', marginBottom: 10 },
  reminderChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d4eadf',
    backgroundColor: '#f4faf7',
  },
  reminderChipActive: { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  reminderChipText: { fontSize: 13, color: '#2d6a4f' },
  reminderChipTextActive: { color: '#fff', fontWeight: '600' },

  // ── More actions toggle + secondary care row ──
  moreActionsToggle: { paddingHorizontal: 16, paddingBottom: 10 },
  moreActionsToggleText: { fontSize: 13, color: '#2d6a4f', fontWeight: '600' },
  secondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#f4faf7',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d4eadf',
    gap: 6,
  },
  secondaryActionIcon: { fontSize: 15 },
  secondaryActionLabel: { fontSize: 13, color: '#2d6a4f', fontWeight: '500' },

  // ── Notes + meta ──
  notesSection: { paddingHorizontal: 16, marginBottom: 20 },
  notesText: { fontSize: 14, color: '#555', lineHeight: 22 },

  // ── Plant details (location, pot, dates) ──
  detailsSection: { paddingHorizontal: 16, marginBottom: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  detailLabel: { fontSize: 13, color: '#888', flex: 1 },
  detailValue: { fontSize: 13, color: '#333', flex: 2, textAlign: 'right' },
  metaSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: { fontSize: 13, color: '#aaa' },
  deleteText: { fontSize: 14, color: '#e74c3c' },

  // ── Timeline (History tab) ──
  timelineItem: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  timelineRail: {
    width: 20,
    alignItems: 'center',
    marginRight: 14,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2d6a4f',
    marginTop: 4,
  },
  timelineDotAnalysis: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1a4a38',
    marginTop: 3,
  },
  timelineLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: '#d4eadf',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  timelineDate: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  timelineType: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  timelineNote: { fontSize: 13, color: '#666', lineHeight: 20 },

  // ── Empty tab state ──
  emptyTab: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  emptyTabIcon: { fontSize: 48, marginBottom: 16 },
  emptyTabTitle: {
    fontSize: 18, fontWeight: '700', color: '#333',
    marginBottom: 8, textAlign: 'center',
  },
  emptyTabText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },

  // ── Species tab ──
  speciesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  speciesCommonName: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  speciesScientificName: { fontSize: 13, color: '#888', fontStyle: 'italic' },
  refreshText: { fontSize: 14, color: '#2d6a4f', fontWeight: '600' },
  speciesField: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  speciesFieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#2d6a4f',
    letterSpacing: 0.8, marginBottom: 6,
  },
  speciesFieldValue: { fontSize: 14, color: '#333', lineHeight: 22 },
  fetchProfileButton: {
    marginTop: 24,
    backgroundColor: '#2d6a4f',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 10,
  },
  fetchProfileText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Edit form ──
  editTitle: {
    fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 24,
  },
  editLabel: {
    fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#d4eadf',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  editTextArea: { height: 100, textAlignVertical: 'top' },
  saveButton: {
    backgroundColor: '#2d6a4f',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
