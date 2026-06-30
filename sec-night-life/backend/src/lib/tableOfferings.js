import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { buildEventTableTiers } from './eventTableTiers.js';

function isBoostActive(row) {
  if (!row?.boosted) return false;
  if (!row.boostExpiresAt) return true;
  return row.boostExpiresAt instanceof Date
    ? row.boostExpiresAt > new Date()
    : new Date(row.boostExpiresAt) > new Date();
}

async function getFriendIds(userId) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { receiverId: userId }],
    },
    select: { requesterId: true, receiverId: true },
  });
  const ids = new Set();
  for (const r of rows) {
    ids.add(r.requesterId === userId ? r.receiverId : r.requesterId);
  }
  return ids;
}

function formatHost(user) {
  if (!user) return { id: null, username: null, fullName: null, avatarUrl: null };
  const profile = user.userProfile;
  return {
    id: user.id,
    username: profile?.username || user.username || null,
    fullName: user.fullName ?? null,
    avatarUrl: profile?.avatarUrl || null,
    averageRating: profile?.serviceRatingAvg != null ? Number(profile.serviceRatingAvg) : null,
  };
}

/** Whether an event has finished for home/table listings (mirrors frontend eventLifecycle). */
function isEventEndedForListing(event) {
  if (!event) return true;
  if (event.status && event.status !== 'published') return true;
  const endsAtRaw = event.endsAt;
  if (endsAtRaw) {
    const t = endsAtRaw instanceof Date ? endsAtRaw : new Date(endsAtRaw);
    if (!Number.isNaN(t.getTime())) return t.getTime() < Date.now();
  }
  const dateStr = event.date;
  if (dateStr) {
    const d = dateStr instanceof Date
      ? new Date(dateStr)
      : new Date(`${String(dateStr).slice(0, 10)}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) return d.getTime() < Date.now();
  }
  return false;
}

function sortOfferings(list, friendIds, sessionSeed = 'default') {
  const BOOSTED_WEIGHT = 3;
  const ORGANIC_WEIGHT = 1;

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

  const rand = seededRandom(hashString(String(sessionSeed)));
  const prepared = list.map((item) => {
    const aFriend = item.hostUserId && friendIds.has(item.hostUserId);
    const weight = item.boosted ? BOOSTED_WEIGHT : ORGANIC_WEIGHT;
    const u = Math.max(rand(), Number.EPSILON);
    const key = Math.pow(u, 1 / weight) + (aFriend ? 0.001 : 0);
    return { item, key };
  });

  prepared.sort((a, b) => {
    if (a.key !== b.key) return b.key - a.key;
    const ad = a.item.eventDate ? new Date(a.item.eventDate).getTime() : 0;
    const bd = b.item.eventDate ? new Date(b.item.eventDate).getTime() : 0;
    if (ad !== bd) return ad - bd;
    return String(a.item.id).localeCompare(String(b.item.id));
  });

  return prepared.map((x) => x.item);
}

/**
 * Grouped table offerings for Home / Tables browse.
 */
export async function buildTableOfferings({ userId, limit = 40, sessionSeed = 'default' } = {}) {
  const cappedLimit = Math.min(Math.max(limit, 1), 60);
  const rowCap = Math.min(cappedLimit * 8, 240);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let friendIds = new Set();
  if (userId) {
    try {
      friendIds = await getFriendIds(userId);
    } catch (e) {
      logger.warn('getFriendIds failed in buildTableOfferings', { err: e?.message });
    }
  }

  const venueWhere = {
    isActive: true,
    status: { in: ['AVAILABLE', 'PARTIALLY_FILLED'] },
  };
  const venueRows = await prisma.venueTable.findMany({
    where: venueWhere,
    take: rowCap,
    orderBy: { updatedAt: 'desc' },
    include: {
      venue: { select: { id: true, name: true, city: true, coverImageUrl: true } },
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          startTime: true,
          endsAt: true,
          city: true,
          coverImageUrl: true,
          status: true,
        },
      },
    },
  });
  const openVenueRows = venueRows.filter((t) => t.currentOccupancy < t.guestCapacity);

  const hostedWhere = {
    status: 'ACTIVE',
    spotsRemaining: { gt: 0 },
    eventDate: { gte: today },
  };

  const hostedRows = await prisma.hostedTable.findMany({
    where: hostedWhere,
    take: rowCap,
    orderBy: { eventDate: 'asc' },
    include: {
      host: {
        select: {
          id: true,
          username: true,
          fullName: true,
          userProfile: { select: { username: true, avatarUrl: true, serviceRatingAvg: true } },
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          startTime: true,
          city: true,
          coverImageUrl: true,
        },
      },
    },
  });

  const offerings = [];
  const venueEventMap = new Map();
  const venueDayMap = new Map();
  const hostedHostMap = new Map();
  const hostedSoloMap = new Map();

  for (const t of openVenueRows) {
    if (t.isCustomListing && !t.allowsCustomRequests) continue;
    const spots = Math.max(0, t.guestCapacity - t.currentOccupancy);
    const tierLabel = t.tierLabel || t.tableName;
    const isVip =
      t.tableCategory === 'vip' || /vip/i.test(String(tierLabel || t.tableName || ''));
    const tier = {
      tableId: t.id,
      label: tierLabel,
      tableName: t.tableName,
      minSpend: t.minimumSpend,
      bookingFeeZar: t.bookingFeeZar,
      spotsRemaining: spots,
      isCustomListing: t.isCustomListing,
      allowsCustomRequests: t.allowsCustomRequests,
      tableCategory: t.tableCategory,
      isVip,
    };

    if (t.eventId && t.event) {
      if (isEventEndedForListing(t.event)) continue;
      const key = t.eventId;
      if (!venueEventMap.has(key)) {
        venueEventMap.set(key, {
          type: 'venue_event',
          id: `venue-event-${key}`,
          eventId: key,
          venueId: t.venueId,
          title: t.event.title,
          subtitle: t.venue?.name || 'Venue',
          imageUrl: t.event.coverImageUrl || t.venue?.coverImageUrl || null,
          city: t.event.city || t.venue?.city || null,
          eventDate: t.event.date,
          eventEndsAt: t.event.endsAt,
          startTime: t.event.startTime,
          tiers: [],
          totalSpots: 0,
          minBookingFeeZar: null,
          boosted: false,
          hostUserId: null,
          tableCount: 0,
        });
      }
      const g = venueEventMap.get(key);
      g.tiers.push(tier);
      if (!t.isCustomListing) {
        g.totalSpots += spots;
      }
      g.tableCount += 1;
      if (isVip) g.hasVip = true;
      const bf = Number(t.bookingFeeZar || 0);
      if (bf > 0 && (g.minBookingFeeZar == null || bf < g.minBookingFeeZar)) {
        g.minBookingFeeZar = bf;
      }
    } else {
      const key = t.venueId;
      if (!venueDayMap.has(key)) {
        venueDayMap.set(key, {
          type: 'venue_day',
          id: `venue-day-${key}`,
          eventId: null,
          venueId: key,
          title: t.venue?.name || 'Venue',
          subtitle: 'Book on SEC',
          imageUrl: t.venue?.coverImageUrl || null,
          city: t.venue?.city || null,
          eventDate: t.serviceDate,
          startTime: t.startTime,
          tiers: [],
          totalSpots: 0,
          minBookingFeeZar: null,
          boosted: false,
          hostUserId: null,
          tableCount: 0,
        });
      }
      const g = venueDayMap.get(key);
      g.tiers.push(tier);
      if (!t.isCustomListing) {
        g.totalSpots += spots;
      }
      g.tableCount += 1;
      if (isVip) g.hasVip = true;
      const bf = Number(t.bookingFeeZar || 0);
      if (bf > 0 && (g.minBookingFeeZar == null || bf < g.minBookingFeeZar)) {
        g.minBookingFeeZar = bf;
      }
    }
  }

  for (const g of venueEventMap.values()) offerings.push(g);
  for (const g of venueDayMap.values()) offerings.push(g);

  const venueEventIds = [...venueEventMap.keys()];
  if (venueEventIds.length > 0) {
    const tierResults = await Promise.all(
      venueEventIds.map(async (eventId) => {
        try {
          const payload = await buildEventTableTiers(eventId);
          const tiers = payload?.tiers || [];
          const totalSpots = tiers.reduce((sum, t) => sum + (Number(t.totalSpotsRemaining) || 0), 0);
          return { eventId, totalSpots };
        } catch (e) {
          logger.warn('buildEventTableTiers failed in buildTableOfferings', { eventId, err: e?.message });
          return { eventId, totalSpots: null };
        }
      }),
    );
    for (const { eventId, totalSpots } of tierResults) {
      if (totalSpots == null) continue;
      const g = venueEventMap.get(eventId);
      if (g) g.totalSpots = totalSpots;
    }
  }

  for (const t of hostedRows) {
    const spots = t.spotsRemaining;
    const isVipHosted = t.hostingCategory === 'VIP';
    const tableSummary = {
      id: t.id,
      tableName: t.tableName,
      spotsRemaining: spots,
      guestQuantity: t.guestQuantity,
      hasJoiningFee: t.hasJoiningFee,
      joiningFee: t.joiningFee,
      isPublic: t.isPublic,
      hostingCategory: t.hostingCategory,
      isVip: isVipHosted,
      photo: t.photo,
    };
    const boosted = isBoostActive(t);
    const host = formatHost(t.host);

    if (t.eventId && t.event) {
      const key = `${t.eventId}:${t.hostUserId}`;
      if (!hostedHostMap.has(key)) {
        hostedHostMap.set(key, {
          type: 'hosted_host',
          id: `hosted-host-${t.eventId}-${t.hostUserId}`,
          eventId: t.eventId,
          hostUserId: t.hostUserId,
          venueId: null,
          title: host.username ? `@${host.username}` : host.fullName || 'Host',
          subtitle: t.event.title,
          imageUrl: t.photo || t.event.coverImageUrl || null,
          city: t.event.city || null,
          eventDate: t.eventDate,
          startTime: t.eventTime,
          host,
          tables: [],
          totalSpots: 0,
          minJoinFeeZar: null,
          maxJoinFeeZar: null,
          boosted: false,
          tableCount: 0,
        });
      }
      const g = hostedHostMap.get(key);
      g.tables.push(tableSummary);
      g.totalSpots += spots;
      g.tableCount += 1;
      if (isVipHosted) g.hasVip = true;
      if (boosted) {
        g.boosted = true;
        if (t.photo) g.imageUrl = t.photo;
      }
      const jf = t.hasJoiningFee ? Number(t.joiningFee || 0) : 0;
      if (t.hasJoiningFee && jf > 0) {
        if (g.minJoinFeeZar == null || jf < g.minJoinFeeZar) g.minJoinFeeZar = jf;
        if (g.maxJoinFeeZar == null || jf > g.maxJoinFeeZar) g.maxJoinFeeZar = jf;
      }
    } else {
      const key = t.hostUserId;
      if (!hostedSoloMap.has(key)) {
        hostedSoloMap.set(key, {
          type: 'hosted_external',
          id: `hosted-ext-${t.hostUserId}-${t.id}`,
          eventId: null,
          hostUserId: t.hostUserId,
          venueId: null,
          title: host.username ? `@${host.username}` : host.fullName || 'Host',
          subtitle: t.venueName || 'External meet-up',
          imageUrl: t.photo || null,
          city: null,
          eventDate: t.eventDate,
          startTime: t.eventTime,
          host,
          tables: [tableSummary],
          totalSpots: spots,
          minJoinFeeZar: t.hasJoiningFee ? Number(t.joiningFee || 0) : null,
          maxJoinFeeZar: t.hasJoiningFee ? Number(t.joiningFee || 0) : null,
          boosted,
          tableCount: 1,
        });
      } else {
        const g = hostedSoloMap.get(key);
        g.tables.push(tableSummary);
        g.totalSpots += spots;
        g.tableCount += 1;
        if (isVipHosted) g.hasVip = true;
        if (boosted) {
          g.boosted = true;
          if (t.photo) g.imageUrl = t.photo;
        }
      }
    }
  }

  for (const g of hostedHostMap.values()) offerings.push(g);
  for (const g of hostedSoloMap.values()) offerings.push(g);

  const sorted = sortOfferings(offerings, friendIds, sessionSeed);
  return sorted.slice(0, cappedLimit);
}
