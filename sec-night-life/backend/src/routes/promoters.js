import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.post('/:promoterId/follow', authenticateToken, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    if (promoterId === req.userId) return res.status(400).json({ error: 'You cannot follow yourself.' });
    const profile = await prisma.userProfile.findUnique({
      where: { userId: promoterId },
      select: { isVerifiedPromoter: true },
    });
    if (!profile?.isVerifiedPromoter) return res.status(400).json({ error: 'Only verified promoters can be followed.' });
    await prisma.promoterFollow.upsert({
      where: { userId_promoterId: { userId: req.userId, promoterId } },
      create: { userId: req.userId, promoterId },
      update: {},
    });
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:promoterId/follow', authenticateToken, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    await prisma.promoterFollow.deleteMany({
      where: { userId: req.userId, promoterId },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:promoterId/followers/count', async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    const count = await prisma.promoterFollow.count({ where: { promoterId } });
    res.json({ promoterId, followers: count });
  } catch (err) {
    next(err);
  }
});

router.get('/me/following', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.promoterFollow.findMany({
      where: { userId: req.userId },
      select: { promoterId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:promoterId/following-status', authenticateToken, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    const row = await prisma.promoterFollow.findUnique({
      where: { userId_promoterId: { userId: req.userId, promoterId } },
      select: { userId: true },
    });
    res.json({ following: !!row });
  } catch (err) {
    next(err);
  }
});

export default router;
