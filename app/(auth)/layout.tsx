// app/(auth)/layout.tsx
// Layout for unauthenticated pages (sign in, sign up).
// Centers a card on desktop; full-screen on mobile.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-brand-bg">
      {/* Brand header */}
      <header className="py-8 flex justify-center">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌿</span>
          <span className="text-2xl font-bold text-brand">Viriditas</span>
        </div>
      </header>

      {/* Card */}
      <main className="flex-1 flex items-start justify-center px-4 pb-8">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
