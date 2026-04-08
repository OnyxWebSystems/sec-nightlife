import { prisma } from './prisma.js';
import { logger } from './logger.js';

export async function createNotification({ userId, type, title, body, actionUrl }) {
  if (!userId) return null;
  try {
    return await prisma.notification.create({
      data: {
        userId,
        type: type || 'system',
        title: title || 'Notification',
        body: body ?? null,
        actionUrl: actionUrl ?? null,
      },
    });
  } catch (e) {
    logger?.warn?.('notification create failed', { err: e?.message, userId, type });
    return null;
  }
}

export async function createNotifications({ userIds, type, title, body, actionUrl }) {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.filter(Boolean))] : [];
  if (ids.length === 0) return { created: 0 };
  try {
    const res = await prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: type || 'system',
        title: title || 'Notification',
        body: body ?? null,
        actionUrl: actionUrl ?? null,
      })),
    });
    return { created: res?.count || 0 };
  } catch (e) {
    logger?.warn?.('notifications createMany failed', { err: e?.message, type });
    // Fallback to per-row inserts so one bad row doesn’t block others
    const results = await Promise.all(ids.map((userId) => createNotification({ userId, type, title, body, actionUrl })));
    return { created: results.filter(Boolean).length };
  }
}
