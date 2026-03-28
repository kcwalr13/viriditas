// app/_layout.tsx
// The root of the entire app. This file:
// 1. Checks if the user is logged in when the app opens
// 2. Listens for sign in / sign out events
// 3. Automatically redirects the user to the right screen
// 4. Sets up push notification permissions and handlers
import { supabase } from '@/lib/supabase'
import { Session } from '@supabase/supabase-js'
import { Stack, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { setupNotificationHandler, registerForNotifications } from '@/lib/notifications'

// Set up foreground notification display behavior at app startup.
// Uses a safe wrapper that handles Expo Go limitations via dynamic require().
setupNotificationHandler()

// Redirects the user based purely on session state.
// This effect only re-runs when session or loading actually changes —
// so it won't interrupt navigation between sign-in and sign-up screens,
// and won't cause redirect loops.
function useAuthGate(session: Session | null, loading: boolean) {
  const router = useRouter()

  useEffect(() => {
    if (loading) return // Wait until we know the auth state

    if (session) {
      // Logged in — go to the main app
      router.replace('/(tabs)')
    } else {
      // Not logged in — go to sign in
      router.replace('/(auth)/sign-in')
    }
  }, [session, loading])
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Request notification permissions when the app first opens
    registerForNotifications()

    // Check for an existing session when the app first opens
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Subscribe to future sign in / sign out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // Clean up the subscription when the component is removed
    return () => subscription.unsubscribe()
  }, [])

  useAuthGate(session, loading)

  return <Stack screenOptions={{ headerShown: false }} />
}
