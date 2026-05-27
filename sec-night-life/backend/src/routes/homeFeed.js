import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { buildTableOfferings } from '../lib/tableOfferings.js';

const router = Router();

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

function shuffleCopy(arr, seedStr) {
  const rand = seededRandom(hashString(seedStr));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function promotionItemFromRow(p) {
  return {
    kind: 'promotion',
    data: {
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
    },
  };
}

/**
 * Cursor-paginated mixed feed (promotions, events, venues) for Home.
 * Boosted promotions are kept ahead of organic ones; events use `endsAt` (not calendar date only).
 */
router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 24);
    const cursor = Math.max(parseInt(req.query.cursor, 10) || 0, 0);
    const scopeAll = req.query.scope === 'all' || req.query.all === '1' || req.query.all === 'true';
    const overrideCity = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const sessionId =
      (typeof req.headers['x-session-id'] === 'string' && req.headers['x-session-id'].trim()) ||
      (typeof req.query.sessionId === 'string' && req.query.sessionId.trim()) ||
      'anon-session';

    let city = '';
    if (scopeAll) {
      city = '';
    } else {
      city = overrideCity;
      if (!city && req.userId) {
        const profile = await prisma.userProfile.findUnique({
          where: { userId: req.userId },
          select: { city: true },
        });
        city = (profile?.city || '').trim();
      }
    }

    const now = new Date();

    await prisma.promotion.updateMany({
      where: { deletedAt: null, boosted: true, boostExpiresAt: { lt: now } },
      data: { boosted: false },
    });

    const [promotionRows, eventRows, venueRows, followedRows] = await Promise.all([
      prisma.promotion.findMany({
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
        take: 60,
        orderBy: [{ boosted: 'desc' }, { createdAt: 'desc' }],
        include: {
          venue: { select: { id: true, name: true, city: true, venueType: true } },
          event: { select: { id: true, title: true, date: true, endsAt: true } },
        },
      }),
      prisma.event.findMany({
        where: { deletedAt: null, status: 'published', endsAt: { gte: now } },
        orderBy: { date: 'asc' },
        take: 40,
      }),
      prisma.venue.findMany({
        where: { deletedAt: null, ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}) },
        orderBy: { rating: 'desc' },
        take: 40,
      }),
      req.userId
        ? prisma.venueFollow.findMany({ where: { userId: req.userId }, select: { venueId: true } })
        : Promise.resolve([]),
    ]);

    const followedSet = new Set(followedRows.map((r) => r.venueId));

    const allProm = promotionRows.map(promotionItemFromRow);
    const boosted = allProm.filter((x) => x.data.boosted);
    const organic = allProm.filter((x) => !x.data.boosted);
    const promItems = [
      ...shuffleCopy(boosted, `${sessionId}|promB|${city || 'all'}`),
      ...shuffleCopy(organic, `${sessionId}|promO|${city || 'all'}`),
    ];

    const eventItems = shuffleCopy(
      eventRows.map((e) => ({
        kind: 'event',
        data: {
          id: e.id,
          title: e.title,
          date: e.date.toISOString().slice(0, 10),
          city: e.city,
          cover_image_url: e.coverImageUrl,
          is_featured: e.isFeatured,
        },
      })),
      `${sessionId}|evt|${city || 'all'}`,
    );

    const venueItems = shuffleCopy(
      venueRows.map((v) => ({
        kind: 'venue',
        data: {
          id: v.id,
          name: v.name,
          venue_type: v.venueType,
          city: v.city,
          is_verified: v.isVerified,
          logo_url: v.logoUrl,
          cover_image_url: v.coverImageUrl,
          rating: v.rating,
          review_average: 0,
          review_count: 0,
          follower_count: 0,
          followed: followedSet.has(v.id),
        },
      })),
      `${sessionId}|venue|${city || 'all'}`,
    );

    venueItems.sort((a, b) => Number(b.data.followed) - Number(a.data.followed));

    const promQ = [...promItems];
    const evtQ = [...eventItems];
    const venQ = [...venueItems];
    const merged = [];
    /** Boosted-first prom queue + extra promo slots so paid boosts surface more often. */
    const slotPattern = ['prom', 'prom', 'event', 'prom', 'venue', 'event'];
    let slotIdx = 0;
    while (promQ.length || evtQ.length || venQ.length) {
      const slot = slotPattern[slotIdx % slotPattern.length];
      slotIdx += 1;
      if (slot === 'prom' && promQ.length) merged.push(promQ.shift());
      else if (slot === 'event' && evtQ.length) merged.push(evtQ.shift());
      else if (slot === 'venue' && venQ.length) merged.push(venQ.shift());
      else if (promQ.length) merged.push(promQ.shift());
      else if (evtQ.length) merged.push(evtQ.shift());
      else if (venQ.length) merged.push(venQ.shift());
      if (merged.length >= 200) break;
    }

    const slice = merged.slice(cursor, cursor + limit);
    const nextCursor = cursor + slice.length < merged.length ? String(cursor + slice.length) : null;

    res.json({ items: slice, nextCursor, total: merged.length });
  } catch (err) {
    next(err);
  }
});

/** Grouped venue-event and per-host table cards for Home carousel. */
router.get('/table-offerings', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 60);
    const items = await buildTableOfferings({ userId: req.userId || null, limit });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export default router;
