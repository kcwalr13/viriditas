// app/(app)/layout.tsx
// Protected layout — wraps all authenticated screens.
// Contains the bottom navigation bar (My Plants / Settings).
// Auth guard: redirects to /sign-in if no session (middleware handles this too,
// but the server layout double-checks so we can render user-specific data).
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Belt-and-suspenders: middleware should catch this first, but just in case.
  if (!user) redirect('/sign-in')

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Main content area — grows to fill space, leaves room for bottom nav */}
      <main className="flex-1 pb-20">
        {/* Constrain content width on desktop, full-width on mobile */}
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-bottom z-50">
        <div className="max-w-2xl mx-auto flex">
          <NavItem href="/" label="My Plants" icon="🌿" />
          <NavItem href="/settings" label="Settings" icon="⚙️" />
        </div>
      </nav>
    </div>
  )
}

// Individual bottom nav item — highlights when active
function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-gray-400 hover:text-brand transition-colors"
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}
