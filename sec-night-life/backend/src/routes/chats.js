import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { canAccessTable } from '../lib/access.js';

const router = Router();
const DIRECT_PREFIX = 'direct:';

function directKeyFor(userA, userB) {
  return `${DIRECT_PREFIX}${[userA, userB].sort().join(':')}`;
}

async function resolveUserId(id) {
  const profile = await prisma.userProfile.findUnique({ where: { id } }).catch(() => null);
  return profile?.userId || id;
}

async function areUsersFriends(userAId, userBId) {
  const accepted = await prisma.friendRequest.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { fromUserId: userAId, toUserId: userBId },
        { fromUserId: userBId, toUserId: userAId },
      ],
    },
    select: { id: true },
  });
  return !!accepted;
}

async function decorateChat(chat, viewerUserId) {
  if (!chat) return null;
  const lastMessageRow = await prisma.message.findFirst({
    where: { chatId: chat.id },
    orderBy: { createdAt: 'desc' },
    select: { content: true, createdAt: true },
  });
  const lastMessage = lastMessageRow?.content?.startsWith('__media__:')
    ? '📷 Image'
    : (lastMessageRow?.content || null);
  const lastMessageAt = lastMessageRow?.createdAt || chat.lastMessageAt || null;

  if (chat.relatedTableId?.startsWith(DIRECT_PREFIX)) {
    const parts = chat.relatedTableId.slice(DIRECT_PREFIX.length).split(':');
    const participants = [...new Set(parts)].filter(Boolean);
    const otherId = participants.find((id) => id !== viewerUserId) || participants[0];
    const other = otherId
      ? await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, fullName: true, email: true } })
      : null;
    return {
      ...chat,
      type: 'direct',
      participants,
      name: other?.fullName || other?.email || 'Direct chat',
      last_message: lastMessage,
      last_message_at: lastMessageAt,
      lastMessage,
      lastMessageAt,
    };
  }
  return {
    ...chat,
    type: 'table',
    last_message: lastMessage,
    last_message_at: lastMessageAt,
    lastMessage,
    lastMessageAt,
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { relatedTableId: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: Math.min(parseInt(req.query.limit) || 100, 100)
    });
    const allowed = [];
    for (const c of chats) {
      if (c.relatedTableId?.startsWith(DIRECT_PREFIX)) {
        const key = c.relatedTableId.slice(DIRECT_PREFIX.length);
        const participants = key.split(':');
        if (participants.includes(req.userId)) {
          allowed.push(await decorateChat(c, req.userId));
        }
        continue;
      }
      const ok = await canAccessTable(c.relatedTableId, req.userId, req.userRole);
      if (ok) allowed.push(await decorateChat(c, req.userId));
    }
    res.json(allowed);
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.id) where.id = req.query.id;
    if (req.query.related_table_id) {
      const target = String(req.query.related_table_id);
      if (target.startsWith(DIRECT_PREFIX)) {
        const participants = target.slice(DIRECT_PREFIX.length).split(':');
        if (!participants.includes(req.userId)) return res.status(403).json({ error: 'Forbidden' });
      } else {
        const ok = await canAccessTable(target, req.userId, req.userRole);
        if (!ok) return res.status(403).json({ error: 'Forbidden' });
      }
      where.relatedTableId = target;
    }
    const chats = await prisma.chat.findMany({ where });
    const decorated = [];
    for (const c of chats) {
      decorated.push(await decorateChat(c, req.userId));
    }
    res.json(decorated);
  } catch (err) {
    next(err);
  }
});

router.post('/direct/:targetId', authenticateToken, async (req, res, next) => {
  try {
    const targetUserId = await resolveUserId(req.params.targetId);
    if (!targetUserId || targetUserId === req.userId) return res.status(400).json({ error: 'Invalid target user' });

    const friends = await areUsersFriends(req.userId, targetUserId);
    if (!friends) return res.status(403).json({ error: 'Direct messaging requires accepted friend request' });

    const directKey = directKeyFor(req.userId, targetUserId);
    let chat = await prisma.chat.findFirst({ where: { relatedTableId: directKey } });
    if (!chat) {
      chat = await prisma.chat.create({ data: { relatedTableId: directKey } });
    }
    res.status(201).json(await decorateChat(chat, req.userId));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const tableId = req.body.related_table_id || null;
    if (tableId) {
      if (String(tableId).startsWith(DIRECT_PREFIX)) {
        return res.status(400).json({ error: 'Use /api/chats/direct/:targetId for direct chats' });
      }
      const ok = await canAccessTable(tableId, req.userId, req.userRole);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
    }
    const chat = await prisma.chat.create({
      data: { relatedTableId: tableId }
    });
    res.status(201).json(await decorateChat(chat, req.userId));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const chat = await prisma.chat.findUnique({
      where: { id: req.params.id }
    });
    if (!chat || !chat.relatedTableId) return res.status(404).json({ error: 'Not found' });
    if (chat.relatedTableId.startsWith(DIRECT_PREFIX)) {
      const participants = chat.relatedTableId.slice(DIRECT_PREFIX.length).split(':');
      if (!participants.includes(req.userId)) return res.status(403).json({ error: 'Forbidden' });
    } else {
      const ok = await canAccessTable(chat.relatedTableId, req.userId, req.userRole);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.chat.update({
      where: { id: req.params.id },
      data: { lastMessageAt: new Date() }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
