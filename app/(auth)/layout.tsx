// app/(auth)/layout.tsx
// Layout for unauthenticated pages (sign in, sign up).
// Uses the Editorial palette — paper background, card panel, serif wordmark.
import { Icon } from '@/components/Icon'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <header className="pt-12 pb-8 flex justify-center">
        <div className="flex items-center gap-2.5">
          <Icon name="leaf" size={20} className="text-accent" stroke={1.6} />
          <span className="font-serif italic text-[22px] text-ink">Viriditas</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-sm bg-card border border-rule rounded-2xl p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
