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

/** SEC catalog paths must never be shown as venue product photos. */
function isVenueOwnedImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t || t.startsWith('/menu-catalog/')) return false;
  return t.startsWith('https://') || t.startsWith('http://');
}

function formatMenuItem(row) {
  const imageUrl = isVenueOwnedImageUrl(row.imageUrl) ? row.imageUrl : null;
  return {
    id: row.id,
    venue_id: row.venueId,
    catalog_item_id: row.catalogItemId,
    name: row.name,
    category: row.category,
    sub_category: row.subCategory,
    price: row.price,
    image_url: imageUrl,
    is_available: row.isAvailable && !!imageUrl,
    sort_order: row.sortOrder,
    needs_photo: !imageUrl,
  };
}

function resolveAvailability(imageUrl, requestedAvailable) {
  const owned = isVenueOwnedImageUrl(imageUrl);
  if (requestedAvailable === false) return false;
  return owned;
}

const menuItemSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(60).optional(),
  sub_category: z.string().max(80).optional().nullable(),
  catalog_item_id: z.string().max(80).optional().nullable(),
  price: z.number().positive(),
  image_url: z
    .union([z.string().url(), z.literal(''), z.string().regex(/^\//)])
    .optional()
    .nullable(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const fromCatalogSchema = z.object({
  items: z
    .array(
      z.object({
        catalog_item_id: z.string().min(1),
        price: z.number().positive().optional(),
        image_url: z.string().url().optional().nullable(),
      })
    )
    .min(1),
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
            catalogItemId: item.catalog_item_id || null,
            name: item.name.trim(),
            category: (item.category || 'Other').trim(),
            subCategory: item.sub_category || null,
            price: item.price,
            imageUrl: isVenueOwnedImageUrl(item.image_url) ? item.image_url.trim() : null,
            isAvailable: resolveAvailability(item.image_url, item.is_available),
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

router.post('/venues/:venueId/menu-items/from-catalog', authenticateToken, async (req, res, next) => {
  try {
    const venueId = req.params.venueId;
    await assertVenueOwner(venueId, req.userId);
    const { items } = fromCatalogSchema.parse(req.body);
    const catalogIds = items.map((i) => i.catalog_item_id);
    const catalogRows = await prisma.menuCatalogItem.findMany({
      where: { id: { in: catalogIds }, isActive: true },
    });
    const catalogMap = new Map(catalogRows.map((r) => [r.id, r]));

    const existing = await prisma.venueMenuItem.findMany({
      where: { venueId, catalogItemId: { in: catalogIds } },
      select: { catalogItemId: true },
    });
    const existingIds = new Set(existing.map((e) => e.catalogItemId));

    const toCreate = [];
    const skipped = [];
    let sortBase = await prisma.venueMenuItem.count({ where: { venueId } });

    for (const row of items) {
      if (existingIds.has(row.catalog_item_id)) {
        skipped.push(row.catalog_item_id);
        continue;
      }
      const cat = catalogMap.get(row.catalog_item_id);
      if (!cat) {
        const err = new Error(`Catalog item not found: ${row.catalog_item_id}`);
        err.status = 400;
        throw err;
      }
      const price =
        row.price != null && Number.isFinite(row.price) ? row.price : cat.defaultPriceZar;
      if (!price || price <= 0) {
        const err = new Error(`Invalid price for ${cat.name}`);
        err.status = 400;
        throw err;
      }
      const venueImage = isVenueOwnedImageUrl(row.image_url) ? row.image_url.trim() : null;
      toCreate.push({
        venueId,
        catalogItemId: cat.id,
        name: cat.name,
        category: cat.topCategory,
        subCategory: cat.subCategory,
        price,
        imageUrl: venueImage,
        isAvailable: !!venueImage,
        sortOrder: sortBase++,
      });
    }

    const created =
      toCreate.length > 0
        ? await prisma.$transaction(
            toCreate.map((data) => prisma.venueMenuItem.create({ data }))
          )
        : [];

    res.status(201).json({
      created: created.map(formatMenuItem),
      skipped_catalog_ids: skipped,
    });
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

    const nextImage =
      patch.image_url !== undefined
        ? isVenueOwnedImageUrl(patch.image_url)
          ? patch.image_url.trim()
          : null
        : existing.imageUrl;

    if (patch.is_available === true && !isVenueOwnedImageUrl(nextImage)) {
      return res.status(400).json({
        error: 'Upload your own photo before making this item visible to guests.',
      });
    }

    let nextAvailable = existing.isAvailable;
    if (patch.is_available !== undefined) {
      nextAvailable = resolveAvailability(nextImage, patch.is_available);
    } else if (
      patch.image_url !== undefined &&
      isVenueOwnedImageUrl(nextImage) &&
      !isVenueOwnedImageUrl(existing.imageUrl)
    ) {
      nextAvailable = true;
    }

    const updated = await prisma.venueMenuItem.update({
      where: { id: itemId },
      data: {
        ...(patch.name != null ? { name: patch.name.trim() } : {}),
        ...(patch.category != null ? { category: patch.category.trim() } : {}),
        ...(patch.sub_category !== undefined ? { subCategory: patch.sub_category } : {}),
        ...(patch.price != null ? { price: patch.price } : {}),
        ...(patch.image_url !== undefined ? { imageUrl: nextImage } : {}),
        isAvailable: nextAvailable,
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
      where: {
        venueId: venue.id,
        isAvailable: true,
        imageUrl: { not: null },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(rows.filter((r) => isVenueOwnedImageUrl(r.imageUrl)).map(formatMenuItem));
  } catch (e) {
    next(e);
  }
});

export default router;
