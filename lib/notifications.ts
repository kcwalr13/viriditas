/* eslint-disable @typescript-eslint/no-unused-vars */
// lib/notifications.ts
// Stub — push notifications are not supported in the web version of Viriditas.
// Watering intervals are stored in the database and displayed as status badges
// in the plant grid. This file exists to satisfy any lingering imports.

export function setupNotificationHandler(): void {}

export async function registerForNotifications(): Promise<void> {}

export async function scheduleWateringReminder(
  _plantNickname: string,
  _intervalDays: number
): Promise<string | null> {
  return null
}

export async function cancelNotification(_notificationId: string): Promise<void> {}
