import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { canAccessTable } from '../lib/access.js';

const router = Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { relatedTableId: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: Math.min(parseInt(req.query.limit) || 100, 100)
    });
    const allowed = [];
    for (const c of chats) {
      const ok = await canAccessTable(c.relatedTableId, req.userId, req.userRole);
      if (ok) allowed.push(c);
    }
    res.json(allowed);
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const where = {};
    if (req.query.related_table_id) {
      const ok = await canAccessTable(req.query.related_table_id, req.userId, req.userRole);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      where.relatedTableId = req.query.related_table_id;
    }
    const chats = await prisma.chat.findMany({ where });
    res.json(chats);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const tableId = req.body.related_table_id || null;
    if (tableId) {
      const ok = await canAccessTable(tableId, req.userId, req.userRole);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
    }
    const chat = await prisma.chat.create({
      data: { relatedTableId: tableId }
    });
    res.status(201).json({ id: chat.id });
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
    const ok = await canAccessTable(chat.relatedTableId, req.userId, req.userRole);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });
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
