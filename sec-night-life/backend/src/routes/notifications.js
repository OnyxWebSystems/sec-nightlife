import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { isStaff } from '../lib/access.js';

const router = Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const where = { userId: req.userId };
    if (req.query.is_read !== undefined) where.isRead = req.query.is_read === 'true';
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(req.query.limit) || 50, 100)
    });
    res.json(notifications.map(n => ({
      id: n.id, user_id: n.userId, type: n.type, title: n.title, body: n.body,
      action_url: n.actionUrl, is_read: n.isRead, created_at: n.createdAt
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const where = { userId: req.userId };
    if (req.query.is_read !== undefined) where.isRead = req.query.is_read === 'true';
    const notifications = await prisma.notification.findMany({ where });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      user_id: z.string().uuid(),
      type: z.string(),
      title: z.string(),
      body: z.string().optional(),
      message: z.string().optional(),
      action_url: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    if (d.user_id !== req.userId && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const n = await prisma.notification.create({
      data: {
        userId: d.user_id,
        type: d.type,
        title: d.title,
        body: d.body ?? d.message,
        actionUrl: d.action_url
      }
    });
    res.status(201).json({ id: n.id });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', authenticateToken, async (req, res, next) => {
  try {
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: { isRead: true }
    });
    if (updated.count === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const deleted = await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
