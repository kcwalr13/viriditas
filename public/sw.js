// public/sw.js
// Viriditas service worker — push notifications only (no offline caching).
// Registered from the Settings "Care reminders" opt-in (lib/notifications.ts).
// The send-care-push Edge Function delivers a JSON payload:
//   { title: string, body: string, url: string }

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Non-JSON payload (shouldn't happen from our sender) — show it as plain text.
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Viriditas'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One tag for all care digests: a newer digest replaces an unread older
      // one instead of stacking up.
      tag: 'viriditas-care-digest',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  // Focus an existing Viriditas window if one is open; otherwise open a new
  // one. Either way we land on the deep-link target (Today).
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          if (client.url !== self.location.origin + url && 'navigate' in client) {
            client.navigate(url)
          }
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
