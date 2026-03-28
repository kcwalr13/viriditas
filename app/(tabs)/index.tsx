// app/(tabs)/index.tsx
// The main screen — shows the user's list of registered plants.
// Refreshes automatically every time you navigate back to this screen.
import { supabase } from '@/lib/supabase'
import { Plant } from '@/lib/types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import PageContainer from '@/components/PageContainer'

export default function MyPlantsScreen() {
  const [plants, setPlants] = useState<Plant[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  async function fetchPlants() {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching plants:', error)
    } else {
      setPlants(data || [])
    }
    setLoading(false)
  }

  // useFocusEffect runs fetchPlants every time this screen comes into view —
  // so the list updates after you add or edit a plant and navigate back.
  useFocusEffect(
    useCallback(() => {
      fetchPlants()
    }, [])
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2d6a4f" />
      </View>
    )
  }

  return (
    <PageContainer>
    <View style={styles.container}>
      <Text style={styles.header}>My Plants</Text>

      {plants.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No plants yet.</Text>
          <Text style={styles.emptySubtext}>Tap the button below to add your first plant!</Text>
        </View>
      ) : (
        <FlatList
          data={plants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.plantCard}
              onPress={() => router.push(`/plant/${item.id}`)}
            >
              <Text style={styles.plantNickname}>{item.nickname}</Text>
              {item.species && (
                <Text style={styles.plantSpecies}>{item.species}</Text>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => router.push('/add-plant')}
      >
        <Text style={styles.addButtonText}>+ Add Plant</Text>
      </TouchableOpacity>
    </View>
    </PageContainer>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { fontSize: 32, fontWeight: 'bold', color: '#2d6a4f', marginBottom: 24 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#555', marginBottom: 8 },
  emptySubtext: { fontSize: 15, color: '#aaa', textAlign: 'center' },
  plantCard: {
    backgroundColor: '#f4faf7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d4eadf',
  },
  plantNickname: { fontSize: 18, fontWeight: '600', color: '#2d6a4f' },
  plantSpecies: { fontSize: 14, color: '#888', marginTop: 4, fontStyle: 'italic' },
  addButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#2d6a4f',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 28,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})