import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { isStaff } from '../lib/access.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { logFriendActivity } from '../lib/friendActivity.js';
import { sendEmail } from '../lib/email.js';

const router = Router();
const PROMOTION_TYPES = ['VENUE_PROMOTION', 'EVENT_PROMOTION', 'SPECIAL_OFFER', 'ANNOUNCEMENT'];
const PROMOTION_ROTATION_WINDOW_MINUTES = 2;
const BOOSTED_WEIGHT = 3;
const ORGANIC_WEIGHT = 1;

function formatOwnerPromotion(p) {
  return {
    id: p.id,
    venueId: p.venueId,
    eventId: p.eventId,
    promotionType: p.type,
    title: p.title,
    body: p.description,
    imageUrl: p.imageUrl,
    imagePublicId: p.imagePublicId,
    targetCity: p.targetCity,
    status: p.status,
    startsAt: p.startAt,
    endsAt: p.endAt,
    boosted: p.boosted,
    boostedAt: p.boostedAt,
    boostExpiresAt: p.boostExpiresAt,
    boostImpressions: p.boostImpressions,
    organicImpressions: p.organicImpressions,
    totalClicks: p.totalClicks,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    eventName: p.event?.title || null,
  };
}

function computeUniquePromotionStats(impressions = []) {
  const viewKeys = new Set();
  const clickKeys = new Set();
  for (const impression of impressions) {
    const identity = impression.userId ? `u:${impression.userId}` : `s:${impression.sessionId}`;
    if (impression.type === 'VIEW') viewKeys.add(identity);
    if (impression.type === 'CLICK') clickKeys.add(identity);
  }
  return {
    uniqueViews: viewKeys.size,
    uniqueClicks: clickKeys.size,
  };
}

/**
 * Business UI can show "Business" mode when the user owns venues even if `User.role` is still USER.
 * Align promotions with that: VENUE role, staff, or at least one owned venue.
 */
async function assertPromotionsAccess(req, res) {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  if (isStaff(req.userRole)) return true;
  if (req.userRole === 'VENUE') return true;
  const ownedCount = await prisma.venue.count({
    where: { ownerUserId: req.userId, deletedAt: null },
  });
  if (ownedCount > 0) return true;
  res.status(403).json({ error: 'Only business owners can perform this action' });
  return false;
}

function calculateScore(promotion) {
  const hours = (Date.now() - new Date(promotion.createdAt).getTime()) / (1000 * 60 * 60);
  const recency = hours <= 24 ? 10 : hours <= 48 ? 5 : 0;
  return (promotion.boosted ? 1500 : 0) + (promotion.boostImpressions < 500 ? 50 : 0) + (promotion.organicImpressions < 100 ? 20 : 0) + recency;
}

function interleavePromotions(boosted, organic) {
  const result = [];
  let b = 0;
  let o = 0;
  /** More B slots than before so paid boosts surface more often in the feed. */
  const slots = ['B', 'B', 'B', 'O', 'B', 'O'];

  while (b < boosted.length || o < organic.length) {
    for (const slot of slots) {
      if (slot === 'B') {
        if (b < boosted.length) result.push(boosted[b++]);
        else if (o < organic.length) result.push(organic[o++]);
      } else if (o < organic.length) result.push(organic[o++]);
      else if (b < boosted.length) result.push(boosted[b++]);
      if (b >= boosted.length && o >= organic.length) break;
    }
  }
  return result;
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Weighted, deterministic order without duplicates:
 * boosted promotions get higher exposure frequency across rotating windows.
 */
function weightedWindowOrder(promotions, sessionSeed) {
  const rand = seededRandom(hashString(sessionSeed));
  const prepared = promotions.map((item) => {
    const weight = item.boosted ? BOOSTED_WEIGHT : ORGANIC_WEIGHT;
    // Efraimidis-Spirakis style weighted sampling key.
    const u = Math.max(rand(), Number.EPSILON);
    const key = Math.pow(u, 1 / weight);
    return { item, key };
  });
  prepared.sort((a, b) => {
    if (a.key !== b.key) return b.key - a.key;
    return new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime();
  });
  return prepared.map((x) => x.item);
}

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

/** For PATCH: omit field means undefined (do not overwrite); '' or null clears. */
const emptyToNullKeepUndefined = (v) => {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  return v;
};

/** Accepts ISO strings from Date#toISOString(); avoids Zod .datetime() strict RFC edge cases in some environments. */
const isoDateTimeString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' });

/** Zod .url() rejects some valid Cloudinary / CDN URLs; accept any absolute http(s) URL. */
function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const httpUrlOrNull = z.preprocess(
  emptyToNull,
  z.union([z.string().min(1).max(2048).refine(isHttpUrl, { message: 'Invalid image URL' }), z.null()]).optional()
);

const patchHttpUrlOrNull = z.preprocess(
  emptyToNullKeepUndefined,
  z.union([z.string().min(1).max(2048).refine(isHttpUrl, { message: 'Invalid image URL' }), z.null()]).optional()
);

function normalizePromotionCreateBody(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw !== 'object') return {};
  const b = { ...raw };
  if (b.venue_id && !b.venueId) b.venueId = b.venue_id;
  if (b.event_id != null && b.eventId == null) b.eventId = b.event_id;
  if (b.promotion_type && !b.promotionType) b.promotionType = b.promotion_type;
  if (b.type && !b.promotionType) b.promotionType = b.type;
  if (b.starts_at && !b.startsAt) b.startsAt = b.starts_at;
  if (b.ends_at && !b.endsAt) b.endsAt = b.ends_at;
  if (b.start_at && !b.startsAt) b.startsAt = b.start_at;
  if (b.end_at && !b.endsAt) b.endsAt = b.end_at;
  if (b.startAt && !b.startsAt) b.startsAt = b.startAt;
  if (b.endAt && !b.endsAt) b.endsAt = b.endAt;
  if (b.startDate && !b.startsAt) b.startsAt = b.startDate;
  if (b.endDate && !b.endsAt) b.endsAt = b.endDate;
  if (b.image_url && !b.imageUrl) b.imageUrl = b.image_url;
  if (b.image_public_id && !b.imagePublicId) b.imagePublicId = b.image_public_id;
  if (b.target_city != null && b.targetCity == null) b.targetCity = b.target_city;
  if (b.description && !b.body) b.body = b.description;
  return b;
}

const createSchema = z.object({
  venueId: z.string().trim().min(1),
  eventId: z.preprocess(emptyToNull, z.union([z.string().trim().min(1), z.null()]).optional()),
  promotionType: z.enum(PROMOTION_TYPES),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
  imageUrl: httpUrlOrNull,
  imagePublicId: z.preprocess(emptyToNull, z.union([z.string().trim().min(1), z.null()]).optional()),
  targetCity: z.preprocess(emptyToNull, z.union([z.string().trim().max(100), z.null()]).optional()),
  startsAt: isoDateTimeString,
  endsAt: isoDateTimeString,
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  body: z.string().trim().min(1).max(500).optional(),
  imageUrl: patchHttpUrlOrNull,
  imagePublicId: z.preprocess(emptyToNullKeepUndefined, z.union([z.string().trim().min(1), z.null()]).optional()),
  targetCity: z.preprocess(emptyToNullKeepUndefined, z.union([z.string().trim().max(100), z.null()]).optional()),
  startsAt: isoDateTimeString.optional(),
  endsAt: isoDateTimeString.optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  promotionType: z.enum(PROMOTION_TYPES).optional(),
  eventId: z.preprocess(emptyToNullKeepUndefined, z.union([z.string().trim().min(1), z.null()]).optional()),
});

const trackSchema = z.object({
  type: z.enum(['VIEW', 'CLICK']),
  sessionId: z.string().min(8).max(128),
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    if (!(await assertPromotionsAccess(req, res))) return;
    const parsed = createSchema.safeParse(normalizePromotionCreateBody(req.body));
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid promotion payload',
        details: parsed.error.flatten(),
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    const now = new Date();
    if (startsAt < now) return res.status(400).json({ error: 'startsAt must be now or in the future' });
    if (endsAt <= startsAt) return res.status(400).json({ error: 'endsAt must be after startsAt' });
    if (endsAt > new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000)) return res.status(400).json({ error: 'Promotion duration cannot exceed 30 days' });

    const venue = await prisma.venue.findFirst({
      where: { id: data.venueId, ownerUserId: req.userId, deletedAt: null },
      include: { owner: { select: { email: true } } },
    });
    if (!venue) return res.status(403).json({ error: 'You can only create promotions for your own venue' });

    if (data.eventId) {
      const event = await prisma.event.findFirst({ where: { id: data.eventId, venueId: data.venueId, deletedAt: null } });
      if (!event) return res.status(400).json({ error: 'Selected event does not belong to this venue' });
    }

    const eventIdForDb = data.eventId || null;

    const created = await prisma.promotion.create({
      data: {
        venueId: data.venueId,
        eventId: eventIdForDb,
        type: data.promotionType,
        title: data.title,
        description: data.body,
        imageUrl: data.imageUrl || null,
        imagePublicId: data.imagePublicId || null,
        targetCity: data.targetCity || null,
        status: 'ACTIVE',
        startAt: startsAt,
        endAt: endsAt,
      },
      include: { event: { select: { title: true } } },
    });

    if (venue.owner?.email) {
      sendEmail({
        to: venue.owner.email,
        subject: `Your promotion is live — ${created.title}`,
        text: `Your promotion "${created.title}" is live from ${startsAt.toISOString()} to ${endsAt.toISOString()} targeting ${created.targetCity || 'National'}. Boost for more reach.`,
      }).catch(() => {});
    }

    res.status(201).json(formatOwnerPromotion(created));
  } catch (err) {
    next(err);
  }
});

router.get('/venue/:venueId', authenticateToken, async (req, res, next) => {
  try {
    if (!(await assertPromotionsAccess(req, res))) return;
    const venue = await prisma.venue.findFirst({ where: { id: req.params.venueId, ownerUserId: req.userId, deletedAt: null } });
    if (!venue) return res.status(403).json({ error: 'Forbidden' });

    const promotions = await prisma.promotion.findMany({
      where: { venueId: req.params.venueId, deletedAt: null },
      include: {
        event: { select: { title: true } },
        impressions: { select: { userId: true, sessionId: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      promotions.map((promotion) => {
        const base = formatOwnerPromotion(promotion);
        const unique = computeUniquePromotionStats(promotion.impressions);
        return {
          ...base,
          boostImpressions: unique.uniqueViews,
          organicImpressions: 0,
          totalClicks: unique.uniqueClicks,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.patch('/:promotionId', authenticateToken, async (req, res, next) => {
  try {
    if (!(await assertPromotionsAccess(req, res))) return;
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });

    const existing = await prisma.promotion.findFirst({ where: { id: req.params.promotionId, deletedAt: null }, include: { venue: true } });
    if (!existing) return res.status(404).json({ error: 'Promotion not found' });
    if (existing.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const venueId = existing.venueId;
    let nextEventId = existing.eventId;
    if (parsed.data.eventId !== undefined) {
      if (parsed.data.eventId) {
        const event = await prisma.event.findFirst({ where: { id: parsed.data.eventId, venueId, deletedAt: null } });
        if (!event) return res.status(400).json({ error: 'Selected event does not belong to this venue' });
        nextEventId = parsed.data.eventId;
      } else {
        nextEventId = null;
      }
    }

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startAt;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : existing.endAt;
    if (endsAt <= startsAt) return res.status(400).json({ error: 'endsAt must be after startsAt' });
    if (endsAt > new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000)) return res.status(400).json({ error: 'Promotion duration cannot exceed 30 days' });

    const updateData = {
      title: parsed.data.title,
      description: parsed.data.body,
      imageUrl: parsed.data.imageUrl,
      imagePublicId: parsed.data.imagePublicId,
      targetCity: parsed.data.targetCity,
      startAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      status: parsed.data.status,
      type: parsed.data.promotionType,
      eventId: parsed.data.eventId !== undefined ? nextEventId : undefined,
    };

    const updated = await prisma.promotion.update({
      where: { id: existing.id },
      data: updateData,
      include: { event: { select: { title: true } } },
    });

    res.json(formatOwnerPromotion(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:promotionId', authenticateToken, async (req, res, next) => {
  try {
    if (!(await assertPromotionsAccess(req, res))) return;
    const existing = await prisma.promotion.findFirst({ where: { id: req.params.promotionId, deletedAt: null }, include: { venue: true } });
    if (!existing) return res.status(404).json({ error: 'Promotion not found' });
    if (existing.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.promotion.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: 'ENDED' },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:promotionId/boost', authenticateToken, async (req, res, next) => {
  try {
    if (!(await assertPromotionsAccess(req, res))) return;
    const promotion = await prisma.promotion.findFirst({
      where: { id: req.params.promotionId, deletedAt: null },
      include: { venue: true },
    });
    if (!promotion) return res.status(404).json({ error: 'Promotion not found' });
    if (promotion.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Paystack is not configured' });

    const owner = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });
    const reference = `boost_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const amountInCents = 15000;
    const metadata = { promotedPostId: promotion.id, type: 'BOOST', venueId: promotion.venueId };

    await prisma.payment.create({
      data: {
        userId: req.userId,
        email: owner?.email || 'user@secnightlife.app',
        amount: 150,
        reference,
        status: 'pending',
        type: 'promotion',
        metadata,
      },
    });

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: owner?.email || 'user@secnightlife.app',
        amount: amountInCents,
        reference,
        metadata: { user_id: req.userId, ...metadata },
      }),
    });
    const json = await response.json();
    if (!response.ok || !json?.status) {
      return res.status(400).json({ error: json?.message || 'Failed to initialize boost payment' });
    }

    res.json({
      reference,
      authorization_url: json.data.authorization_url,
      access_code: json.data.access_code,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:promotionId/track', optionalAuth, async (req, res, next) => {
  try {
    const parsed = trackSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });

    const promotion = await prisma.promotion.findFirst({ where: { id: req.params.promotionId, deletedAt: null }, select: { id: true } });
    if (!promotion) return res.status(404).json({ error: 'Promotion not found' });

    const isAuthenticated = Boolean(req.userId);
    const identityWhere = isAuthenticated
      ? { userId: req.userId }
      : { sessionId: parsed.data.sessionId };

    const existingInteraction = await prisma.promotionImpression.findFirst({
      where: {
        promotedPostId: promotion.id,
        type: parsed.data.type,
        ...identityWhere,
      },
      select: { id: true },
    });

    if (existingInteraction) return res.status(200).json({ ok: true, deduped: true });

    await prisma.promotionImpression.create({
      data: {
        promotedPostId: promotion.id,
        userId: req.userId || null,
        sessionId: parsed.data.sessionId,
        type: parsed.data.type,
      },
    });

    if (parsed.data.type === 'VIEW') {
      const current = await prisma.promotion.findUnique({
        where: { id: promotion.id },
        select: { boosted: true },
      });
      await prisma.promotion.update({
        where: { id: promotion.id },
        data: current?.boosted ? { boostImpressions: { increment: 1 } } : { organicImpressions: { increment: 1 } },
      });
    } else if (parsed.data.type === 'CLICK') {
      await prisma.promotion.update({ where: { id: promotion.id }, data: { totalClicks: { increment: 1 } } });
      if (req.userId) {
        logFriendActivity({
          userId: req.userId,
          activityType: 'INTERACTED_PROMOTION',
          referenceId: promotion.id,
          referenceType: 'PROMOTION',
          description: 'checked out a promotion',
        });
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 20);
    const overrideCity = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    /** When set (e.g. Home "All Cities"), do not filter by city or use profile fallback — show all in-window ACTIVE promos. */
    const scopeAll = req.query.scope === 'all' || req.query.all === '1' || req.query.all === 'true';
    const sessionIdHeader = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'].trim() : '';
    const sessionIdQuery = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
    const sessionId = sessionIdHeader || sessionIdQuery || 'anon-session';
    const now = new Date();
    const rotationWindowMinutes = PROMOTION_ROTATION_WINDOW_MINUTES;
    const rotationWindowMs = rotationWindowMinutes * 60 * 1000;
    const rotationBucket = Math.floor(now.getTime() / rotationWindowMs);

    let city = '';
    if (scopeAll) {
      city = '';
    } else {
      city = overrideCity;
      if (!city && req.userId) {
        const profile = await prisma.userProfile.findUnique({ where: { userId: req.userId }, select: { city: true } });
        city = profile?.city || '';
      }
    }

    await prisma.promotion.updateMany({
      where: { boosted: true, boostExpiresAt: { lt: now } },
      data: { boosted: false },
    });

    const promotions = await prisma.promotion.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        startAt: { lte: now },
        endAt: { gt: now },
        ...(city
          ? {
              OR: [
                { targetCity: null },
                { targetCity: { equals: city, mode: 'insensitive' } },
                { venue: { city: { equals: city, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        venue: { select: { id: true, name: true, city: true, venueType: true } },
        event: { select: { id: true, title: true, date: true } },
      },
    });

    const followedVenueIds = req.userId
      ? new Set(
          (
            await prisma.venueFollow.findMany({
              where: { userId: req.userId },
              select: { venueId: true },
            })
          ).map((x) => x.venueId),
        )
      : new Set();

    const scored = promotions
      .map((p) => ({
        ...p,
        score: calculateScore(p) + (followedVenueIds.has(p.venueId) ? 500 : 0),
        cityMatch:
          city &&
          ((p.targetCity && p.targetCity.toLowerCase() === city.toLowerCase()) ||
            (p.venue?.city && p.venue.city.toLowerCase() === city.toLowerCase()))
            ? 1
            : 0,
      }))
      .sort((a, b) => {
        if (a.cityMatch !== b.cityMatch) return b.cityMatch - a.cityMatch;
        if (a.score !== b.score) return b.score - a.score;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const mixedBase = interleavePromotions(scored.filter((p) => p.boosted), scored.filter((p) => !p.boosted));
    const mixed = weightedWindowOrder(mixedBase, `${sessionId}|${city || 'all'}|${rotationBucket}`);
    const offset = (page - 1) * limit;
    const results = mixed.slice(offset, offset + limit);

    res.json({
      page,
      limit,
      rotationWindowMinutes,
      total: mixed.length,
      results: results.map((p) => ({
        id: p.id,
        promotionType: p.type,
        title: p.title,
        body: p.description,
        imageUrl: p.imageUrl,
        targetCity: p.targetCity,
        boosted: p.boosted,
        startsAt: p.startAt,
        endsAt: p.endAt,
        venueId: p.venue.id,
        venueName: p.venue.name,
        venueCity: p.venue.city,
        venueType: p.venue.venueType,
        eventId: p.event?.id || null,
        eventName: p.event?.title || null,
        eventDate: p.event?.date || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

