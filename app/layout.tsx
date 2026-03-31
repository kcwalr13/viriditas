// app/layout.tsx
// Root layout — wraps every page in the app.
// Sets global fonts, metadata, and imports Tailwind styles.
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Viriditas',
  description: 'Your houseplant care companion',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/icon.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Prevents iOS Safari from zooming in on input focus
  userScalable: false,
  // Theme color matches brand green for browser chrome on mobile
  themeColor: '#2d6a4f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
