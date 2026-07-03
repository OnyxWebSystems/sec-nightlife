import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { sendPushToUser } from './pushDelivery.js';

function pushPathForNotification(data) {
  if (data.referenceType === 'message' || data.type === 'MESSAGE') return '/Messages';
  if (data.referenceType === 'event' || data.type === 'EVENT_REMINDER') return '/Notifications';
  return '/Notifications';
}

async function maybeSendPush(userId, data) {
  void sendPushToUser(userId, {
    title: data.title,
    body: data.body,
    path: pushPathForNotification(data),
    referenceId: data.referenceId,
  }).catch(() => {});
}

export async function createInAppNotification(data, db = prisma) {
  try {
    const row = await db.inAppNotification.create({
      data: {
        userId: data.userId,
        venueId: data.venueId ?? null,
        type: data.type,
        title: data.title,
        body: data.body,
        referenceId: data.referenceId ?? null,
        referenceType: data.referenceType ?? null,
      },
    });
    await maybeSendPush(data.userId, data);
    return row;
  } catch (e) {
    logger?.warn?.('in-app notification create failed', { err: e?.message, data });
    return null;
  }
}

export async function createInAppNotificationsForUsers(userIds, data) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await prisma.inAppNotification.createMany({
      data: ids.map((userId) => ({
        userId,
        venueId: data.venueId ?? null,
        type: data.type,
        title: data.title,
        body: data.body,
        referenceId: data.referenceId ?? null,
        referenceType: data.referenceType ?? null,
      })),
    });
  } catch (e) {
    logger?.warn?.('in-app notification createMany failed', { err: e?.message });
  }
}
