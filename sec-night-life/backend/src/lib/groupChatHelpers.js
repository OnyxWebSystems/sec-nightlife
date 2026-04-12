import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { createInAppNotification } from './inAppNotifications.js';

/**
 * Create group chat for a venue event (best-effort; logs on failure).
 */
export async function ensureGroupChatForEvent(eventId, eventName, creatorUserId) {
  try {
    const existing = await prisma.groupChat.findUnique({ where: { eventId } });
    if (existing) return existing;
    return await prisma.groupChat.create({
      data: {
        eventId,
        name: eventName,
        members: { create: { userId: creatorUserId } },
      },
    });
  } catch (e) {
    logger.error('ensureGroupChatForEvent failed', { eventId, message: e?.message });
    return null;
  }
}

export async function addUserToEventGroupChat(eventId, userId, eventTitle) {
  try {
    const gc = await prisma.groupChat.findUnique({ where: { eventId } });
    if (!gc) return;
    await prisma.groupChatMember.upsert({
      where: {
        groupChatId_userId: { groupChatId: gc.id, userId },
      },
      create: { groupChatId: gc.id, userId },
      update: {},
    });
    await createInAppNotification({
      userId,
      type: 'JOIN_REQUEST_ACCEPTED',
      title: "You're in! Join the group chat",
      body: `Your request to join ${eventTitle || 'an event'} was accepted. You can now chat with other attendees.`,
      referenceId: gc.id,
      referenceType: 'GROUP_CHAT',
    });
  } catch (e) {
    logger.warn('addUserToEventGroupChat failed', { eventId, userId, message: e?.message });
  }
}
