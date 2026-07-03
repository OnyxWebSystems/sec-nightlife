import { logger } from './logger.js';
import { prisma } from './prisma.js';

let messagingPromise = null;

async function getMessaging() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        const admin = await import('firebase-admin');
        const { getApps } = await import('firebase-admin/app');
        if (getApps().length === 0) {
          const serviceAccount = JSON.parse(raw);
          admin.default.initializeApp({
            credential: admin.default.credential.cert(serviceAccount),
          });
        }
        return admin.default.messaging();
      } catch (err) {
        logger.warn('FCM init failed — push delivery disabled', { err: err?.message });
        return null;
      }
    })();
  }

  return messagingPromise;
}

/**
 * Send FCM notification to all registered device tokens for a user.
 * No-op when FIREBASE_SERVICE_ACCOUNT_JSON is unset or user has no tokens.
 */
export async function sendPushToUser(userId, { title, body, path = null, referenceId = null }) {
  if (!userId || !title) return;

  const messaging = await getMessaging();
  if (!messaging) return;

  const rows = await prisma.pushDeviceToken.findMany({
    where: { userId },
    select: { token: true },
  });
  const tokens = rows.map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) return;

  const data = {};
  if (path) data.path = String(path);
  if (referenceId) data.referenceId = String(referenceId);

  try {
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: body || '' },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    if (result.failureCount > 0) {
      logger.warn('FCM partial failure', {
        userId,
        successCount: result.successCount,
        failureCount: result.failureCount,
      });
    }
  } catch (err) {
    logger.warn('FCM send failed', { userId, err: err?.message });
  }
}
