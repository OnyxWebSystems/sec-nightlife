import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/my', authenticateToken, async (req, res, next) => {
  try {
    const now = new Date();
    const rows = await prisma.ticket.findMany({
      where: {
        userId: req.userId,
        visibleUntil: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      rows.map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title,
        subtitle: t.subtitle,
        paystack_reference: t.paystackReference,
        qr_token: t.qrToken,
        house_party_id: t.housePartyId,
        table_id: t.tableId,
        hosted_table_id: t.hostedTableId,
        event_id: t.eventId,
        venue_table_id: t.venueTableId,
        quantity: t.quantity,
        visible_until: t.visibleUntil,
        created_at: t.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/qr', optionalAuth, async (req, res, next) => {
  try {
    const token = z.string().min(1).parse(req.query.token);
    const now = new Date();
    const t = await prisma.ticket.findUnique({ where: { qrToken: token } });
    if (!t) return res.status(404).json({ valid: false, reason: 'Ticket not found' });
    if (t.visibleUntil <= now) return res.status(410).json({ valid: false, reason: 'Ticket expired' });
    res.json({
      valid: true,
      ticket_id: t.id,
      kind: t.kind,
      title: t.title,
      subtitle: t.subtitle,
      quantity: t.quantity,
      event_id: t.eventId,
      table_id: t.tableId,
      hosted_table_id: t.hostedTableId,
      venue_table_id: t.venueTableId,
      house_party_id: t.housePartyId,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ valid: false, reason: 'Invalid token' });
    next(err);
  }
});

export default router;
