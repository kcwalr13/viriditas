// lib/supabase/client.ts
// Browser-side Supabase client — use this in Client Components ('use client').
// Creates a singleton so we don't create a new client on every render.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
