'use client'
// app/(auth)/sign-in/page.tsx
// Email + password sign-in form.
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { HairlineButton } from '@/components/ui'

export default function SignInPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // Refresh to let the middleware re-read the new session cookie
      router.push('/')
      router.refresh()
    }
  }

  return (
    <>
      <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-1">
        Welcome back.
      </h1>
      <p className="font-sans text-sm text-ink-muted mb-7">Sign in to your plant collection</p>

      <form onSubmit={handleSignIn} className="space-y-4">
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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted">
              Password
            </label>
            <Link href="/forgot-password" className="font-mono text-[10px] tracking-[0.12em] uppercase text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-rule rounded-xl text-sm text-ink bg-paper focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg border border-rule">{error}</p>
        )}

        <HairlineButton type="submit" fullWidth disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </HairlineButton>
      </form>

      <p className="mt-6 text-center font-sans text-sm text-ink-muted">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="text-accent font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </>
  )
}
