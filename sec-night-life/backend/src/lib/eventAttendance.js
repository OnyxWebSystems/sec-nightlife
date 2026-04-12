import { prisma } from './prisma.js';
import { logger } from './logger.js';

/**
 * Record that a user participated in an event (ticket, table, etc.).
 * Idempotent; safe to call from webhooks and table flows.
 */
export async function upsertConfirmedAttendance(userId, eventId) {
  if (!userId || userId === 'unknown' || !eventId) return;
  try {
    const ev = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true },
    });
    if (!ev) return;
    await prisma.eventAttendance.upsert({
      where: {
        eventId_userId: { eventId, userId },
      },
      create: { eventId, userId, confirmed: true },
      update: { confirmed: true },
    });
  } catch (e) {
    logger?.warn?.('event attendance upsert failed', { err: e?.message, userId, eventId });
  }
}
