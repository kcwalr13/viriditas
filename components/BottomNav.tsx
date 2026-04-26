'use client'
// components/BottomNav.tsx
// Floating pill-shaped bottom nav with a camera FAB.
//
// Nav tabs: Today (/) · Plants (/plants) · Explore (/explore) · Me (/settings)
// Camera FAB: floats above the nav rail on the right; opens the Add Plant wizard
//   which starts with a camera-first identify step. TODO: replace with a
//   dedicated /camera route (confirm-sheet flow) once that screen is built.
//
// Hidden on /plant/[id] (has its own care dock) and /add-plant (modal flow).
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'

interface NavItem { href: string; label: string; icon: IconName }

const ITEMS: NavItem[] = [
  { href: '/',         label: 'Today',   icon: 'leaf' },
  { href: '/plants',   label: 'Plants',  icon: 'grid' },
  { href: '/explore',  label: 'Explore', icon: 'book' },
  { href: '/settings', label: 'Me',      icon: 'cog'  },
]

export function BottomNav() {
  const pathname = usePathname()
  const router   = useRouter()
  const [overdueCount, setOverdueCount] = useState(0)

  useEffect(() => {
    const n = parseInt(localStorage.getItem('viriditas.overdueCount') ?? '0', 10)
    setOverdueCount(isNaN(n) ? 0 : n)
  }, [pathname])

  // Hide on plant detail (has its own care dock) and add-plant wizard (modal flow).
  if (pathname.startsWith('/plant/') || pathname === '/add-plant') return null

  // Decide which tab is active based on URL prefix.
  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    if (href === '/plants') return pathname === '/plants' || pathname.startsWith('/plant/') || pathname === '/add-plant'
    return pathname.startsWith(href)
  }

  return (
    // Outer wrapper is pointer-events-none so the gradient backdrop doesn't block scroll.
    // Inner elements re-enable pointer events selectively.
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pt-2 pb-4 pointer-events-none"
      style={{ background: 'linear-gradient(to top, #F4EFE6 40%, rgba(244,239,230,0))' }}
    >
      <div className="max-w-2xl mx-auto px-3.5 relative pointer-events-auto">

        {/* Camera FAB — floats above and to the right of the nav pill.
            Design intent: instant photo-first entry point for care logging and
            new plant identification. "The most important pixel in the app."
            Routes to /camera — the dedicated confirm-sheet capture flow. */}
        <button
          onClick={() => router.push('/camera')}
          aria-label="Add plant or log a photo"
          className="absolute right-3.5 -top-16 w-14 h-14 rounded-full flex items-center justify-center border-[3px] border-paper"
          style={{
            background: '#4C6A48',
            boxShadow: '0 10px 30px rgba(76,106,72,0.45), 0 4px 10px rgba(0,0,0,0.12)',
          }}
        >
          <Icon name="camera" size={24} stroke={1.8} className="text-paper" />
        </button>

        {/* Nav pill */}
        <div className="flex items-center justify-between bg-card border border-rule rounded-full px-2.5 py-2 shadow-[0_6px_24px_rgba(20,30,20,0.08)]">
          {ITEMS.map(item => {
            const on = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={`flex items-center gap-1.5 rounded-full font-sans font-medium text-[13px] tracking-[-0.01em] transition-all duration-150 ${
                  on
                    ? 'bg-ink text-paper px-3.5 py-2.5'
                    : 'bg-transparent text-ink-soft px-3 py-2.5'
                }`}
              >
                <span className="relative inline-flex">
                  <Icon name={item.icon} size={16} stroke={1.8} />
                  {item.href === '/' && overdueCount > 0 && !on && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger" />
                  )}
                </span>
                {on && <span>{item.label}</span>}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
