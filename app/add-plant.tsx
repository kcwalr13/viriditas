// app/add-plant.tsx
// Form screen for registering a new plant.
// Nickname is required — everything else is optional but helps the AI give better advice.
import { DatePickerField } from '@/components/DatePickerField'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native'

export default function AddPlantScreen() {
  const [nickname, setNickname] = useState('')
  const [species, setSpecies] = useState('')
  const [location, setLocation] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAddPlant() {
    if (!nickname.trim()) {
      Alert.alert('Please give your plant a nickname.')
      return
    }

    // acquiredDate is always valid YYYY-MM-DD (set by the picker) or empty
    setLoading(true)

    // Get the currently logged-in user so we can link the plant to them
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('plants').insert({
      nickname: nickname.trim(),
      species: species.trim() || null,
      location: location.trim() || null,
      acquired_date: acquiredDate.trim() || null,
      notes: notes.trim() || null,
      user_id: user!.id,
    })

    setLoading(false)

    if (error) {
      Alert.alert('Error', 'Could not add plant. Please try again.')
      console.error(error)
    } else {
      router.back() // Return to My Plants — it will refresh automatically
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.header}>Add a Plant</Text>

        <Text style={styles.label}>Nickname *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Big Fern, Corner Phil"
          value={nickname}
          onChangeText={setNickname}
          placeholderTextColor="#aaa"
        />

        <Text style={styles.label}>Species (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Monstera deliciosa"
          value={species}
          onChangeText={setSpecies}
          placeholderTextColor="#aaa"
        />

        <Text style={styles.label}>Location (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Living room — east window"
          value={location}
          onChangeText={setLocation}
          placeholderTextColor="#aaa"
        />

        <Text style={styles.label}>Date acquired (optional)</Text>
        <DatePickerField
          value={acquiredDate}
          onChange={setAcquiredDate}
          placeholder="Tap to select a date"
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Anything else you want to remember..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          placeholderTextColor="#aaa"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddPlant}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Adding...' : 'Add Plant'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 60 },
  backButton: { marginBottom: 16 },
  backText: { color: '#2d6a4f', fontSize: 16 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#2d6a4f', marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 20, color: '#333',
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#2d6a4f', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
