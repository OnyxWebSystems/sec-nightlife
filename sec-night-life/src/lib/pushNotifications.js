/**
 * Native push notifications (Capacitor only).
 * Requires Firebase google-services.json / GoogleService-Info.plist — see docs/FIREBASE_PUSH_SETUP.md
 */
import { Capacitor } from '@capacitor/core';

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      await PushNotifications.requestPermissions();
    }

    await PushNotifications.addListener('registration', (token) => {
      console.info('[push] FCM/APNs token:', token.value);
      // TODO: POST token to backend when /api/users/push-token exists
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
