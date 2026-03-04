import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = z.object({ blocked_id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const bid = parsed.data.blocked_id;
    if (bid === req.userId) return res.status(400).json({ error: 'Cannot block self' });
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.userId, blockedId: bid } },
      create: { blockerId: req.userId, blockedId: bid },
      update: {}
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:blockedId', authenticateToken, async (req, res, next) => {
  try {
    await prisma.block.deleteMany({
      where: { blockerId: req.userId, blockedId: req.params.blockedId }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
