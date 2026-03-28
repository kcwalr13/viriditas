// app/(tabs)/explore.tsx
// Placeholder for the Plant Encyclopedia — coming in a later phase.
import { View, Text, StyleSheet } from 'react-native'

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plant Encyclopedia</Text>
      <Text style={styles.subtitle}>Coming soon.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2d6a4f', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#aaa' },
})
