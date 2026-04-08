import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { canAccessTable } from '../lib/access.js';

const router = Router();
const DIRECT_PREFIX = 'direct:';

async function resolveUserId(id) {
  const profile = await prisma.userProfile.findUnique({ where: { id } }).catch(() => null);
  return profile?.userId || id;
}

async function canAccessChat(chatId, userId, userRole) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat?.relatedTableId) return { allowed: false, chat: null };

  if (chat.relatedTableId.startsWith(DIRECT_PREFIX)) {
    const participants = chat.relatedTableId.slice(DIRECT_PREFIX.length).split(':');
    return { allowed: participants.includes(userId), chat };
  }

  const allowed = await canAccessTable(chat.relatedTableId, userId, userRole);
  return { allowed, chat };
}

function mapMessage(m) {
  const mediaPrefix = '__media__:';
  const isMedia = typeof m.content === 'string' && m.content.startsWith(mediaPrefix);
  const mediaUrl = isMedia ? m.content.slice(mediaPrefix.length) : null;
  return {
    id: m.id,
    chat_id: m.chatId,
    sender_id: m.senderId,
    content: isMedia ? 'Media' : m.content,
    message_type: isMedia ? 'image' : 'text',
    media_url: mediaUrl,
    reactions: {},
    created_date: m.createdAt,
  };
}

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const chatId = req.query.chat_id;
    if (!chatId) return res.status(400).json({ error: 'chat_id required' });

    const { allowed } = await canAccessChat(String(chatId), req.userId, req.userRole);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const sort = String(req.query.sort || 'created_date');
    const orderBy = { createdAt: sort === '-created_date' ? 'desc' : 'asc' };
    const take = Math.min(parseInt(req.query.limit) || 500, 1000);

    const rows = await prisma.message.findMany({
      where: { chatId: String(chatId) },
      orderBy,
      take,
    });
    res.json(rows.map(mapMessage));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      chat_id: z.string().uuid(),
      sender_id: z.string().optional(),
      content: z.string().trim().min(1).max(5000).optional(),
      media_url: z.string().url().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const d = parsed.data;
    const { allowed, chat } = await canAccessChat(d.chat_id, req.userId, req.userRole);
    if (!allowed || !chat) return res.status(403).json({ error: 'Forbidden' });

    const senderId = d.sender_id ? await resolveUserId(d.sender_id) : req.userId;
    if (senderId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const content = d.media_url ? `__media__:${d.media_url}` : (d.content || '');
    if (!content.trim()) return res.status(400).json({ error: 'Content required' });

    const created = await prisma.message.create({
      data: {
        chatId: d.chat_id,
        senderId,
        content,
      },
    });

    await prisma.chat.update({
      where: { id: d.chat_id },
      data: { lastMessageAt: new Date() },
    }).catch(() => {});

    res.status(201).json(mapMessage(created));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!msg) return res.status(404).json({ error: 'Not found' });

    const { allowed } = await canAccessChat(msg.chatId, req.userId, req.userRole);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    if (msg.senderId !== req.userId) return res.status(403).json({ error: 'Only sender can edit message' });

    const schema = z.object({
      content: z.string().trim().min(1).max(5000).optional(),
      reactions: z.any().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    if (!parsed.data.content) return res.json(mapMessage(msg));
    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: { content: parsed.data.content },
    });
    res.json(mapMessage(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!msg) return res.status(404).json({ error: 'Not found' });

    const { allowed } = await canAccessChat(msg.chatId, req.userId, req.userRole);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    if (msg.senderId !== req.userId) return res.status(403).json({ error: 'Only sender can delete message' });

    await prisma.message.delete({ where: { id: msg.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
