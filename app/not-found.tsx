// app/not-found.tsx
// Custom 404 — rendered by Next.js for any route that doesn't exist.
// Lives at the app root (outside the (app) route group), so the BottomNav is
// never rendered here; it only needs the editorial paper/ink treatment.
import Link from 'next/link'
import { BigTitle } from '@/components/ui'
import { Icon } from '@/components/Icon'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-ink-muted mb-3">
          § 404 · Not found
        </div>
        <BigTitle>
          This page seems to have <span className="italic text-accent">gone to seed.</span>
        </BigTitle>
        <p className="text-sm text-ink-soft mt-4 leading-relaxed">
          The page you&rsquo;re looking for doesn&rsquo;t exist — it may have been
          moved, repotted, or never planted in the first place.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-ink text-paper font-sans font-medium text-sm px-6 py-3"
          >
            <Icon name="leaf" size={16} stroke={1.8} />
            Back to Today
          </Link>
        </div>
      </div>
    </div>
  )
}
