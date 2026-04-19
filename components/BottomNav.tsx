'use client'
// components/BottomNav.tsx
// Floating pill-shaped bottom nav. Active tab shows the label; inactive tabs
// show only the icon. Routes: / (Today), /plants (Collection),
// /explore (Encyclopedia), /settings (Me).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const [overdueCount, setOverdueCount] = useState(0)
  useEffect(() => {
    const n = parseInt(localStorage.getItem('viriditas.overdueCount') ?? '0', 10)
    setOverdueCount(isNaN(n) ? 0 : n)
  }, [pathname])

  // Hide on plant detail (has its own care dock) and add-plant wizard (modal flow).
  if (pathname.startsWith('/plant/') || pathname === '/add-plant') return null

  // Decide which tab is active based on URL prefix.
  // /add-plant stays under "Plants".
  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    if (href === '/plants') return pathname === '/plants' || pathname.startsWith('/plant/') || pathname === '/add-plant'
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pt-2 pb-4 pointer-events-none"
      style={{ background: 'linear-gradient(to top, #F4EFE6 40%, rgba(244,239,230,0))' }}
    >
      <div className="max-w-2xl mx-auto px-3.5 pointer-events-auto">
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
