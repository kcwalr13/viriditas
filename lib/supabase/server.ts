// lib/supabase/server.ts
// Server-side Supabase client — use this in Server Components and Route Handlers.
// Reads the session from cookies (set by @supabase/ssr middleware) rather than localStorage.
import { createServerClient } from '@supabase/ssr'
import type { CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  // cookies() returns a read-only store in Server Components.
  // In Route Handlers it is writable, but the try/catch in setAll handles that.
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Parameters<CookieMethodsServer['setAll']>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookies are read-only here.
            // The middleware.ts refreshes the session cookie on every request,
            // so this is safe to ignore.
          }
        },
      },
    }
  )
}
