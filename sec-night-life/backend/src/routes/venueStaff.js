import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { normalizeUsername } from '../lib/username.js';

const router = Router({ mergeParams: true });

const STAFF_PERMISSION_KEYS = [
  'dashboard',
  'analytics',
  'bookings',
  'promotions',
  'events',
  'menu',
  'jobs',
  'posts',
  'messages',
  'venue_page',
];

const permissionsSchema = z
  .object(
    Object.fromEntries(STAFF_PERMISSION_KEYS.map((key) => [key, z.boolean().optional()])),
  )
  .strict();

const addStaffSchema = z.object({
  username: z.string().trim().min(1).max(30),
  permissions: permissionsSchema,
});

async function resolveUserByProfileUsername(rawUsername) {
  const username = normalizeUsername(rawUsername);
  if (!username) return null;
  const profile = await prisma.userProfile.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { userId: true, username: true, user: { select: { id: true, fullName: true, deletedAt: true } } },
  });
  if (!profile?.user || profile.user.deletedAt) return null;
  return { id: profile.user.id, fullName: profile.user.fullName, username: profile.username };
}

async function assertVenueOwner(venueId, userId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, ownerUserId: userId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!venue) {
    const err = new Error('Venue not found or access denied');
    err.status = 403;
    throw err;
  }
  return venue;
}

function formatAssignment(row) {
  return {
    id: row.id,
    venueId: row.venueId,
    userId: row.userId,
    permissions: row.permissions,
    createdAt: row.createdAt,
    user: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          username: row.user.userProfile?.username || row.user.username,
          avatarUrl: row.user.userProfile?.avatarUrl || null,
        }
      : null,
    venue: row.venue ? { id: row.venue.id, name: row.venue.name, city: row.venue.city } : null,
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    await assertVenueOwner(venueId, req.userId);

    const rows = await prisma.venueStaffAssignment.findMany({
      where: { venueId, revokedAt: null },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            userProfile: { select: { username: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items: rows.map(formatAssignment) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const parsed = addStaffSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const venue = await assertVenueOwner(venueId, req.userId);
    const target = await resolveUserByProfileUsername(parsed.data.username);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as staff' });
    }

    const permissions = STAFF_PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = Boolean(parsed.data.permissions[key]);
      return acc;
    }, {});

    const existing = await prisma.venueStaffAssignment.findUnique({
      where: { venueId_userId: { venueId, userId: target.id } },
    });

    let assignment;
    if (existing) {
      if (!existing.revokedAt) {
        return res.status(409).json({ error: 'User is already on staff' });
      }
      assignment = await prisma.venueStaffAssignment.update({
        where: { id: existing.id },
        data: {
          permissions,
          invitedByUserId: req.userId,
          revokedAt: null,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              userProfile: { select: { username: true, avatarUrl: true } },
            },
          },
        },
      });
    } else {
      assignment = await prisma.venueStaffAssignment.create({
        data: {
          venueId,
          userId: target.id,
          invitedByUserId: req.userId,
          permissions,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              userProfile: { select: { username: true, avatarUrl: true } },
            },
          },
        },
      });
    }

    res.status(existing ? 200 : 201).json(formatAssignment({ ...assignment, venue }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.delete('/:userId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, userId: targetUserId } = req.params;
    await assertVenueOwner(venueId, req.userId);

    const assignment = await prisma.venueStaffAssignment.findUnique({
      where: { venueId_userId: { venueId, userId: targetUserId } },
    });
    if (!assignment || assignment.revokedAt) {
      return res.status(404).json({ error: 'Staff assignment not found' });
    }

    await prisma.venueStaffAssignment.update({
      where: { id: assignment.id },
      data: { revokedAt: new Date() },
    });
    res.json({ revoked: true });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

const staffVenuesRouter = Router();

staffVenuesRouter.get('/venues', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.venueStaffAssignment.findMany({
      where: { userId: req.userId, revokedAt: null },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            city: true,
            coverImageUrl: true,
            logoUrl: true,
            venueType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        permissions: row.permissions,
        createdAt: row.createdAt,
        venue: row.venue,
      })),
    });
  } catch (e) {
    next(e);
  }
});

export { staffVenuesRouter };
export default router;
