'use client'
// components/NavGuard.tsx
// Conditionally renders the BottomNav based on the current route.
// Hidden on /plant/[id] (has its own care dock), /add-plant (wizard), and
// /camera (full-screen capture, provides its own top chrome).
// To add a new route that should hide the nav, add it to HIDDEN_ROUTES.
import { usePathname } from 'next/navigation'
import { BottomNav } from './BottomNav'

const HIDDEN_ROUTES = ['/add-plant', '/camera']

export function NavGuard() {
  const pathname = usePathname()
  const hidden =
    HIDDEN_ROUTES.includes(pathname) ||
    pathname.startsWith('/plant/')
  if (hidden) return null
  return <BottomNav />
}
