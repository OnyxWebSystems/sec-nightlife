import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  VENUE_TABLE_MESSAGE_TEMPLATES,
  getTemplateLabel,
  MESSAGABLE_VENUE_MEMBER_STATUSES,
} from '../lib/venueTableMessageTemplates.js';
import { validateReplyInThread } from '../lib/messageReply.js';

const router = Router();

async function getThreadAccess(threadId, userId) {
  const thread = await prisma.venueTableThread.findFirst({
    where: { id: threadId, deletedAt: null },
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
    return { forbidden: true, reason: 'Messaging is not available for this request.' };
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
        deletedAt: null,
        member: {
          userId: req.userId,
          status: { in: ['APPROVED', 'PENDING_PAYMENT', 'CONFIRMED', 'DECLINED'] },
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
    const unreadCounts = await Promise.all(
      threads.map((t) =>
        prisma.venueTableMessage.count({
          where: {
            threadId: t.id,
            readAt: null,
            senderUserId: { not: req.userId },
          },
        }),
      ),
    );
    res.json(
      threads.map((t, i) => ({
        threadId: t.id,
        memberId: t.venueTableMemberId,
        memberStatus: t.member.status,
        unreadCount: unreadCounts[i] || 0,
        venueName: t.member.venueTable.venue.name,
        tableName: t.member.venueTable.tableName,
        eventTitle: t.member.venueTable.event?.title || null,
        lastMessage: t.messages[0]
          ? {
              templateKey: t.messages[0].templateKey,
              label: t.messages[0].displayLabel || getTemplateLabel(t.messages[0].templateKey),
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
      include: {
        sender: { select: { id: true, fullName: true } },
        replyTo: { select: { id: true, templateKey: true, displayLabel: true, sentAt: true } },
      },
    });

    res.json(
      messages.map((m) => ({
        id: m.id,
        templateKey: m.templateKey,
        label: m.displayLabel || getTemplateLabel(m.templateKey),
        sentAt: m.sentAt,
        readAt: m.readAt,
        senderUserId: m.senderUserId,
        senderLabel: m.sender.fullName || 'User',
        isMine: m.senderUserId === req.userId,
        replyTo: m.replyTo
          ? {
              id: m.replyTo.id,
              body: m.replyTo.displayLabel || getTemplateLabel(m.replyTo.templateKey),
              sentAt: m.replyTo.sentAt,
            }
          : null,
      })),
    );
  } catch (e) {
    next(e);
  }
});

const sendSchema = z.object({
  templateKey: z.enum(Object.keys(VENUE_TABLE_MESSAGE_TEMPLATES)),
  replyToMessageId: z.string().optional(),
});

router.post('/:threadId/messages', authenticateToken, async (req, res, next) => {
  try {
    const parsed = sendSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid template' });

    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    if (access.forbidden) return res.status(403).json({ error: access.reason });

    const replyToMessageId = await validateReplyInThread(prisma, {
      model: 'venueTableMessage',
      threadField: 'threadId',
      threadId: access.thread.id,
      replyToMessageId: parsed.data.replyToMessageId,
    });

    const created = await prisma.venueTableMessage.create({
      data: {
        threadId: access.thread.id,
        senderUserId: req.userId,
        templateKey: parsed.data.templateKey,
        replyToMessageId,
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

    const venueId = access.thread.member.venueTable.venueId;
    await prisma.notification.create({
      data: {
        userId: recipientUserId,
        venueId: access.isOwner ? null : venueId,
        type: 'TABLE_MESSAGE',
        title: access.thread.member.venueTable.venue.name,
        body: label,
        actionUrl: access.isOwner
          ? `/Messages?venueTableThread=${access.thread.id}`
          : `/BusinessMessages?tab=tables&thread=${access.thread.id}&venue_id=${venueId}`,
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

router.delete('/:threadId', authenticateToken, async (req, res, next) => {
  try {
    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    if (!access.isOwner && !access.isGuest) return res.status(403).json({ error: 'Forbidden' });

    await prisma.venueTableThread.update({
      where: { id: access.thread.id },
      data: { deletedAt: new Date() },
    });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:threadId/messages/:messageId', authenticateToken, async (req, res, next) => {
  try {
    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    if (access.forbidden) return res.status(403).json({ error: access.reason });

    const message = await prisma.venueTableMessage.findFirst({
      where: { id: req.params.messageId, threadId: access.thread.id },
    });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const isSender = message.senderUserId === req.userId;
    if (!isSender && !access.isOwner) return res.status(403).json({ error: 'Forbidden' });

    await prisma.venueTableMessage.delete({ where: { id: message.id } });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

export default router;
