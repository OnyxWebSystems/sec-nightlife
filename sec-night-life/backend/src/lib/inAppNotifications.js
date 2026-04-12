import { prisma } from './prisma.js';
import { logger } from './logger.js';

export async function createInAppNotification(data) {
  try {
    return await prisma.inAppNotification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        referenceId: data.referenceId ?? null,
        referenceType: data.referenceType ?? null,
      },
    });
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
