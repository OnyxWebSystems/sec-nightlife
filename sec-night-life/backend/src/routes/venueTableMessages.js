import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  VENUE_TABLE_MESSAGE_TEMPLATES,
  getTemplateLabel,
  MESSAGABLE_VENUE_MEMBER_STATUSES,
} from '../lib/venueTableMessageTemplates.js';

const router = Router();

async function getThreadAccess(threadId, userId) {
  const thread = await prisma.venueTableThread.findFirst({
    where: { id: threadId },
    include: {
      member: {
        include: {
          user: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } },
          venueTable: {
            include: {
              venue: { select: { id: true, name: true, ownerUserId: true } },
              event: { select: { title: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { senderUserId: true },
      },
    },
  });
  if (!thread) return null;
  const ownerId = thread.member.venueTable.venue.ownerUserId;
  const isOwner = ownerId === userId;
  const isGuest = thread.member.userId === userId;
  if (!isOwner && !isGuest) return null;
  if (!MESSAGABLE_VENUE_MEMBER_STATUSES.includes(thread.member.status)) {
    return { forbidden: true, reason: 'Messaging is available after your table request is approved.' };
  }
  return { thread, isOwner, isGuest };
}

export async function ensureVenueTableThread(venueTableMemberId) {
  return prisma.venueTableThread.upsert({
    where: { venueTableMemberId },
    create: { venueTableMemberId },
    update: {},
  });
}

router.get('/mine', authenticateToken, async (req, res, next) => {
  try {
    const threads = await prisma.venueTableThread.findMany({
      where: {
        member: {
          userId: req.userId,
          status: { in: MESSAGABLE_VENUE_MEMBER_STATUSES },
        },
      },
      include: {
        member: {
          include: {
            venueTable: {
              include: { venue: { select: { name: true } }, event: { select: { title: true } } },
            },
          },
        },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(
      threads.map((t) => ({
        threadId: t.id,
        memberId: t.venueTableMemberId,
        venueName: t.member.venueTable.venue.name,
        tableName: t.member.venueTable.tableName,
        eventTitle: t.member.venueTable.event?.title || null,
        lastMessage: t.messages[0]
          ? {
              templateKey: t.messages[0].templateKey,
              label: getTemplateLabel(t.messages[0].templateKey),
              sentAt: t.messages[0].sentAt,
            }
          : null,
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/:threadId/messages', authenticateToken, async (req, res, next) => {
  try {
    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    if (access.forbidden) return res.status(403).json({ error: access.reason });

    await prisma.venueTableMessage.updateMany({
      where: {
        threadId: access.thread.id,
        readAt: null,
        senderUserId: { not: req.userId },
      },
      data: { readAt: new Date() },
    });

    const messages = await prisma.venueTableMessage.findMany({
      where: { threadId: access.thread.id },
      orderBy: { sentAt: 'asc' },
      include: { sender: { select: { id: true, fullName: true } } },
    });

    res.json(
      messages.map((m) => ({
        id: m.id,
        templateKey: m.templateKey,
        label: getTemplateLabel(m.templateKey),
        sentAt: m.sentAt,
        readAt: m.readAt,
        senderUserId: m.senderUserId,
        senderLabel: m.sender.fullName || 'User',
        isMine: m.senderUserId === req.userId,
      })),
    );
  } catch (e) {
    next(e);
  }
});

const sendSchema = z.object({
  templateKey: z.enum(Object.keys(VENUE_TABLE_MESSAGE_TEMPLATES)),
});

router.post('/:threadId/messages', authenticateToken, async (req, res, next) => {
  try {
    const parsed = sendSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid template' });

    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    if (access.forbidden) return res.status(403).json({ error: access.reason });

    const created = await prisma.venueTableMessage.create({
      data: {
        threadId: access.thread.id,
        senderUserId: req.userId,
        templateKey: parsed.data.templateKey,
      },
    });

    await prisma.venueTableThread.update({
      where: { id: access.thread.id },
      data: { updatedAt: new Date() },
    });

    const label = getTemplateLabel(parsed.data.templateKey);
    const recipientUserId = access.isOwner
      ? access.thread.member.userId
      : access.thread.member.venueTable.venue.ownerUserId;

    await prisma.notification.create({
      data: {
        userId: recipientUserId,
        type: 'TABLE_MESSAGE',
        title: access.thread.member.venueTable.venue.name,
        body: label,
        actionUrl: access.isOwner
          ? `/Messages?venueTableThread=${access.thread.id}`
          : '/BusinessMessages?tab=tables',
      },
    });

    res.status(201).json({
      id: created.id,
      templateKey: created.templateKey,
      label,
      sentAt: created.sentAt,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
