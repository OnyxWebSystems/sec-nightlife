import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
const router = Router();

router.get('/my-chats', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const memberships = await prisma.groupChatMember.findMany({
      where: { userId: me },
      include: {
        groupChat: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                coverImageUrl: true,
              },
            },
            members: true,
          },
        },
      },
    });

    const out = [];
    for (const m of memberships) {
      const gc = m.groupChat;
      const last = await prisma.groupChatMessage.findFirst({
        where: { groupChatId: gc.id },
        orderBy: { sentAt: 'desc' },
      });

      let unreadCount = 0;
      if (last) {
        const since = m.lastReadAt || new Date(0);
        unreadCount = await prisma.groupChatMessage.count({
          where: {
            groupChatId: gc.id,
            senderUserId: { not: me },
            sentAt: { gt: since },
          },
        });
      }

      out.push({
        groupChatId: gc.id,
        eventName: gc.event?.title || gc.name,
        eventDate: gc.event?.date || null,
        eventImageUrl: gc.event?.coverImageUrl || null,
        memberCount: gc.members?.length || 0,
        lastMessage: last
          ? { body: last.body, sentAt: last.sentAt, senderUserId: last.senderUserId }
          : null,
        unreadCount,
      });
    }

    out.sort((a, b) => {
      const ta = a.lastMessage?.sentAt ? new Date(a.lastMessage.sentAt).getTime() : 0;
      const tb = b.lastMessage?.sentAt ? new Date(b.lastMessage.sentAt).getTime() : 0;
      return tb - ta;
    });

    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/:groupChatId', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const gc = await prisma.groupChat.findFirst({
      where: { id: req.params.groupChatId },
      include: {
        event: { select: { id: true, title: true, date: true, coverImageUrl: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                userProfile: { select: { avatarUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!gc) return res.status(404).json({ error: 'Not found' });
    const isMember = gc.members.some((x) => x.userId === me);
    if (!isMember) return res.status(403).json({ error: 'Forbidden' });

    res.json({
      id: gc.id,
      name: gc.name,
      eventId: gc.eventId,
      eventName: gc.event?.title,
      eventDate: gc.event?.date,
      eventImageUrl: gc.event?.coverImageUrl,
      memberCount: gc.members.length,
      members: gc.members.map((m) => ({
        id: m.user.id,
        username: m.user.username || '',
        fullName: m.user.fullName || '',
        avatarUrl: m.user.userProfile?.avatarUrl || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:groupChatId/messages', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const gc = await prisma.groupChat.findFirst({
      where: { id: req.params.groupChatId },
      include: { members: true },
    });
    if (!gc) return res.status(404).json({ error: 'Not found' });
    if (!gc.members.some((x) => x.userId === me)) return res.status(403).json({ error: 'Forbidden' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 50);
    const beforeMessageId = req.query.beforeMessageId ? String(req.query.beforeMessageId) : null;

    let beforeSentAt = null;
    if (beforeMessageId) {
      const bm = await prisma.groupChatMessage.findFirst({
        where: { id: beforeMessageId, groupChatId: gc.id },
      });
      if (bm) beforeSentAt = bm.sentAt;
    }

    const page = await prisma.groupChatMessage.findMany({
      where: {
        groupChatId: gc.id,
        ...(beforeSentAt ? { sentAt: { lt: beforeSentAt } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullName: true,
            userProfile: { select: { avatarUrl: true } },
          },
        },
      },
    });

    await prisma.groupChatMember.updateMany({
      where: { groupChatId: gc.id, userId: me },
      data: { lastReadAt: new Date() },
    });

    res.json(
      page
        .reverse()
        .map((m) => ({
          id: m.id,
          groupChatId: m.groupChatId,
          senderUserId: m.senderUserId,
          body: m.body,
          sentAt: m.sentAt,
          sender: {
            username: m.sender.username || '',
            fullName: m.sender.fullName || '',
            avatarUrl: m.sender.userProfile?.avatarUrl || null,
          },
        })),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:groupChatId/messages', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const schema = z.object({ body: z.string().trim().min(1).max(1000) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid message' });

    const gc = await prisma.groupChat.findFirst({
      where: { id: req.params.groupChatId },
      include: {
        members: true,
        event: { select: { title: true } },
      },
    });
    if (!gc) return res.status(404).json({ error: 'Not found' });
    if (!gc.members.some((x) => x.userId === me)) return res.status(403).json({ error: 'Forbidden' });

    const msg = await prisma.$transaction(async (tx) => {
      const created = await tx.groupChatMessage.create({
        data: {
          groupChatId: gc.id,
          senderUserId: me,
          body: parsed.data.body,
        },
      });
      await tx.groupChat.update({
        where: { id: gc.id },
        data: { lastMessageAt: new Date() },
      });
      return created;
    });

    res.status(201).json({
      id: msg.id,
      groupChatId: msg.groupChatId,
      senderUserId: msg.senderUserId,
      body: msg.body,
      sentAt: msg.sentAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
