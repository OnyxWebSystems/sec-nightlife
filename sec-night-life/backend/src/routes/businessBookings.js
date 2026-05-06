import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/event-table-bookings', authenticateToken, async (req, res, next) => {
  try {
    const ownedVenues = await prisma.venue.findMany({
      where: { ownerUserId: req.userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!ownedVenues.length) return res.json({ items: [] });
    const venueIds = ownedVenues.map((v) => v.id);
    const rows = await prisma.eventVenueTableBooking.findMany({
      where: { venueId: { in: venueIds } },
      include: {
        venue: { select: { id: true, name: true } },
        event: { select: { id: true, title: true, date: true, city: true } },
        hostedTable: { select: { id: true, tableName: true, status: true, hostUserId: true } },
        user: { select: { id: true, fullName: true, username: true, userProfile: { select: { username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        role: r.role,
        paystackReference: r.paystackReference,
        amountTotal: r.amountTotal,
        entranceZar: r.entranceZar,
        componentZar: r.componentZar,
        createdAt: r.createdAt,
        venue: r.venue,
        event: r.event,
        hostedTable: r.hostedTable,
        user: {
          id: r.user.id,
          username: r.user.userProfile?.username || r.user.username || r.user.fullName || 'User',
        },
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
