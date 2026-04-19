// app/(app)/layout.tsx
// Protected layout — wraps all authenticated screens.
// Auth guard: double-checks session server-side (middleware runs first).
// Renders the floating bottom nav.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NavGuard } from '@/components/NavGuard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* pb-28 leaves room for the floating pill nav on screens that show it.
          Plant detail and add-plant manage their own bottom spacing. */}
      <main className="flex-1 pb-28">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      <NavGuard />
    </div>
  )
}
