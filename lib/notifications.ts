// lib/notifications.ts
// A safe wrapper around expo-notifications that handles Expo Go limitations.
//
// WHY THIS EXISTS:
// In Expo Go (SDK 53+), expo-notifications logs a console.error() during module
// initialization on Android because remote push notification support was removed.
// Expo Go's dev overlay shows all console.error() calls as red banners — even if
// our code catches them — because the error is emitted inside the library itself.
//
// The only reliable fix is to skip loading expo-notifications entirely when
// running inside Expo Go. We detect this using expo-constants (Constants.appOwnership
// equals 'expo' in Expo Go, and 'standalone' or null in real builds).
//
// TRADEOFF:
// Watering reminders will not fire when testing via Expo Go. All other app features
// work normally. Notifications will work fully once you build a development build
// or production binary with EAS Build (Phase 9).

import { Platform } from 'react-native'
import Constants from 'expo-constants'

// Returns true when notifications should be skipped entirely:
// - Expo Go (SDK 53+ removed remote push support, causes error banners)
// - Web (expo-notifications is a native-only module; not supported in browsers)
function shouldSkipNotifications(): boolean {
  if (Platform.OS === 'web') return true
  return Constants.appOwnership === 'expo'
}

// Lazily load expo-notifications. Returns the module, or null if in Expo Go/web
// or if the module fails to load for any other reason.
function getNotifications() {
  if (shouldSkipNotifications()) {
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as typeof import('expo-notifications')
  } catch (e) {
    console.log('[Notifications] expo-notifications failed to load:', e)
    return null
  }
}

// Call once at app startup. Tells Expo how to display notifications when the
// app is already open (foreground). No-op in Expo Go.
export function setupNotificationHandler(): void {
  const Notifs = getNotifications()
  if (!Notifs) return
  try {
    Notifs.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
  } catch (e) {
    console.log('[Notifications] Handler setup failed:', e)
  }
}

// Request notification permissions from the user and create the Android channel.
// Safe to call multiple times — only prompts if the user hasn't decided yet.
// No-op in Expo Go.
export async function registerForNotifications(): Promise<void> {
  const Notifs = getNotifications()
  if (!Notifs) return
  try {
    // Android needs a named "channel" before any notification can be shown
    if (Platform.OS === 'android') {
      await Notifs.setNotificationChannelAsync('plant-reminders', {
        name: 'Plant Reminders',
        importance: Notifs.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      })
    }
    const { status } = await Notifs.requestPermissionsAsync()
    if (status !== 'granted') {
      console.log('[Notifications] Permission not granted by user')
    }
  } catch (e) {
    console.log('[Notifications] Registration failed:', e)
  }
}

// Schedule a repeating local notification for a plant watering reminder.
// Returns the notification ID (needed to cancel it later), or null on failure
// or when running in Expo Go.
export async function scheduleWateringReminder(
  plantNickname: string,
  intervalDays: number
): Promise<string | null> {
  const Notifs = getNotifications()
  if (!Notifs) return null
  try {
    const notificationId = await Notifs.scheduleNotificationAsync({
      content: {
        title: '🌿 Time to water!',
        body: `${plantNickname} is due for watering.`,
      },
      trigger: {
        // TIME_INTERVAL fires after a set number of seconds and can repeat
        type: Notifs.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: intervalDays * 24 * 60 * 60,
        repeats: true,
      },
    })
    return notificationId
  } catch (e) {
    console.log('[Notifications] scheduleNotificationAsync failed:', e)
    return null
  }
}

// Cancel a previously scheduled notification by its ID. No-op in Expo Go.
export async function cancelNotification(notificationId: string): Promise<void> {
  const Notifs = getNotifications()
  if (!Notifs) return
  try {
    await Notifs.cancelScheduledNotificationAsync(notificationId)
  } catch (e) {
    console.log('[Notifications] cancelScheduledNotificationAsync failed:', e)
  }
}
