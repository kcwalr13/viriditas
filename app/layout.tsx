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
  userScalable: false,
  // Theme color matches the new paper palette so the browser chrome blends in.
  themeColor: '#F4EFE6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  )
}
