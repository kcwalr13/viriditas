'use client'
// app/(auth)/sign-up/page.tsx
// Email + password sign-up form.
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { HairlineButton } from '@/components/ui'

export default function SignUpPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // Email confirmation is disabled in development — goes straight to app
      router.push('/')
      router.refresh()
    }
  }

  return (
    <>
      <h1 className="font-serif italic text-[28px] text-ink leading-tight mb-1">
        Start your collection.
      </h1>
      <p className="font-sans text-sm text-ink-muted mb-7">Create an account to track your plants</p>

      <form onSubmit={handleSignUp} className="space-y-4">
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
          <label htmlFor="password" className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-muted mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-rule rounded-xl text-sm text-ink bg-paper focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            placeholder="At least 6 characters"
          />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg border border-rule">{error}</p>
        )}

        <HairlineButton type="submit" fullWidth disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </HairlineButton>
      </form>

      <p className="mt-6 text-center font-sans text-sm text-ink-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-accent font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </>
  )
}
