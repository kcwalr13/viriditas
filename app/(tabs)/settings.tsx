// app/(tabs)/settings.tsx
// Settings screen — account management and app information.
// Replaces the old placeholder Explore tab.

import { useEffect, useState } from 'react'
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import PageContainer from '@/components/PageContainer'
import { supabase } from '@/lib/supabase'

// App version — keep in sync with app.json
const APP_VERSION = '1.0.0'

export default function SettingsScreen() {
  const [email, setEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  // Load the signed-in user's email on mount
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email ?? null)
    }
    loadUser()
  }, [])

  // Sign the user out. The auth state listener in app/_layout.tsx will
  // detect the session change and redirect to the sign-in screen automatically —
  // no manual navigation needed here.
  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true)
            const { error } = await supabase.auth.signOut()
            if (error) {
              Alert.alert('Error', 'Could not sign out. Please try again.')
              setSigningOut(false)
            }
            // On success: _layout.tsx auth listener handles the redirect
          },
        },
      ]
    )
  }

  return (
    <PageContainer>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* ── Account section ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>

          <View style={styles.card}>
            {/* Avatar initial — derived from the email address */}
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {email ? email[0].toUpperCase() : '?'}
                </Text>
              </View>
              <View style={styles.avatarInfo}>
                <Text style={styles.avatarLabel}>Signed in as</Text>
                <Text style={styles.avatarEmail} numberOfLines={1}>
                  {email ?? '—'}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.signOutRow}
              onPress={handleSignOut}
              disabled={signingOut}
              activeOpacity={0.7}
            >
              <Text style={styles.signOutText}>
                {signingOut ? 'Signing out…' : 'Sign Out'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── About section ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>

          <View style={styles.card}>
            <View style={styles.aboutHeader}>
              <Text style={styles.appName}>🌿 Viriditas</Text>
              <Text style={styles.appVersion}>v{APP_VERSION}</Text>
            </View>
            <Text style={styles.aboutDescription}>
              Your personal plant care companion. Track your collection, log care events,
              and get AI-powered health analysis and species guidance — all in one place.
            </Text>
          </View>
        </View>

      </ScrollView>
    </PageContainer>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8faf9',
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // ── Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 8,
    backgroundColor: '#f8faf9',
  },
  headerTitle: {
    fontSize: 32, fontWeight: 'bold', color: '#2d6a4f',
  },

  // ── Section wrapper
  section: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9aab9a',
    letterSpacing: 1,
    marginBottom: 10,
  },

  // ── Card — white container shared by all sections
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // ── Account — avatar row
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2d6a4f',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#fff', fontSize: 18, fontWeight: '700',
  },
  avatarInfo: {
    flex: 1,
  },
  avatarLabel: {
    fontSize: 12, color: '#999', marginBottom: 2,
  },
  avatarEmail: {
    fontSize: 15, fontWeight: '600', color: '#222',
  },

  // Thin separator between avatar and sign-out rows
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 18,
  },

  // Sign out row
  signOutRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d9534f', // red — signals a destructive action
  },

  // ── About section
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  appName: {
    fontSize: 17, fontWeight: '700', color: '#2d6a4f',
  },
  appVersion: {
    fontSize: 13, color: '#aaa', fontWeight: '500',
  },
  aboutDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 21,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
})
