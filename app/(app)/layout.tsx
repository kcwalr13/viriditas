// app/(app)/layout.tsx
// Protected layout — wraps all authenticated screens.
// Auth guard: double-checks session server-side (middleware runs first).
// Renders the floating bottom nav.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Main content area. pb-28 leaves room for the floating pill nav. */}
      <main className="flex-1 pb-28">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
