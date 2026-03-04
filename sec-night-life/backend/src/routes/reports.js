import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = z.object({
      target_type: z.enum(['user', 'venue']),
      target_id: z.string().uuid(),
      reason: z.string().min(1),
      details: z.string().optional()
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    await prisma.report.create({
      data: {
        reporterId: req.userId,
        targetType: d.target_type,
        targetId: d.target_id,
        reason: d.reason,
        details: d.details
      }
    });
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/', authenticateToken, requireRole('ADMIN', 'MODERATOR'), async (req, res, next) => {
  try {
    const reports = await prisma.report.findMany({
      where: { status: req.query.status || 'pending' }
    });
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

export default router;
