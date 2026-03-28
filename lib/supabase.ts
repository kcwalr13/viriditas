// This file creates a single shared connection to your Supabase backend.
// Import { supabase } from here anywhere in the app that needs database or auth access.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On native (iOS/Android), use AsyncStorage to persist the session.
    // On web, leave storage undefined — Supabase defaults to localStorage in the browser.
    // This avoids a crash during Expo's static build pass, which runs in Node.js
    // (a server environment where window/localStorage don't exist). Supabase handles
    // missing localStorage gracefully during that pass.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On web, Supabase can pick up auth tokens from the URL after OAuth/magic link flows.
    // On native, this isn't applicable.
    detectSessionInUrl: Platform.OS === 'web',
  },
})