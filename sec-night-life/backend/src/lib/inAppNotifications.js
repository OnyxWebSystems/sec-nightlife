import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { sendPushToUser } from './pushDelivery.js';

const NOTIFICATION_BATCH_SIZE = 500;

function pushPathForNotification(data) {
  if (data.type === 'PLATFORM_ANNOUNCEMENT' || data.type === 'VENDOR_LISTING_REMINDER') {
    return typeof data.referenceId === 'string' && data.referenceId.startsWith('/')
      ? data.referenceId
      : data.type === 'VENDOR_LISTING_REMINDER'
        ? '/VendorBusinessSettings'
        : '/Home';
  }
  if (data.type === 'ACCOUNT_SUSPENDED') return '/HelpCenter';
  if (data.type === 'ACCOUNT_UNSUSPENDED') return '/Home';
  if (data.type === 'SAFETY_REPORT_UPDATE') return '/Notifications';
  if (data.referenceType === 'ROUTE' && typeof data.referenceId === 'string' && data.referenceId.startsWith('/')) {
    return data.referenceId;
  }
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

/**
 * Notify all active users when an admin publishes a platform announcement.
 * Runs in batches; push delivery is fire-and-forget per user.
 * @param {object} announcement - platform_announcements row
 * @param {string} [excludeUserId] - publishing admin (optional)
 */
export async function notifyAllUsersPlatformAnnouncement(announcement, excludeUserId = null) {
  if (!announcement?.id) return;

  const body =
    typeof announcement.message === 'string'
      ? announcement.message.slice(0, 200)
      : '';
  const referenceId =
    typeof announcement.ctaUrl === 'string' && announcement.ctaUrl.trim().startsWith('/')
      ? announcement.ctaUrl.trim()
      : '/Home';

  const notificationData = {
    type: 'PLATFORM_ANNOUNCEMENT',
    title: announcement.title,
    body,
    referenceId,
    referenceType: 'ROUTE',
  };

  try {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        suspendedAt: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });

    for (let i = 0; i < users.length; i += NOTIFICATION_BATCH_SIZE) {
      const batch = users.slice(i, i + NOTIFICATION_BATCH_SIZE);
      const userIds = batch.map((u) => u.id);
      await createInAppNotificationsForUsers(userIds, notificationData);
      for (const userId of userIds) {
        void maybeSendPush(userId, notificationData);
      }
    }

    logger?.info?.('platform announcement notifications sent', {
      announcementId: announcement.id,
      userCount: users.length,
    });
  } catch (e) {
    logger?.warn?.('platform announcement notification fan-out failed', {
      err: e?.message,
      announcementId: announcement.id,
    });
  }
}
