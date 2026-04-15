/**
 * Host Events API — informal events (house parties, boat parties, etc.)
 * No venue/compliance required.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ensureUserRole } from '../lib/userRoles.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { requireIdentityVerified } from '../middleware/requireIdentityVerified.js';

const router = Router();

function formatHostEvent(e) {
  return {
    id: e.id,
    host_user_id: e.hostUserId,
    title: e.title,
    description: e.description,
    date: e.date?.toISOString?.()?.slice(0, 10) || e.date,
    location: e.location,
    city: e.city,
    capacity: e.capacity,
    entry_cost: e.entryCost,
    guest_approval_required: e.guestApprovalRequired,
    status: e.status,
    cover_image_url: e.coverImageUrl,
    created_at: e.createdAt?.toISOString?.(),
  };
}

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.host_user_id) where.hostUserId = req.query.host_user_id;
    if (req.query.status) where.status = req.query.status;
    const events = await prisma.hostEvent.findMany({
      where,
      orderBy: { date: req.query.sort === '-date' ? 'desc' : 'asc' },
      take: Math.min(parseInt(req.query.limit) || 50, 100),
    });
    res.json(events.map(formatHostEvent));
  } catch (err) {
    next(err);
  }
});

router.get('/filter', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.id) where.id = req.query.id;
    if (req.query.host_user_id) where.hostUserId = req.query.host_user_id;
    if (req.query.status) where.status = req.query.status;
    const events = await prisma.hostEvent.findMany({ where });
    res.json(events.map(formatHostEvent));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const { title, description, date, location, city, capacity, entry_cost, guest_approval_required, status } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
    await ensureUserRole(req.userId, 'host');
    const event = await prisma.hostEvent.create({
      data: {
        hostUserId: req.userId,
        title: String(title),
        description: description || null,
        date: new Date(date),
        location: location || null,
        city: city || null,
        capacity: capacity ? parseInt(capacity) : null,
        entryCost: entry_cost != null ? parseFloat(entry_cost) : null,
        guestApprovalRequired: guest_approval_required !== false,
        status: status || 'draft',
      },
    });
    res.status(201).json(formatHostEvent(event));
  } catch (err) {
    next(err);
  }
});

export default router;
