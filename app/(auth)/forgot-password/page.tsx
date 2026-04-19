'use client'
// app/(auth)/forgot-password/page.tsx
// Forgot-password form: user enters email → Supabase sends a reset link.
// The reset link redirects to /auth?mode=reset where they enter a new password.
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useState } from 'react'
import { HairlineButton } from '@/components/ui'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Lazy-init so createClient() never runs during SSR prerendering
    const supabase  = createClient()
    const redirectTo = `${window.location.origin}/auth?mode=reset`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <>
        <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-1">
          Check your inbox.
        </h1>
        <p className="font-sans text-sm text-ink-soft leading-relaxed mb-6">
          We sent a reset link to <strong>{email}</strong>. Follow the link to choose a new password.
        </p>
        <p className="mt-4 text-center font-sans text-sm text-ink-muted">
          <Link href="/sign-in" className="text-accent font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-1">
        Reset password.
      </h1>
      <p className="font-sans text-sm text-ink-muted mb-7">
        Enter your email and we&apos;ll send a reset link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-rule rounded-xl text-sm text-ink bg-paper focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg border border-rule">{error}</p>
        )}

        <HairlineButton type="submit" fullWidth disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </HairlineButton>
      </form>

      <p className="mt-6 text-center font-sans text-sm text-ink-muted">
        <Link href="/sign-in" className="text-accent font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  )
}
