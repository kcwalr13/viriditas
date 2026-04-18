'use client'
// app/(app)/settings/page.tsx
// Me — profile + account actions. Accessed via the "Me" tab.
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { BigTitle, SectionLabel } from '@/components/ui'
import { Icon } from '@/components/Icon'

export default function MePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [email,      setEmail]      = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

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
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div className="pb-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="px-5 pt-9 pb-2">
        <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-2">
          Account
        </div>
        <BigTitle italic>Me</BigTitle>
        <p className="text-sm text-ink-soft mt-2">
          Your signed-in identity, app preferences, and a bit about Viriditas.
        </p>
      </div>

      {/* ── Identity card ─────────────────────────────────────────────── */}
      <SectionLabel number="§ 01" title="Signed in" />
      <div className="mx-5 px-4 py-3.5 bg-card border border-rule rounded-brand-lg flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
          <Icon name="heart" size={18} stroke={1.9} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">
            Email
          </div>
          <div className="font-serif italic text-[17px] text-ink truncate">
            {email ?? 'Loading…'}
          </div>
        </div>
      </div>

      {/* ── Account actions ───────────────────────────────────────────── */}
      <SectionLabel number="§ 02" title="Account" />
      <div className="mx-5 bg-card border border-rule rounded-brand-lg overflow-hidden">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center justify-between px-4 py-4 text-[14px] font-medium text-danger disabled:opacity-60"
        >
          <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          <Icon name="chev" size={14} className="text-danger/70" />
        </button>
      </div>

      {/* ── About ─────────────────────────────────────────────────────── */}
      <SectionLabel number="§ 03" title="About" />
      <div className="mx-5 bg-card border border-rule rounded-brand-lg">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dashed border-rule">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">App</span>
          <span className="font-serif italic text-[15px] text-ink">Viriditas</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-dashed border-rule">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-muted">Version</span>
          <span className="font-mono text-[12px] text-ink-soft">1.0.0</span>
        </div>
        <div className="px-4 py-4">
          <p className="font-serif text-[14px] text-ink leading-relaxed" style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}>
            Viriditas is a houseplant care companion. Photograph your plants for AI
            species ID and health analysis, track care history, and pull in a
            field-guide entry for any species you grow.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted">
        Made with care · Volume I
      </p>
    </div>
  )
}
