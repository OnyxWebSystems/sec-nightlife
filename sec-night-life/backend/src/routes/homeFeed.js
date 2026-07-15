import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { buildTableOfferings, buildCommunityHostedEvents } from '../lib/tableOfferings.js';
import { parseGeoQuery, distanceKm } from '../lib/geo.js';
import { isBoostActiveRow } from '../lib/feedBoost.js';
import { externalListingEndsAt } from '../lib/externalListingSchedule.js';

import { buildHomeBootstrap } from '../lib/homeBootstrap.js';
import { cacheGetJson, cacheSetJson } from '../lib/redis.js';

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
    const geo = parseGeoQuery(req.query);
    const overrideCity = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const sessionId =
      (typeof req.headers['x-session-id'] === 'string' && req.headers['x-session-id'].trim()) ||
      (typeof req.query.sessionId === 'string' && req.query.sessionId.trim()) ||
      'anon-session';

    const cacheKey =
      !req.userId && !geo
        ? `home:feed:v2:${scopeAll ? 'all' : overrideCity || 'none'}:${cursor}:${limit}:${sessionId.slice(0, 24)}`
        : null;
    if (cacheKey) {
      const cached = await cacheGetJson(cacheKey);
      if (cached) return res.json(cached);
    }

    let city = '';
    if (scopeAll && !geo) {
      city = '';
    } else if (!geo) {
      city = overrideCity;
      if (!city && req.userId) {
        const profile = await prisma.userProfile.findUnique({
          where: { userId: req.userId },
          select: { city: true },
        });
        city = (profile?.city || '').trim();
      }
    }

    const inGeoRange = (lat, lng) => {
      if (!geo) return true;
      if (lat == null || lng == null) return false;
      return distanceKm(geo.lat, geo.lng, lat, lng) <= geo.radiusKm;
    };

    const now = new Date();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [promotionRows, eventRows, venueRows, followedRows, communityRows] = await Promise.all([
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
          venue: { select: { id: true, name: true, city: true, venueType: true, latitude: true, longitude: true } },
          event: { select: { id: true, title: true, date: true, endsAt: true } },
        },
      }),
      prisma.event.findMany({
        where: { deletedAt: null, status: 'published', endsAt: { gte: now } },
        orderBy: [{ boosted: 'desc' }, { date: 'asc' }],
        take: 80,
        include: { venue: { select: { latitude: true, longitude: true } } },
      }),
      prisma.venue.findMany({
        where: { deletedAt: null, ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}) },
        orderBy: { rating: 'desc' },
        take: 80,
      }),
      req.userId
        ? prisma.venueFollow.findMany({ where: { userId: req.userId }, select: { venueId: true } })
        : Promise.resolve([]),
      prisma.hostedTable.findMany({
        where: {
          status: 'ACTIVE',
          spotsRemaining: { gt: 0 },
          tableType: 'EXTERNAL_VENUE',
          listingSurface: 'EVENT',
          venueTableId: null,
          boosted: true,
          OR: [
            { windowEndsAt: { gt: now } },
            { windowEndsAt: null, eventDate: { gte: today } },
          ],
        },
        take: 40,
        orderBy: [{ boostExpiresAt: 'desc' }, { eventDate: 'asc' }],
        select: {
          id: true,
          tableName: true,
          eventDate: true,
          eventTime: true,
          eventEndDate: true,
          eventEndTime: true,
          windowEndsAt: true,
          venueName: true,
          venueAddress: true,
          photo: true,
          boosted: true,
          boostExpiresAt: true,
          spotsRemaining: true,
          hasJoiningFee: true,
          joiningFee: true,
        },
      }),
    ]);

    const followedSet = new Set(followedRows.map((r) => r.venueId));

    const filteredPromotions = geo
      ? promotionRows.filter((p) => inGeoRange(p.venue?.latitude, p.venue?.longitude))
      : promotionRows;
    const filteredEvents = geo
      ? eventRows.filter((e) => inGeoRange(e.venue?.latitude, e.venue?.longitude))
      : eventRows;
    const filteredVenues = geo
      ? venueRows.filter((v) => inGeoRange(v.latitude, v.longitude))
      : venueRows;

    const geoVenueCount = filteredVenues.length;
    const useGeoScope = Boolean(geo && geoVenueCount > 3);
    const feedPromotions = useGeoScope ? filteredPromotions : promotionRows;
    const feedEvents = useGeoScope ? filteredEvents : eventRows;
    const feedVenues = useGeoScope ? filteredVenues : venueRows;
    const scopeSeed = useGeoScope ? 'geo' : city || 'all';

    const venueIds = feedVenues.map((v) => v.id);
    const [reviewGroups, followerGroups] = venueIds.length
      ? await Promise.all([
          prisma.venueReview.groupBy({
            by: ['venueId'],
            where: { venueId: { in: venueIds } },
            _avg: { rating: true },
            _count: { _all: true },
          }),
          prisma.venueFollow.groupBy({
            by: ['venueId'],
            where: { venueId: { in: venueIds } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const reviewByVenue = new Map(
      reviewGroups.map((r) => [
        r.venueId,
        {
          average: Number(r._avg.rating || 0),
          count: r._count._all || 0,
        },
      ]),
    );
    const followersByVenue = new Map(
      followerGroups.map((r) => [r.venueId, r._count._all || 0]),
    );

    const allProm = feedPromotions.map(promotionItemFromRow);
    const boosted = allProm.filter((x) => x.data.boosted);
    const organic = allProm.filter((x) => !x.data.boosted);
    const promItems = [
      ...shuffleCopy(boosted, `${sessionId}|promB|${scopeSeed}`),
      ...shuffleCopy(organic, `${sessionId}|promO|${scopeSeed}`),
    ];

    const allEvents = feedEvents.map((e) => {
      const boostActive =
        Boolean(e.boosted) && (!e.boostExpiresAt || new Date(e.boostExpiresAt) > now);
      return {
        kind: 'event',
        data: {
          id: e.id,
          title: e.title,
          date: e.date.toISOString().slice(0, 10),
          city: e.city,
          cover_image_url: e.coverImageUrl,
          is_featured: e.isFeatured || boostActive,
          boosted: boostActive,
        },
      };
    });
    const boostedEvents = allEvents.filter((x) => x.data.boosted);
    const organicEvents = allEvents.filter((x) => !x.data.boosted);
    const eventItems = [
      ...shuffleCopy(boostedEvents, `${sessionId}|evtB|${scopeSeed}`),
      ...shuffleCopy(organicEvents, `${sessionId}|evtO|${scopeSeed}`),
    ];

    const venueItems = shuffleCopy(
      feedVenues.map((v) => ({
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
          review_average: Number(reviewByVenue.get(v.id)?.average || v.rating || 0),
          review_count: Number(reviewByVenue.get(v.id)?.count || 0),
          follower_count: Number(followersByVenue.get(v.id) || 0),
          followed: followedSet.has(v.id),
        },
      })),
      `${sessionId}|venue|${scopeSeed}`,
    );

    venueItems.sort((a, b) => Number(b.data.followed) - Number(a.data.followed));

    const communityItems = communityRows
      .filter((t) => isBoostActiveRow(t, now))
      .filter((t) => {
        const end = externalListingEndsAt(t);
        return !end || end.getTime() > now.getTime();
      })
      .map((t) => {
        const addressBits = String(t.venueAddress || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const cityGuess =
          addressBits.length >= 2 ? addressBits[addressBits.length - 2] : addressBits[0] || t.venueName;
        return {
          kind: 'community_event',
          data: {
            id: t.id,
            hostedTableId: t.id,
            title: t.tableName,
            date: t.eventDate?.toISOString?.()?.slice(0, 10) || t.eventDate,
            city: cityGuess,
            cover_image_url: t.photo,
            boosted: true,
            spotsRemaining: t.spotsRemaining,
            hasJoiningFee: t.hasJoiningFee,
            joiningFee: t.joiningFee,
          },
        };
      });
    const communityQ = shuffleCopy(communityItems, `${sessionId}|cEvt|${scopeSeed}`);

    const promQ = [...promItems];
    const evtQ = [...eventItems];
    const venQ = [...venueItems];
    const merged = [];
    /** Boosted-first prom queue + community (boosted own-venue) events in Discover. */
    const slotPattern = ['prom', 'community', 'event', 'prom', 'venue', 'event', 'community'];
    let slotIdx = 0;
    while (promQ.length || evtQ.length || venQ.length || communityQ.length) {
      const slot = slotPattern[slotIdx % slotPattern.length];
      slotIdx += 1;
      if (slot === 'prom' && promQ.length) merged.push(promQ.shift());
      else if (slot === 'community' && communityQ.length) merged.push(communityQ.shift());
      else if (slot === 'event' && evtQ.length) merged.push(evtQ.shift());
      else if (slot === 'venue' && venQ.length) merged.push(venQ.shift());
      else if (promQ.length) merged.push(promQ.shift());
      else if (communityQ.length) merged.push(communityQ.shift());
      else if (evtQ.length) merged.push(evtQ.shift());
      else if (venQ.length) merged.push(venQ.shift());
      if (merged.length >= 200) break;
    }

    const slice = merged.slice(cursor, cursor + limit);
    const nextCursor = cursor + slice.length < merged.length ? String(cursor + slice.length) : null;

    const payload = {
      items: slice,
      nextCursor,
      total: merged.length,
      feedScope: useGeoScope ? 'local' : geo ? 'nationwide' : city ? 'city' : 'nationwide',
    };
    if (cacheKey) {
      await cacheSetJson(cacheKey, payload, 25);
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/** Grouped venue-event and per-host table cards for Home carousel. */
router.get('/table-offerings', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 60);
    const sessionSeed =
      req.headers['x-session-id'] || req.query.sessionId || req.query.session_id || 'anon-session';
    const items = await buildTableOfferings({
      userId: req.userId || null,
      limit,
      sessionSeed: `${sessionSeed}|${new Date().toISOString().slice(0, 10)}|tables`,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** Paid “Your own venue” listings marked as Events — Home / Events browse. */
router.get('/community-hosted-events', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 30);
    const items = await buildCommunityHostedEvents({ limit });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.get('/followed-promoters', authenticateToken, async (req, res, next) => {
  try {
    const follows = await prisma.promoterFollow.findMany({
      where: { userId: req.userId },
      select: { promoterId: true },
    });
    const promoterIds = follows.map((f) => f.promoterId);
    if (!promoterIds.length) return res.json({ items: [] });

    const now = new Date();
    const assignments = await prisma.eventPromoterAssignment.findMany({
      where: {
        promoterUserId: { in: promoterIds },
        status: 'ACTIVE',
        event: {
          deletedAt: null,
          status: 'published',
          OR: [{ endsAt: { gt: now } }, { endsAt: null, date: { gte: now } }],
        },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            endsAt: true,
            coverImageUrl: true,
            city: true,
            eventFormat: true,
            venue: { select: { name: true } },
          },
        },
        promoter: {
          select: {
            id: true,
            username: true,
            userProfile: { select: { username: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
      take: 20,
    });

    res.json({
      items: assignments.map((a) => ({
        kind: 'followed_promoter_event',
        promoterId: a.promoterUserId,
        promoterUsername: a.promoter.userProfile?.username || a.promoter.username,
        promoterAvatarUrl: a.promoter.userProfile?.avatarUrl || null,
        event: {
          id: a.event.id,
          title: a.event.title,
          date: a.event.date,
          endsAt: a.event.endsAt,
          coverImageUrl: a.event.coverImageUrl,
          city: a.event.city,
          eventFormat: a.event.eventFormat,
          venueName: a.event.venue?.name,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Active platform announcements for every user's home feed */
router.get('/announcements', optionalAuth, async (req, res, next) => {
  try {
    const rows = await prisma.platformAnnouncement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        message: true,
        ctaUrl: true,
        ctaLabel: true,
        createdAt: true,
      },
    });
    res.json({
      announcements: rows.map((r) => ({
        id: r.id,
        title: r.title,
        message: r.message,
        ctaUrl: r.ctaUrl,
        ctaLabel: r.ctaLabel,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Single round-trip payload for authenticated Home (announcements, tables, promos, followed promoters). */
router.get('/bootstrap', optionalAuth, async (req, res, next) => {
  try {
    const payload = await buildHomeBootstrap(req);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
