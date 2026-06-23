import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';
import { parseGeoQuery, distanceKm } from '../lib/geo.js';

const router = Router();

function inGeoRange(geo, lat, lng) {
  if (!geo) return true;
  if (lat == null || lng == null) return false;
  return distanceKm(geo.lat, geo.lng, lat, lng) <= geo.radiusKm;
}

function mapVenueRow(v) {
  return {
    id: v.id,
    name: v.name,
    city: v.city,
    suburb: v.suburb,
    venue_type: v.venueType,
    address: v.address,
    latitude: v.latitude,
    longitude: v.longitude,
    is_verified: v.isVerified,
    rating: v.rating,
    cover_image_url: v.coverImageUrl,
    logo_url: v.logoUrl,
  };
}

function mapEventRow(e) {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    ends_at: e.endsAt,
    city: e.city,
    status: e.status,
    venue_id: e.venueId,
    cover_image_url: e.coverImageUrl,
    is_featured: e.isFeatured,
  };
}

function mapTableRow(t) {
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    event_id: t.eventId,
    venue_id: t.venueId,
    host_user_id: t.hostUserId,
    members: t.members,
  };
}

/** Geo-filtered map pins for venues, events, and open tables. */
router.get('/pins', optionalAuth, async (req, res, next) => {
  try {
    const geo = parseGeoQuery(req.query);
    const scopeAll = req.query.scope === 'all' || !geo;
    const now = new Date();
    const cap = 200;

    const [venueRows, eventRows, tableRows] = await Promise.all([
      prisma.venue.findMany({
        where: {
          deletedAt: null,
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: { rating: 'desc' },
        take: cap,
      }),
      prisma.event.findMany({
        where: { deletedAt: null, status: 'published', endsAt: { gte: now } },
        orderBy: { date: 'asc' },
        take: cap,
        include: {
          venue: { select: { id: true, latitude: true, longitude: true, city: true, name: true } },
        },
      }),
      prisma.table.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ['closed', 'cancelled'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          venue: { select: { latitude: true, longitude: true } },
        },
      }),
    ]);

    let venues = venueRows;
    let events = eventRows;
    let tables = tableRows;

    if (!scopeAll && geo) {
      venues = venues.filter((v) => inGeoRange(geo, v.latitude, v.longitude));
      events = events.filter((e) => {
        const lat = e.venue?.latitude;
        const lng = e.venue?.longitude;
        return inGeoRange(geo, lat, lng);
      });
      tables = tables.filter((t) => {
        const lat = t.venue?.latitude;
        const lng = t.venue?.longitude;
        return inGeoRange(geo, lat, lng);
      });
    }

    res.json({
      scope: scopeAll ? 'all' : 'nearby',
      venues: venues.map(mapVenueRow),
      events: events.map(mapEventRow),
      tables: tables.map(mapTableRow),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
