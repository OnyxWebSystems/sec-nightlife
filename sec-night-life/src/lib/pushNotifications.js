/**
 * Native push notifications (Capacitor only).
 * Requires Firebase google-services.json / GoogleService-Info.plist — see docs/FIREBASE_PUSH_SETUP.md
 */
import { Capacitor } from '@capacitor/core';
import { apiPost } from '@/api/client';

let registeredToken = null;

async function syncPushToken(token, platform) {
  if (!token || token === registeredToken) return;
  try {
    await apiPost('/api/users/push-token', { token, platform });
    registeredToken = token;
  } catch (err) {
    console.warn('[push] token sync failed:', err?.message || err);
  }
}

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      await PushNotifications.requestPermissions();
    }

    await PushNotifications.addListener('registration', (token) => {
      console.info('[push] FCM/APNs token registered');
      void syncPushToken(token.value, platform);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error:', err);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.info('[push] received:', notification);
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn('[push] init skipped:', err?.message || err);
  }
}
