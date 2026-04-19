'use client'
// components/NavGuard.tsx
// Conditionally renders the BottomNav based on the current route.
// Hidden on /plant/[id] (has its own care dock) and /add-plant (full-screen wizard).
import { usePathname } from 'next/navigation'
import { BottomNav } from './BottomNav'

const HIDDEN_ROUTES = ['/add-plant']

export function NavGuard() {
  const pathname = usePathname()
  const hidden =
    HIDDEN_ROUTES.includes(pathname) ||
    pathname.startsWith('/plant/')
  if (hidden) return null
  return <BottomNav />
}
