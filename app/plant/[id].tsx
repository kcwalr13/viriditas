// app/plant/[id].tsx
// Shows the details of a single plant.
// Supports viewing photos, adding photos, AI analysis with history, editing, and deleting.
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

// Interval options shown to the user as quick-pick chips
const REMINDER_OPTIONS = [
  { label: 'Every 3 days', days: 3 },
  { label: 'Every 5 days', days: 5 },
  { label: 'Every 7 days', days: 7 },
  { label: 'Every 10 days', days: 10 },
  { label: 'Every 14 days', days: 14 },
]

export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [plant, setPlant] = useState<Plant | null>(null)
  const [photos, setPhotos] = useState<PlantPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // AI analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisResult | null>(null)
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)

  // Species profile — encyclopedic reference data fetched once per species and cached
  const [speciesProfile, setSpeciesProfile] = useState<SpeciesProfile | null>(null)
  const [fetchingSpeciesProfile, setFetchingSpeciesProfile] = useState(false)
  const [speciesProfileExpanded, setSpeciesProfileExpanded] = useState(false)

  // Reminder state — tracks the currently saved interval (in days) for this plant
  const [reminderDays, setReminderDays] = useState<number | null>(null)
  const [savingReminder, setSavingReminder] = useState(false)

  // Care log state
  const [careLogs, setCareLogs] = useState<CareLog[]>([])
  const [loggingCare, setLoggingCare] = useState(false)
  const [careLogsExpanded, setCareLogsExpanded] = useState(false)
  // When adding a custom note, we show a small inline input
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState('')

  // Edit form fields — pre-filled when editing starts
  const [nickname, setNickname] = useState('')
  const [species, setSpecies] = useState('')
  const [notes, setNotes] = useState('')

  // useFocusEffect re-runs fetchPlant and fetchPhotos every time the screen
  // comes into focus (e.g. navigating back from another screen)
  useFocusEffect(
    useCallback(() => {
      fetchPlant()
      fetchPhotos()
      fetchAnalysisHistory()
      fetchCareLogs()
    }, [id])
  )

  // When we learn what species the plant is (either from DB on load or after analysis),
  // check if we already have a cached species profile for it.
  useEffect(() => {
    if (plant?.species) {
      fetchSpeciesProfileFromDB(plant.species)
    }
  }, [plant?.species])

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
      .order('created_at', { ascending: false }) // Newest photos first

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
      .order('created_at', { ascending: false }) // Newest first

    if (!error && data && data.length > 0) {
      setLatestAnalysis(data[0])          // Most recent — shown in the main card
      setAnalysisHistory(data.slice(1))   // The rest — shown in collapsible history
    } else {
      setLatestAnalysis(null)
      setAnalysisHistory([])
    }
  }

  // ── Species Profile ────────────────────────────────────────────────────────

  // Check the local DB for a cached species profile. This is a fast, free lookup —
  // no AI call needed if we've already fetched this species before.
  async function fetchSpeciesProfileFromDB(speciesName: string) {
    const { data, error } = await supabase
      .from('species_profiles')
      .select('*')
      .eq('species_name', speciesName)
      .single()

    if (!error && data) {
      setSpeciesProfile(data)
    }
  }

  // Call the fetch-species-info Edge Function to get (or create) a species profile.
  // The Edge Function checks its own cache first; only calls the AI if needed.
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

      if (data?.profile) {
        setSpeciesProfile(data.profile)
      }
    } catch (err: any) {
      Alert.alert('Species info unavailable', err.message || 'Could not fetch species info.')
    } finally {
      setFetchingSpeciesProfile(false)
    }
  }

  // ── Reminders ─────────────────────────────────────────────────────────────

  // Set or update a watering reminder for this plant.
  // Cancels any existing notification, schedules a new repeating one,
  // saves the interval to Supabase, and stores the notification ID locally.
  async function setReminder(days: number) {
    setSavingReminder(true)
    try {
      // Cancel any existing notification for this plant first
      const existingId = await AsyncStorage.getItem(reminderKey(id))
      if (existingId) {
        await cancelNotification(existingId)
      }

      // Schedule a new repeating notification via our safe wrapper
      const notificationId = await scheduleWateringReminder(
        plant?.nickname ?? 'Your plant',
        days
      )

      // Save the notification ID on-device so we can cancel it later
      if (notificationId) {
        await AsyncStorage.setItem(reminderKey(id), notificationId)
      }

      // Save the interval preference to Supabase for display and persistence
      await supabase.from('plants').update({ watering_interval_days: days }).eq('id', id)

      setReminderDays(days)
    } catch (error: any) {
      Alert.alert('Error', 'Could not set reminder. Please try again.')
    } finally {
      setSavingReminder(false)
    }
  }

  // Remove the watering reminder for this plant entirely.
  async function removeReminder() {
    setSavingReminder(true)
    try {
      // Cancel the scheduled notification if one exists
      const existingId = await AsyncStorage.getItem(reminderKey(id))
      if (existingId) {
        await cancelNotification(existingId)
        await AsyncStorage.removeItem(reminderKey(id))
      }

      // Clear the interval from Supabase
      await supabase.from('plants').update({ watering_interval_days: null }).eq('id', id)

      setReminderDays(null)
    } catch (error: any) {
      Alert.alert('Error', 'Could not remove reminder.')
    } finally {
      setSavingReminder(false)
    }
  }

  // ── Care Logs ──────────────────────────────────────────────────────────────

  async function fetchCareLogs() {
    const { data, error } = await supabase
      .from('care_logs')
      .select('*')
      .eq('plant_id', id)
      .order('logged_at', { ascending: false })
      .limit(20) // Show the 20 most recent events

    if (!error && data) setCareLogs(data)
  }

  // Log a care event. type is 'watered', 'fertilized', or 'note'.
  // For 'watered' and 'fertilized', notes is optional.
  // For 'note', the notes field holds the custom text.
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
      await fetchCareLogs() // Refresh the list
    } catch (error: any) {
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

  // Returns a readable label and emoji for each care type
  function careLabel(type: CareLog['type']) {
    switch (type) {
      case 'watered':    return '💧 Watered'
      case 'fertilized': return '🌿 Fertilized'
      case 'note':       return '📝 Note'
    }
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

      // Fetch the most recent analyses to send as context — we use the last 3
      // so Claude can describe progress over time without sending too much data
      const { data: historyData } = await supabase
        .from('analysis_results')
        .select('species, health, care, created_at')
        .eq('plant_id', id)
        .order('created_at', { ascending: false })
        .limit(3)

      // Format previous analyses as a compact summary for the AI prompt
      const previousAnalyses = (historyData ?? []).map((r: any) => ({
        date: new Date(r.created_at).toLocaleDateString(),
        species: r.species,
        health: r.health,
        care: r.care,
      }))

      // Also fetch recent care logs so the AI knows what care the plant has
      // received — e.g. "watered 2 days ago, fertilized last week"
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

      // Get session token — supabase.functions.invoke doesn't reliably inject
      // the auth token in React Native, so we pass it explicitly
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const { data, error } = await supabase.functions.invoke('analyze-plant', {
        body: {
          imageUrl,
          previousAnalyses,
          recentCareLogs,
          // Pass the cached species profile so the AI knows ideal conditions up front
          speciesProfile: speciesProfile ?? null,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (error) {
        let message = error.message
        try {
          const body = await (error as any).context?.json?.()
          if (body?.error) message = body.error
        } catch {}
        throw new Error(message)
      }
      if (data?.error) throw new Error(data.error)

      const result = data.result

      // Save the analysis result to the database so it becomes part of history
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('analysis_results').insert({
        plant_id: id,
        user_id: user!.id,
        photo_id: latestPhoto.id,
        species: result.species,
        health: result.health,
        care: result.care,
      })

      // If a species was identified and we don't have a profile yet, fetch one.
      // This happens in the background after the main analysis completes.
      if (result.species && !speciesProfile) {
        fetchSpeciesProfileFromAI(result.species)
      }

      // Refresh the history section to show the new result
      await fetchAnalysisHistory()

    } catch (error: any) {
      Alert.alert('Analysis failed', error.message || 'Something went wrong. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Photo handling ─────────────────────────────────────────────────────────

  function handleAddPhoto() {
    // On web, Alert.alert doesn't support custom buttons — the browser's native
    // alert() ignores the buttons array. Skip straight to the file picker instead.
    // Camera isn't available on web either, so the library is the only option.
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
      // Permission requests are native-only — browsers prompt automatically
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
    await uploadPhoto(asset.base64)
  }

  async function uploadPhoto(base64: string) {
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Convert base64 → binary → Uint8Array → ArrayBuffer for upload
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const path = `${user!.id}/${id}/${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(path, bytes.buffer, { contentType: 'image/jpeg' })

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

  // Format a date string like "Mar 27, 2026"
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#2d6a4f" /></View>
  }

  return (
    <PageContainer>
    {/* KeyboardAvoidingView shifts the screen content up when the keyboard opens
        so the focused input is never hidden behind it.
        behavior="padding" works best on iOS; "height" works best on Android. */}
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← My Plants</Text>
      </TouchableOpacity>

      {/* ── Photo gallery ── */}
      <View style={styles.photosSection}>
        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {photos.map((photo) => (
              <Image
                key={photo.id}
                source={{ uri: photoUrls[photo.id] }}
                style={styles.photoThumb}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.noPhotos}>
            <Text style={styles.noPhotosText}>No photos yet</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.addPhotoButton, uploading && styles.disabledButton]}
          onPress={handleAddPhoto}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color="#2d6a4f" size="small" />
            : <Text style={styles.addPhotoText}>+ Add Photo</Text>
          }
        </TouchableOpacity>
      </View>

      {/* ── Analyze button ── */}
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

      {/* ── Latest analysis result ── */}
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

          <Text style={styles.analysisDisclaimer}>
            AI-generated — use as guidance only.
          </Text>
        </View>
      )}

      {/* ── Analysis history ── */}
      {analysisHistory.length > 0 && (
        <View style={styles.historySection}>
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setHistoryExpanded(!historyExpanded)}
          >
            <Text style={styles.historyToggleText}>
              {historyExpanded ? '▾' : '▸'} Analysis History ({analysisHistory.length} previous)
            </Text>
          </TouchableOpacity>

          {historyExpanded && analysisHistory.map((entry, index) => (
            <View key={entry.id} style={styles.historyEntry}>
              <Text style={styles.historyDate}>{formatDate(entry.created_at)}</Text>

              {entry.species && (
                <>
                  <Text style={styles.analysisSectionLabel}>🌿 SPECIES</Text>
                  <Text style={styles.historyText}>{entry.species}</Text>
                </>
              )}
              {entry.health && (
                <>
                  <Text style={[styles.analysisSectionLabel, { marginTop: 10 }]}>❤️ HEALTH</Text>
                  <Text style={styles.historyText}>{entry.health}</Text>
                </>
              )}
              {entry.care && (
                <>
                  <Text style={[styles.analysisSectionLabel, { marginTop: 10 }]}>💧 CARE TIPS</Text>
                  <Text style={styles.historyText}>{entry.care}</Text>
                </>
              )}

              {/* Divider between entries, but not after the last one */}
              {index < analysisHistory.length - 1 && <View style={styles.historyDivider} />}
            </View>
          ))}
        </View>
      )}

      {/* ── Species profile ── */}
      <View style={styles.speciesProfileSection}>
        <View style={styles.speciesProfileHeader}>
          <Text style={styles.sectionTitle}>📖 Species Profile</Text>
          {speciesProfile && (
            <TouchableOpacity
              onPress={() => fetchSpeciesProfileFromAI(speciesProfile.species_name, true)}
              disabled={fetchingSpeciesProfile}
            >
              <Text style={styles.refreshText}>
                {fetchingSpeciesProfile ? 'Refreshing...' : 'Refresh'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {fetchingSpeciesProfile && !speciesProfile ? (
          // Loading from scratch — show spinner
          <View style={styles.speciesProfileLoading}>
            <ActivityIndicator size="small" color="#2d6a4f" />
            <Text style={styles.speciesProfileLoadingText}>Fetching species info...</Text>
          </View>
        ) : speciesProfile ? (
          // We have a profile — show it in a collapsible card
          <View style={styles.speciesProfileCard}>
            {speciesProfile.common_names && (
              <View style={styles.speciesProfileRow}>
                <Text style={styles.speciesProfileLabel}>COMMON NAMES</Text>
                <Text style={styles.speciesProfileValue}>{speciesProfile.common_names}</Text>
              </View>
            )}
            {speciesProfile.scientific_name && (
              <View style={styles.speciesProfileRow}>
                <Text style={styles.speciesProfileLabel}>SCIENTIFIC NAME</Text>
                <Text style={[styles.speciesProfileValue, { fontStyle: 'italic' }]}>
                  {speciesProfile.scientific_name}
                </Text>
              </View>
            )}

            {/* Toggle button for the detailed care fields */}
            <TouchableOpacity
              style={styles.speciesProfileToggle}
              onPress={() => setSpeciesProfileExpanded(!speciesProfileExpanded)}
            >
              <Text style={styles.speciesProfileToggleText}>
                {speciesProfileExpanded ? '▾ Hide care details' : '▸ Show care details'}
              </Text>
            </TouchableOpacity>

            {speciesProfileExpanded && (
              <>
                {[
                  { label: '☀️ LIGHT', value: speciesProfile.light },
                  { label: '💧 WATERING', value: speciesProfile.watering },
                  { label: '💨 HUMIDITY', value: speciesProfile.humidity },
                  { label: '🌡️ TEMPERATURE', value: speciesProfile.temperature },
                  { label: '🪴 SOIL', value: speciesProfile.soil },
                  { label: '⚠️ TOXICITY', value: speciesProfile.toxicity },
                  { label: '🐛 COMMON PROBLEMS', value: speciesProfile.common_problems },
                  { label: '🌱 GROWTH HABITS', value: speciesProfile.growth_habits },
                  { label: '✂️ PROPAGATION', value: speciesProfile.propagation },
                ].filter(item => item.value).map(item => (
                  <View key={item.label} style={styles.speciesProfileRow}>
                    <Text style={styles.speciesProfileLabel}>{item.label}</Text>
                    <Text style={styles.speciesProfileValue}>{item.value}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ) : plant?.species ? (
          // Species is known but no profile fetched yet — offer to load it
          <TouchableOpacity
            style={styles.speciesProfileFetchButton}
            onPress={() => fetchSpeciesProfileFromAI(plant.species!)}
            disabled={fetchingSpeciesProfile}
          >
            <Text style={styles.speciesProfileFetchText}>
              Load species info for {plant.species}
            </Text>
          </TouchableOpacity>
        ) : (
          // No species identified yet
          <Text style={styles.speciesProfileEmptyText}>
            Analyze your plant to identify its species and unlock the full species profile.
          </Text>
        )}
      </View>

      {/* ── Watering reminder ── */}
      <View style={styles.reminderSection}>
        <Text style={styles.sectionTitle}>Watering Reminder</Text>

        {reminderDays ? (
          // Reminder is active — show current interval and a remove button
          <View style={styles.reminderActive}>
            <Text style={styles.reminderActiveText}>
              💧 Reminder set: every {reminderDays} days
            </Text>
            <TouchableOpacity
              onPress={removeReminder}
              disabled={savingReminder}
              style={styles.reminderRemoveButton}
            >
              <Text style={styles.reminderRemoveText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.reminderNoneText}>No reminder set</Text>
        )}

        {/* Quick-pick interval chips */}
        <View style={styles.reminderChips}>
          {REMINDER_OPTIONS.map((option) => (
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

      {/* ── Care logging ── */}
      <View style={styles.careSection}>
        <Text style={styles.sectionTitle}>Log Care</Text>

        {/* Quick-tap buttons for the two most common actions */}
        <View style={styles.careButtons}>
          <TouchableOpacity
            style={[styles.careButton, loggingCare && styles.disabledButton]}
            onPress={() => logCare('watered')}
            disabled={loggingCare}
          >
            <Text style={styles.careButtonText}>💧 Watered</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.careButton, loggingCare && styles.disabledButton]}
            onPress={() => logCare('fertilized')}
            disabled={loggingCare}
          >
            <Text style={styles.careButtonText}>🌿 Fertilized</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.careButton, loggingCare && styles.disabledButton]}
            onPress={() => setShowNoteInput(!showNoteInput)}
            disabled={loggingCare}
          >
            <Text style={styles.careButtonText}>📝 Note</Text>
          </TouchableOpacity>
        </View>

        {/* Inline note input — shown when the Note button is tapped */}
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
      </View>

      {/* ── Care log history ── */}
      {careLogs.length > 0 && (
        <View style={styles.historySection}>
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setCareLogsExpanded(!careLogsExpanded)}
          >
            <Text style={styles.historyToggleText}>
              {careLogsExpanded ? '▾' : '▸'} Care History ({careLogs.length} events)
            </Text>
          </TouchableOpacity>

          {careLogsExpanded && careLogs.map((log, index) => (
            <View key={log.id} style={styles.careLogEntry}>
              <View style={styles.careLogRow}>
                <Text style={styles.careLogType}>{careLabel(log.type)}</Text>
                <Text style={styles.careLogDate}>
                  {new Date(log.logged_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </Text>
              </View>
              {log.notes && (
                <Text style={styles.careLogNote}>{log.notes}</Text>
              )}
              {index < careLogs.length - 1 && <View style={styles.historyDivider} />}
            </View>
          ))}
        </View>
      )}

      {/* ── Edit mode ── */}
      {editing ? (
        <>
          <Text style={styles.header}>Edit Plant</Text>

          <Text style={styles.label}>Nickname *</Text>
          <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholderTextColor="#aaa" />

          <Text style={styles.label}>Species</Text>
          <TextInput style={styles.input} value={species} onChangeText={setSpecies} placeholder="e.g. Monstera deliciosa" placeholderTextColor="#aaa" />

          <Text style={styles.label}>Notes</Text>
          <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline numberOfLines={4} placeholderTextColor="#aaa" />

          <TouchableOpacity style={[styles.button, saving && styles.disabledButton]} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        // ── View mode ──
        <>
          <View style={styles.titleRow}>
            <Text style={styles.header}>{plant?.nickname}</Text>
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {plant?.species && <Text style={styles.species}>{plant.species}</Text>}

          {plant?.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Notes</Text>
              <Text style={styles.sectionContent}>{plant.notes}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Added</Text>
            <Text style={styles.sectionContent}>
              {new Date(plant!.created_at).toLocaleDateString()}
            </Text>
          </View>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete Plant</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
    </PageContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backButton: { marginBottom: 16 },
  backText: { color: '#2d6a4f', fontSize: 16 },

  photosSection: { marginBottom: 16 },
  photoScroll: { marginBottom: 12 },
  photoThumb: {
    width: 130, height: 130, borderRadius: 10, marginRight: 10, backgroundColor: '#f4faf7',
  },
  noPhotos: {
    height: 110, backgroundColor: '#f4faf7', borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: '#d4eadf', borderStyle: 'dashed',
  },
  noPhotosText: { color: '#aaa', fontSize: 15 },
  addPhotoButton: {
    borderWidth: 1, borderColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  addPhotoText: { color: '#2d6a4f', fontSize: 15, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },

  analyzeButton: {
    backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginBottom: 24, marginTop: 10,
  },
  analyzeButtonInner: { flexDirection: 'row', alignItems: 'center' },
  analyzeButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Latest analysis card
  analysisCard: {
    backgroundColor: '#f4faf7', borderRadius: 14, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: '#d4eadf',
  },
  analysisCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  analysisTitle: { fontSize: 17, fontWeight: '700', color: '#2d6a4f' },
  analysisDate: { fontSize: 12, color: '#aaa' },
  analysisSection: { marginBottom: 14 },
  analysisSectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#2d6a4f', letterSpacing: 0.8, marginBottom: 4,
  },
  analysisSectionText: { fontSize: 15, color: '#333', lineHeight: 22 },
  analysisDisclaimer: { fontSize: 12, color: '#aaa', marginTop: 8, fontStyle: 'italic' },

  // Shared section title style
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12,
  },

  // Reminder section
  reminderSection: {
    marginBottom: 28,
  },
  reminderActive: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  reminderActiveText: {
    fontSize: 14, color: '#2d6a4f', fontWeight: '600',
  },
  reminderRemoveButton: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#d9534f', borderRadius: 8,
  },
  reminderRemoveText: { color: '#d9534f', fontSize: 13, fontWeight: '600' },
  reminderNoneText: { fontSize: 14, color: '#aaa', marginBottom: 12 },
  reminderChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#2d6a4f',
  },
  reminderChipActive: { backgroundColor: '#2d6a4f' },
  reminderChipText: { fontSize: 13, color: '#2d6a4f', fontWeight: '500' },
  reminderChipTextActive: { color: '#fff' },

  // Care log section
  careSection: {
    marginBottom: 8,
  },
  careButtons: {
    flexDirection: 'row', gap: 10, marginBottom: 12,
  },
  careButton: {
    flex: 1, borderWidth: 1, borderColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  careButtonText: {
    color: '#2d6a4f', fontSize: 13, fontWeight: '600',
  },
  noteInputRow: {
    flexDirection: 'row', gap: 8, marginBottom: 4,
  },
  noteInput: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#333',
  },
  noteSubmitButton: {
    backgroundColor: '#2d6a4f', borderRadius: 10,
    paddingHorizontal: 18, justifyContent: 'center',
  },
  noteSubmitText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  careLogEntry: { paddingHorizontal: 16, paddingBottom: 12 },
  careLogRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2,
  },
  careLogType: { fontSize: 14, fontWeight: '600', color: '#333' },
  careLogDate: { fontSize: 12, color: '#aaa' },
  careLogNote: { fontSize: 13, color: '#666', marginTop: 3, lineHeight: 18 },

  // History section
  historySection: {
    backgroundColor: '#fafafa', borderRadius: 14, marginBottom: 24,
    borderWidth: 1, borderColor: '#eee', overflow: 'hidden',
  },
  historyToggle: { padding: 16 },
  historyToggleText: { fontSize: 14, fontWeight: '600', color: '#2d6a4f' },
  historyEntry: { paddingHorizontal: 16, paddingBottom: 16 },
  historyDate: { fontSize: 13, fontWeight: '700', color: '#2d6a4f', marginBottom: 12 },
  historyText: { fontSize: 14, color: '#444', lineHeight: 20 },
  historyDivider: { height: 1, backgroundColor: '#eee', marginVertical: 16 },

  titleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  header: { fontSize: 28, fontWeight: 'bold', color: '#2d6a4f', flex: 1 },
  editText: { color: '#2d6a4f', fontSize: 16, paddingLeft: 12 },
  species: { fontSize: 16, color: '#888', marginBottom: 28, fontStyle: 'italic' },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  sectionContent: { fontSize: 16, color: '#333', lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 20, color: '#333',
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { paddingVertical: 16, alignItems: 'center' },
  cancelText: { color: '#888', fontSize: 16 },
  deleteButton: {
    marginTop: 48, borderWidth: 1, borderColor: '#d9534f',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  deleteText: { color: '#d9534f', fontSize: 16, fontWeight: '600' },

  // Species profile section
  speciesProfileSection: { marginBottom: 28 },
  speciesProfileHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  refreshText: { fontSize: 13, color: '#2d6a4f', fontWeight: '600' },
  speciesProfileCard: {
    backgroundColor: '#f4faf7', borderRadius: 14,
    borderWidth: 1, borderColor: '#d4eadf', overflow: 'hidden',
  },
  speciesProfileRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8f4ee',
  },
  speciesProfileLabel: {
    fontSize: 11, fontWeight: '700', color: '#2d6a4f',
    letterSpacing: 0.8, marginBottom: 4,
  },
  speciesProfileValue: { fontSize: 14, color: '#333', lineHeight: 20 },
  speciesProfileToggle: {
    paddingHorizontal: 16, paddingVertical: 12,
  },
  speciesProfileToggleText: { fontSize: 13, fontWeight: '600', color: '#2d6a4f' },
  speciesProfileLoading: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12,
  },
  speciesProfileLoadingText: { fontSize: 14, color: '#888' },
  speciesProfileFetchButton: {
    borderWidth: 1, borderColor: '#2d6a4f', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  speciesProfileFetchText: { color: '#2d6a4f', fontSize: 14, fontWeight: '600' },
  speciesProfileEmptyText: { fontSize: 14, color: '#aaa', lineHeight: 20 },
})
