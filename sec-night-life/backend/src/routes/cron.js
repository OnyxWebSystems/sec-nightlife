import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/expire-promotions', async (req, res, next) => {
  try {
    const secret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const expiredPromotions = await prisma.promotion.updateMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        endAt: { lt: now },
      },
      data: { status: 'ENDED' },
    });

    const expiredBoosts = await prisma.promotion.updateMany({
      where: {
        deletedAt: null,
        boosted: true,
        boostExpiresAt: { lt: now },
      },
      data: { boosted: false },
    });

    res.json({
      expired: expiredPromotions.count,
      boostsExpired: expiredBoosts.count,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/complete-parties', async (req, res, next) => {
  try {
    const secret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date();
    const r = await prisma.houseParty.updateMany({
      where: { status: 'PUBLISHED', endTime: { lt: now } },
      data: { status: 'COMPLETED' },
    });
    res.json({ completed: r.count });
  } catch (err) {
    next(err);
  }
});

router.get('/expire-table-boosts', async (req, res, next) => {
  try {
    const secret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date();
    const r = await prisma.hostedTable.updateMany({
      where: { boosted: true, boostExpiresAt: { lt: now } },
      data: { boosted: false },
    });
    res.json({ expired: r.count });
  } catch (err) {
    next(err);
  }
});

export default router;
