import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

async function assertVenueOwner(venueId, userId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, ownerUserId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!venue) {
    const err = new Error('Venue not found or access denied');
    err.status = 404;
    throw err;
  }
  return venue;
}

function formatMenuItem(row) {
  return {
    id: row.id,
    venue_id: row.venueId,
    name: row.name,
    category: row.category,
    price: row.price,
    image_url: row.imageUrl,
    is_available: row.isAvailable,
    sort_order: row.sortOrder,
  };
}

const menuItemSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(60).optional(),
  price: z.number().positive(),
  image_url: z.union([z.string().url(), z.literal('')]).optional().nullable(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

router.get('/venues/:venueId/menu-items', authenticateToken, async (req, res, next) => {
  try {
    await assertVenueOwner(req.params.venueId, req.userId);
    const rows = await prisma.venueMenuItem.findMany({
      where: { venueId: req.params.venueId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(rows.map(formatMenuItem));
  } catch (e) {
    next(e);
  }
});

router.post('/venues/:venueId/menu-items', authenticateToken, async (req, res, next) => {
  try {
    const venueId = req.params.venueId;
    await assertVenueOwner(venueId, req.userId);
    const body = req.body;
    const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [body];
    const parsed = z.array(menuItemSchema).min(1).parse(items);
    const created = await prisma.$transaction(
      parsed.map((item, idx) =>
        prisma.venueMenuItem.create({
          data: {
            venueId,
            name: item.name.trim(),
            category: (item.category || 'Other').trim(),
            price: item.price,
            imageUrl: item.image_url || null,
            isAvailable: item.is_available !== false,
            sortOrder: item.sort_order ?? idx,
          },
        })
      )
    );
    res.status(201).json(created.map(formatMenuItem));
  } catch (e) {
    next(e);
  }
});

router.patch('/venues/:venueId/menu-items/:itemId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, itemId } = req.params;
    await assertVenueOwner(venueId, req.userId);
    const patch = menuItemSchema.partial().parse(req.body);
    const existing = await prisma.venueMenuItem.findFirst({
      where: { id: itemId, venueId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const updated = await prisma.venueMenuItem.update({
      where: { id: itemId },
      data: {
        ...(patch.name != null ? { name: patch.name.trim() } : {}),
        ...(patch.category != null ? { category: patch.category.trim() } : {}),
        ...(patch.price != null ? { price: patch.price } : {}),
        ...(patch.image_url !== undefined ? { imageUrl: patch.image_url } : {}),
        ...(patch.is_available !== undefined ? { isAvailable: patch.is_available } : {}),
        ...(patch.sort_order !== undefined ? { sortOrder: patch.sort_order } : {}),
      },
    });
    res.json(formatMenuItem(updated));
  } catch (e) {
    next(e);
  }
});

router.delete('/venues/:venueId/menu-items/:itemId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, itemId } = req.params;
    await assertVenueOwner(venueId, req.userId);
    const existing = await prisma.venueMenuItem.findFirst({
      where: { id: itemId, venueId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    await prisma.venueMenuItem.delete({ where: { id: itemId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Public menu for event/table flows (venue must exist). */
router.get('/venues/:venueId/menu-items/public', async (req, res, next) => {
  try {
    const venue = await prisma.venue.findFirst({
      where: { id: req.params.venueId, deletedAt: null },
      select: { id: true },
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    const rows = await prisma.venueMenuItem.findMany({
      where: { venueId: venue.id, isAvailable: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(rows.map(formatMenuItem));
  } catch (e) {
    next(e);
  }
});

export default router;
