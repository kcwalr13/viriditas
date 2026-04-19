'use client'
// app/(auth)/auth/page.tsx
// Password-reset landing page. Supabase redirects here after the user clicks
// the reset email link, appending ?code=xxx&mode=reset. We exchange the code
// for a session, then let the user enter and confirm a new password.
//
// createClient() is called lazily inside useEffect / handlers so it never
// runs during SSR prerendering (env vars may not be set at build time).
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { HairlineButton } from '@/components/ui'

function UpdatePasswordForm() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const mode = searchParams.get('mode')
  const code = searchParams.get('code')

  const [exchanging,    setExchanging]    = useState(true)
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [password,      setPassword]      = useState('')
  const [confirm,       setConfirm]       = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [success,       setSuccess]       = useState(false)

  // Exchange the one-time code for a session. Only runs client-side.
  useEffect(() => {
    if (mode !== 'reset') {
      setExchangeError('Invalid reset link. Please request a new one.')
      setExchanging(false)
      return
    }
    if (!code) {
      setExchangeError('No reset code found. Please use the link from your email.')
      setExchanging(false)
      return
    }
    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) setExchangeError(error.message)
      })
      .catch(() => setExchangeError('Could not validate reset link.'))
      .finally(() => setExchanging(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return }
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // Sign out the recovery session so the user signs in fresh.
      await supabase.auth.signOut()
      setSuccess(true)
    }
  }

  if (exchanging) {
    return (
      <p className="font-sans text-sm text-ink-muted text-center py-4">Verifying reset link…</p>
    )
  }

  if (exchangeError) {
    return (
      <>
        <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-3">
          Link expired.
        </h1>
        <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg border border-rule mb-5">
          {exchangeError}
        </p>
        <Link href="/forgot-password" className="text-accent text-sm font-medium hover:underline">
          Request a new reset link
        </Link>
      </>
    )
  }

  if (success) {
    return (
      <>
        <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-1">
          Password updated.
        </h1>
        <p className="font-sans text-sm text-ink-soft mb-6">
          Your password has been changed. Sign in with your new password.
        </p>
        <HairlineButton onClick={() => router.push('/sign-in')} fullWidth>
          Sign in
        </HairlineButton>
      </>
    )
  }

  return (
    <>
      <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-1">
        New password.
      </h1>
      <p className="font-sans text-sm text-ink-muted mb-7">
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-rule rounded-xl text-sm text-ink bg-paper focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            placeholder="At least 6 characters"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full px-4 py-3 border border-rule rounded-xl text-sm text-ink bg-paper focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg border border-rule">{error}</p>
        )}

        <HairlineButton type="submit" fullWidth disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </HairlineButton>
      </form>
    </>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<p className="font-sans text-sm text-ink-muted text-center py-4">Loading…</p>}>
      <UpdatePasswordForm />
    </Suspense>
  )
}
