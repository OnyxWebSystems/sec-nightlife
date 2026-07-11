import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';

const router = Router();

const VENDOR_CATEGORIES = [
  'food_snacks',
  'equipment_rental',
  'dj_av',
  'decor',
  'photography',
  'other',
];

const imageSchema = z.object({
  url: z.string().url().max(2000),
  sort_order: z.number().int().min(0).max(20).optional(),
});

const vendorBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(2000).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  is_published: z.boolean().optional(),
  images: z.array(imageSchema).max(4).optional(),
});

function formatVendor(row, { includeOwner = true } = {}) {
  if (!row) return null;
  const images = (row.images || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((img) => ({
      id: img.id,
      url: img.url,
      sort_order: img.sortOrder,
    }));
  const profile = row.user?.userProfile;
  const out = {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    category: row.category,
    description: row.description,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    is_published: row.isPublished,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    images,
    cover_url: images[0]?.url || null,
  };
  if (includeOwner) {
    out.owner = {
      user_id: row.userId,
      username: profile?.username || row.user?.username || null,
      avatar_url: profile?.avatarUrl || null,
    };
  }
  return out;
}

const vendorInclude = {
  images: true,
  user: {
    select: {
      id: true,
      username: true,
      userProfile: { select: { username: true, avatarUrl: true } },
    },
  },
};

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));

    const where = {
      deletedAt: null,
      isPublished: true,
      ...(category && category !== 'all' ? { category } : {}),
      ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await prisma.vendorBusiness.findMany({
      where,
      include: vendorInclude,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    res.json({
      vendors: rows.map((r) => formatVendor(r)),
      categories: VENDOR_CATEGORIES,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/mine', authenticateToken, async (req, res, next) => {
  try {
    const row = await prisma.vendorBusiness.findFirst({
      where: { userId: req.userId, deletedAt: null },
      include: vendorInclude,
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ vendor: formatVendor(row) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const row = await prisma.vendorBusiness.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: vendorInclude,
    });
    if (!row) return res.status(404).json({ error: 'Vendor not found' });
    if (!row.isPublished && row.userId !== req.userId) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(formatVendor(row));
  } catch (err) {
    next(err);
  }
});

async function replaceImages(tx, vendorBusinessId, images) {
  await tx.vendorBusinessImage.deleteMany({ where: { vendorBusinessId } });
  if (!images?.length) return;
  await tx.vendorBusinessImage.createMany({
    data: images.map((img, i) => ({
      vendorBusinessId,
      url: img.url,
      sortOrder: img.sort_order ?? i,
    })),
  });
}

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = vendorBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid vendor data', details: parsed.error.flatten() });
    }
    const data = parsed.data;

    const existing = await prisma.vendorBusiness.findFirst({
      where: { userId: req.userId, deletedAt: null },
    });
    if (existing) {
      return res.status(409).json({ error: 'You already have a vendor listing. Update it instead.' });
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorBusiness.create({
        data: {
          userId: req.userId,
          name: data.name,
          category: data.category,
          description: data.description || null,
          city: data.city || null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          isPublished: data.is_published ?? true,
        },
      });
      if (data.images?.length) {
        await replaceImages(tx, created.id, data.images);
      }
      await tx.userProfile.upsert({
        where: { userId: req.userId },
        create: {
          userId: req.userId,
          hasVendorInterest: true,
          vendorListingDeferred: false,
        },
        update: {
          hasVendorInterest: true,
          vendorListingDeferred: false,
        },
      });
      return tx.vendorBusiness.findUnique({
        where: { id: created.id },
        include: vendorInclude,
      });
    });

    res.status(201).json(formatVendor(row));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const parsed = vendorBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid vendor data', details: parsed.error.flatten() });
    }
    const data = parsed.data;

    const existing = await prisma.vendorBusiness.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });
    if (existing.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const row = await prisma.$transaction(async (tx) => {
      await tx.vendorBusiness.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.description !== undefined && { description: data.description || null }),
          ...(data.city !== undefined && { city: data.city || null }),
          ...(data.latitude !== undefined && { latitude: data.latitude }),
          ...(data.longitude !== undefined && { longitude: data.longitude }),
          ...(data.is_published !== undefined && { isPublished: data.is_published }),
        },
      });
      if (data.images !== undefined) {
        await replaceImages(tx, existing.id, data.images || []);
      }
      if (data.is_published === true || data.name || data.images) {
        await tx.userProfile.updateMany({
          where: { userId: req.userId },
          data: { vendorListingDeferred: false, hasVendorInterest: true },
        });
      }
      return tx.vendorBusiness.findUnique({
        where: { id: existing.id },
        include: vendorInclude,
      });
    });

    res.json(formatVendor(row));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const existing = await prisma.vendorBusiness.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });
    if (existing.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.vendorBusiness.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isPublished: false },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Create reminder notification when user said yes but deferred listing. */
export async function maybeSendVendorListingReminder(userId) {
  const published = await prisma.vendorBusiness.findFirst({
    where: { userId, deletedAt: null, isPublished: true },
    select: { id: true },
  });
  if (published) return;

  const recent = await prisma.inAppNotification.findFirst({
    where: {
      userId,
      type: 'VENDOR_LISTING_REMINDER',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (recent) return;

  await createInAppNotification({
    userId,
    type: 'VENDOR_LISTING_REMINDER',
    title: 'List your vendor business',
    body: 'Finish listing your services in Settings so venues can find and contact you.',
    referenceId: '/VendorBusinessSettings',
    referenceType: 'ROUTE',
  });
}

export default router;
