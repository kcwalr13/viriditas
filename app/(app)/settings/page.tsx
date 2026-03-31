'use client'
// app/(app)/settings/page.tsx
// Settings screen — shows the signed-in user's email, sign out button, and app info.

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [email,        setEmail]        = useState<string | null>(null)
  const [signingOut,   setSigningOut]   = useState(false)

  // Fetch the current user's email on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null)
    })
  }, [supabase])

  async function handleSignOut() {
    const confirmed = window.confirm('Sign out of Viriditas?')
    if (!confirmed) return
    setSigningOut(true)
    await supabase.auth.signOut()
    // Redirect to sign-in and force a full refresh so the middleware re-evaluates auth
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* ── Account section ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Account
        </h2>
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {/* Signed-in email */}
          <div className="px-4 py-4 border-b border-gray-50">
            <p className="text-xs text-gray-400 mb-0.5">Signed in as</p>
            <p className="text-sm font-medium text-gray-800">{email ?? 'Loading…'}</p>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full text-left px-4 py-4 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      </section>

      {/* ── About section ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          About
        </h2>
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-4 flex items-center justify-between border-b border-gray-50">
            <span className="text-sm text-gray-600">App</span>
            <span className="text-sm font-medium text-gray-800">🌿 Viriditas</span>
          </div>
          <div className="px-4 py-4 flex items-center justify-between border-b border-gray-50">
            <span className="text-sm text-gray-600">Version</span>
            <span className="text-sm text-gray-500">1.0.0</span>
          </div>
          <div className="px-4 py-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              Viriditas is a houseplant care companion. Photograph your plants for AI-powered
              health analysis, track care history, and access species guides for your entire
              collection.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
