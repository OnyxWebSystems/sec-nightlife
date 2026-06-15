import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { postPromoterVenueMessage, ensurePromoterVenueThread } from '../lib/promoterVenueThread.js';

const router = Router();

function isEventEnded(event) {
  const ends = event?.endsAt || event?.date;
  return Boolean(ends && new Date(ends) < new Date());
}

async function getThreadAccess(threadId, userId) {
  const thread = await prisma.promoterVenueThread.findFirst({
    where: { id: threadId },
    include: {
      venue: { select: { id: true, name: true, ownerUserId: true, logoUrl: true, city: true } },
      promoter: {
        select: {
          id: true,
          fullName: true,
          userProfile: { select: { username: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!thread) return null;
  const isPromoter = thread.promoterUserId === userId;
  const isOwner = thread.venue.ownerUserId === userId;
  if (!isPromoter && !isOwner) return { forbidden: true };
  return { thread, isPromoter, isOwner };
}

router.get('/mine', authenticateToken, async (req, res, next) => {
  try {
    const hired = await prisma.jobApplication.findMany({
      where: {
        applicantUserId: req.userId,
        status: 'HIRED',
        jobPosting: { positionRole: 'PROMOTER' },
      },
      select: {
        id: true,
        jobPosting: { select: { venueId: true } },
      },
    });
    await Promise.all(
      hired.map((app) =>
        ensurePromoterVenueThread({
          venueId: app.jobPosting.venueId,
          promoterUserId: req.userId,
          jobApplicationId: app.id,
        }),
      ),
    );

    const threads = await prisma.promoterVenueThread.findMany({
      where: {
        promoterUserId: req.userId,
        promoterHiddenAt: null,
        venue: { deletedAt: null },
      },
      include: {
        venue: { select: { id: true, name: true, logoUrl: true, city: true } },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const unreadCounts = await Promise.all(
      threads.map((t) =>
        prisma.promoterVenueMessage.count({
          where: {
            threadId: t.id,
            readAt: null,
            OR: [{ senderUserId: null }, { senderUserId: { not: req.userId } }],
          },
        }),
      ),
    );

    res.json(
      threads.map((t, i) => ({
        threadId: t.id,
        venueId: t.venueId,
        venueName: t.venue.name,
        venueCity: t.venue.city,
        venueLogoUrl: t.venue.logoUrl,
        unreadCount: unreadCounts[i] || 0,
        lastMessage: t.messages[0]
          ? {
              body: t.messages[0].body,
              kind: t.messages[0].kind,
              sentAt: t.messages[0].sentAt,
            }
          : null,
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/business', authenticateToken, async (req, res, next) => {
  try {
    const venueId = typeof req.query.venue_id === 'string' ? req.query.venue_id.trim() : null;
    const venues = await prisma.venue.findMany({
      where: { ownerUserId: req.userId, deletedAt: null, ...(venueId ? { id: venueId } : {}) },
      select: { id: true },
    });
    const venueIds = venues.map((v) => v.id);
    if (!venueIds.length) return res.json({ items: [] });

    const threads = await prisma.promoterVenueThread.findMany({
      where: { venueId: { in: venueIds }, venueHiddenAt: null },
      include: {
        venue: { select: { id: true, name: true } },
        promoter: {
          select: {
            id: true,
            fullName: true,
            userProfile: { select: { username: true, avatarUrl: true } },
          },
        },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      items: threads.map((t) => ({
        threadId: t.id,
        venueId: t.venueId,
        venueName: t.venue.name,
        promoterUserId: t.promoterUserId,
        promoterUsername: t.promoter.userProfile?.username || t.promoter.fullName,
        promoterAvatarUrl: t.promoter.userProfile?.avatarUrl || null,
        lastMessage: t.messages[0]
          ? { body: t.messages[0].body, sentAt: t.messages[0].sentAt }
          : null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:threadId/messages', authenticateToken, async (req, res, next) => {
  try {
    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(404).json({ error: 'Thread not found' });
    if (access.forbidden) return res.status(403).json({ error: 'Forbidden' });

    await prisma.promoterVenueMessage.updateMany({
      where: {
        threadId: access.thread.id,
        readAt: null,
        OR: [{ senderUserId: null }, { senderUserId: { not: req.userId } }],
      },
      data: { readAt: new Date() },
    });

    const messages = await prisma.promoterVenueMessage.findMany({
      where: { threadId: access.thread.id },
      orderBy: { sentAt: 'asc' },
      include: {
        sender: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } },
      },
    });

    const assignmentRows = access.isPromoter || access.isOwner
      ? await prisma.eventPromoterAssignment.findMany({
          where: {
            venueId: access.thread.venueId,
            promoterUserId: access.thread.promoterUserId,
            status: 'ACTIVE',
            event: { deletedAt: null },
          },
          include: { event: { select: { id: true, title: true, date: true, endsAt: true, city: true } } },
          orderBy: { assignedAt: 'desc' },
        })
      : [];
    const assignments = assignmentRows.filter((a) => !isEventEnded(a.event));

    const assignmentEventIds = [
      ...new Set(
        messages.filter((m) => m.kind === 'ASSIGNMENT' && m.eventId).map((m) => m.eventId),
      ),
    ];
    const assignmentEvents =
      assignmentEventIds.length > 0
        ? await prisma.event.findMany({
            where: { id: { in: assignmentEventIds }, deletedAt: null },
            select: { id: true, date: true, endsAt: true },
          })
        : [];
    const eventEndedById = new Map(
      assignmentEvents.map((e) => [e.id, isEventEnded(e)]),
    );

    res.json({
      thread: {
        id: access.thread.id,
        venueId: access.thread.venueId,
        venueName: access.thread.venue.name,
        promoterUserId: access.thread.promoterUserId,
        promoterUsername: access.thread.promoter.userProfile?.username,
        promoterName: access.thread.promoter.fullName,
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        kind: m.kind,
        eventId: m.eventId,
        eventEnded: m.eventId ? Boolean(eventEndedById.get(m.eventId)) : false,
        sentAt: m.sentAt,
        isMine: m.senderUserId === req.userId,
        senderLabel: m.senderUserId
          ? m.sender?.userProfile?.username
            ? `@${m.sender.userProfile.username}`
            : m.sender?.fullName || 'User'
          : access.thread.venue.name,
      })),
      assignments: assignments.map((a) => ({
        eventId: a.eventId,
        title: a.event.title,
        date: a.event.date,
        city: a.event.city,
      })),
    });
  } catch (e) {
    next(e);
  }
});

const sendSchema = z.object({ body: z.string().trim().min(1).max(2000) });

router.post('/:threadId/messages', authenticateToken, async (req, res, next) => {
  try {
    const parsed = sendSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid message' });

    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(404).json({ error: 'Thread not found' });
    if (access.forbidden) return res.status(403).json({ error: 'Forbidden' });

    const created = await postPromoterVenueMessage({
      threadId: access.thread.id,
      body: parsed.data.body,
      senderUserId: req.userId,
    });

    const recipientUserId = access.isPromoter
      ? access.thread.venue.ownerUserId
      : access.thread.promoterUserId;

    await prisma.notification.create({
      data: {
        userId: recipientUserId,
        type: 'TABLE_MESSAGE',
        title: access.thread.venue.name,
        body: parsed.data.body.slice(0, 120),
        actionUrl: access.isPromoter
          ? `/BusinessMessages?tab=promoters&promoterVenue=${access.thread.id}`
          : `/Messages?promoterVenue=${access.thread.id}`,
      },
    }).catch(() => {});

    res.status(201).json({
      id: created.id,
      body: created.body,
      sentAt: created.sentAt,
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:threadId', authenticateToken, async (req, res, next) => {
  try {
    const access = await getThreadAccess(req.params.threadId, req.userId);
    if (!access) return res.status(404).json({ error: 'Thread not found' });
    if (access.forbidden) return res.status(403).json({ error: 'Forbidden' });

    const data = access.isPromoter
      ? { promoterHiddenAt: new Date() }
      : { venueHiddenAt: new Date() };
    await prisma.promoterVenueThread.update({ where: { id: access.thread.id }, data });
    res.json({ hidden: true });
  } catch (e) {
    next(e);
  }
});

export default router;
