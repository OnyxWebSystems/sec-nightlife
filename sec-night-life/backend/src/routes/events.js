import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { applyEventVenueIsolation, canAccessVenue, isStaff } from '../lib/access.js';
import { ensureGroupChatForEvent } from '../lib/groupChatHelpers.js';
import { logger } from '../lib/logger.js';
import { normalizeHostingConfig, mergeHostingConfigPatch } from '../lib/hostingConfig.js';

const router = Router();

const timeHHMM = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.union([z.string().regex(/^\d{2}:\d{2}$/), z.null()]).optional()
);
const optionalNonEmptyString = (max = 300) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') return v;
    const t = v.trim();
    return t === '' ? undefined : t;
  }, z.string().min(1).max(max).optional());

const tablePricingTierSchema = z.object({
  tier_name: z.string().min(1).max(80).optional(),
  max_guests: z.number().int().min(1).max(500),
  min_spend: z.number().min(0),
  /** Per-tier hosted-table slots; required when tiers exist (enforced in hostingCategorySchema). */
  tier_table_slots: z.number().int().min(1).optional(),
});

const hostingCategorySchema = z
  .object({
    max_tables: z.number().int().min(1).optional().nullable(),
    tiers: z.array(tablePricingTierSchema).optional().nullable(),
    host_table_fee_zar: z.number().min(0).optional().nullable(),
  })
  .superRefine((cat, ctx) => {
    const tiers = cat.tiers;
    if (!tiers || tiers.length === 0) return;
    if (cat.max_tables == null || !Number.isFinite(Number(cat.max_tables))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Max hosted tables is required when pricing tiers are configured.',
        path: ['max_tables'],
      });
      return;
    }
    const maxT = Number(cat.max_tables);
    let sum = 0;
    for (let i = 0; i < tiers.length; i++) {
      const slots = tiers[i]?.tier_table_slots;
      if (slots == null || !Number.isFinite(Number(slots))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Hosted table slots are required for each tier when tiers are configured.',
          path: ['tiers', i, 'tier_table_slots'],
        });
        continue;
      }
      sum += Number(slots);
    }
    if (sum !== maxT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tier table counts must add up to max hosted tables (${maxT}). Current sum: ${sum}.`,
        path: ['tiers'],
      });
    }
  });

const hostingConfigSchema = z.object({
  general: hostingCategorySchema.optional(),
  vip: hostingCategorySchema.optional(),
});

/** Full merged hosting_config (e.g. after PATCH merge). Same rules as hostingCategorySchema superRefine. */
function validateMergedHostingConfigTierSlots(raw) {
  const h = normalizeHostingConfig(raw);
  for (const cat of ['general', 'vip']) {
    const sec = h[cat];
    const tiers = Array.isArray(sec?.tiers) ? sec.tiers : [];
    if (tiers.length === 0) continue;
    if (sec.max_tables == null || !Number.isFinite(Number(sec.max_tables))) {
      return {
        error: `Hosting (${cat}): max hosted tables is required when pricing tiers are configured.`,
      };
    }
    const maxT = Number(sec.max_tables);
    let sum = 0;
    for (let i = 0; i < tiers.length; i++) {
      const slots = tiers[i]?.tier_table_slots;
      if (slots == null || !Number.isFinite(Number(slots))) {
        return {
          error: `Hosting (${cat}): hosted table slots are required for each tier when tiers are configured.`,
        };
      }
      sum += Number(slots);
    }
    if (sum !== maxT) {
      return {
        error: `Hosting (${cat}): tier table counts must add up to max hosted tables (${maxT}). Current sum: ${sum}.`,
      };
    }
  }
  return null;
}

async function assertHostingTierSlotsVsUsage(eventId, mergedHostingRaw) {
  const h = normalizeHostingConfig(mergedHostingRaw);
  for (const cat of ['general', 'vip']) {
    const prismaCat = cat === 'vip' ? 'VIP' : 'GENERAL';
    const tiers = Array.isArray(h[cat]?.tiers) ? h[cat].tiers : [];
    for (let i = 0; i < tiers.length; i++) {
      const newSlots = tiers[i]?.tier_table_slots;
      if (newSlots == null || !Number.isFinite(Number(newSlots))) continue;
      const used = await prisma.hostedTable.count({
        where: {
          eventId,
          hostingCategory: prismaCat,
          hostingTierIndex: i,
          status: { not: 'CLOSED' },
        },
      });
      if (Number(newSlots) < used) {
        const label = tiers[i]?.tier_name != null ? String(tiers[i].tier_name) : `tier ${i + 1}`;
        return {
          error: `Hosting (${cat}): "${label}" cannot go below ${used} hosted tables (already listed).`,
        };
      }
    }
  }
  return null;
}

const eventFields = {
  venue_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  date: z.string(),
  city: optionalNonEmptyString(120),
  location_address: optionalNonEmptyString(500),
  location_city: optionalNonEmptyString(120),
  location_suburb: optionalNonEmptyString(120),
  location_province: optionalNonEmptyString(120),
  status: z.enum(['draft', 'published']).default('draft'),
  is_featured: z.boolean().optional(),
  cover_image_url: z.string().url().optional().nullable(),
  banner_url: z.string().url().optional().nullable(),
  ticket_tiers: z.any().optional(),
  start_time: timeHHMM,
  has_entrance_fee: z.boolean().optional(),
  entrance_fee_amount: z.number().min(0).optional().nullable(),
  hosting_config: hostingConfigSchema.optional(),
};

const eventSchema = z.object(eventFields);

function mapEventRow(e) {
  const resolvedLocationCity = e.locationCity || e.city;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date.toISOString().slice(0, 10),
    city: e.city,
    location_address: e.locationAddress || null,
    location_city: resolvedLocationCity || null,
    location_suburb: e.locationSuburb || null,
    location_province: e.locationProvince || null,
    venue_id: e.venueId,
    status: e.status,
    is_featured: e.isFeatured,
    cover_image_url: e.coverImageUrl,
    ticket_tiers: e.ticketTiers,
    start_time: e.startTime,
    has_entrance_fee: e.hasEntranceFee,
    entrance_fee_amount: e.entranceFeeAmount,
    hosting_config: normalizeHostingConfig(e.hostingConfig),
  };
}

async function followedVenueIdSet(userId) {
  if (!userId) return new Set();
  const rows = await prisma.venueFollow.findMany({
    where: { userId },
    select: { venueId: true },
  });
  return new Set(rows.map((r) => r.venueId));
}

/** When logged in, followed venues first; within each group order by event date. */
function sortEventsByFollowThenDate(events, followedSet, sortDesc) {
  return [...events].sort((a, b) => {
    const ap = followedSet.has(a.venueId) ? 0 : 1;
    const bp = followedSet.has(b.venueId) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const at = a.date.getTime();
    const bt = b.date.getTime();
    return sortDesc ? bt - at : at - bt;
  });
}

function computeCategoryTableStats(rows, maxTables) {
  const hosted = rows.length;
  const tablesRemaining = maxTables != null ? Math.max(0, maxTables - hosted) : null;

  const isFull = (t) => t.status === 'full' || t.currentGuests >= t.maxGuests;
  const hasJoinSpace = (t) => t.isPublic && !isFull(t);

  let tablesFull = 0;
  let tablesFullPublic = 0;
  let tablesFullPrivate = 0;
  let tablesWithJoinSpace = 0;
  for (const t of rows) {
    const full = isFull(t);
    if (full) {
      tablesFull++;
      if (t.isPublic) tablesFullPublic++;
      else tablesFullPrivate++;
    }
    if (hasJoinSpace(t)) tablesWithJoinSpace++;
  }

  return {
    hosted_tables: hosted,
    tables_remaining: tablesRemaining,
    tables_full: tablesFull,
    tables_full_public: tablesFullPublic,
    tables_full_private: tablesFullPrivate,
    tables_with_join_space: tablesWithJoinSpace,
  };
}

function validateHostingTierSlotsConfig(hostingRaw) {
  const hosting = normalizeHostingConfig(hostingRaw);
  for (const cat of ['general', 'vip']) {
    const slot = hosting?.[cat] || {};
    const tiers = Array.isArray(slot.tiers) ? slot.tiers : [];
    if (tiers.length === 0) continue;
    const maxTables = slot.max_tables != null ? Number(slot.max_tables) : null;
    if (!Number.isFinite(maxTables) || maxTables < 1) {
      return {
        ok: false,
        error: `${cat === 'vip' ? 'VIP' : 'General'} max hosted tables is required when tiers are configured.`,
      };
    }
    let sum = 0;
    for (const t of tiers) {
      const slots = t?.tier_table_slots;
      const n = Number(slots);
      if (!Number.isFinite(n) || n < 1) {
        return {
          ok: false,
          error: `${cat === 'vip' ? 'VIP' : 'General'} tiers must each set hosted table slots (minimum 1).`,
        };
      }
      sum += n;
    }
    if (sum !== maxTables) {
      return {
        ok: false,
        error: `${cat === 'vip' ? 'VIP' : 'General'} tier table counts must add up to max hosted tables (${maxTables}). Current sum: ${sum}.`,
      };
    }
  }
  return { ok: true };
}

async function assertTierSlotsNotBelowCurrentHostedTables(eventId, hostingRaw) {
  const hosting = normalizeHostingConfig(hostingRaw);
  for (const cat of ['general', 'vip']) {
    const tiers = Array.isArray(hosting?.[cat]?.tiers) ? hosting[cat].tiers : [];
    if (tiers.length === 0) continue;
    const hostingCategory = cat === 'vip' ? 'VIP' : 'GENERAL';
    for (let idx = 0; idx < tiers.length; idx++) {
      const slots = Number(tiers[idx]?.tier_table_slots);
      if (!Number.isFinite(slots) || slots < 1) continue;
      const used = await prisma.hostedTable.count({
        where: {
          eventId,
          tableType: 'IN_APP_EVENT',
          hostingCategory,
          hostingTierIndex: idx,
          status: { in: ['DRAFT', 'ACTIVE', 'FULL'] },
        },
      });
      if (used > slots) {
        return {
          ok: false,
          error: `${cat === 'vip' ? 'VIP' : 'General'} tier ${idx + 1} has ${used} hosted table(s) already, which exceeds new allocation (${slots}).`,
        };
      }
    }
  }
  return { ok: true };
}

function mapHostedTableToStatRow(ht) {
  const gq = Math.max(1, Number(ht.guestQuantity) || 1);
  const spots = Number(ht.spotsRemaining);
  const spotsRem = Number.isFinite(spots) ? spots : gq;
  const currentGuests = Math.max(0, gq - spotsRem);
  const isFull = ht.status === 'FULL' || spotsRem <= 0;
  const cat = ht.hostingCategory === 'VIP' ? 'vip' : 'general';
  return {
    status: isFull ? 'full' : 'active',
    maxGuests: gq,
    currentGuests,
    isPublic: ht.isPublic,
    tableCategory: cat,
  };
}

async function computeEventStats(eventId, hostingRaw) {
  const hosting = normalizeHostingConfig(hostingRaw);
  const [goingCount, tableRows, hostedSecRows] = await Promise.all([
    prisma.eventAttendance.count({ where: { eventId, confirmed: true } }),
    prisma.table.findMany({
      where: { eventId, deletedAt: null },
      select: {
        status: true,
        maxGuests: true,
        currentGuests: true,
        isPublic: true,
        tableCategory: true,
      },
    }),
    prisma.hostedTable.findMany({
      where: {
        eventId,
        tableType: 'IN_APP_EVENT',
        status: { in: ['ACTIVE', 'FULL'] },
      },
      select: {
        status: true,
        guestQuantity: true,
        spotsRemaining: true,
        isPublic: true,
        hostingCategory: true,
      },
    }),
  ]);

  const hostedMapped = hostedSecRows.map(mapHostedTableToStatRow);
  const legacyGeneral = tableRows.filter((t) => t.tableCategory === 'general');
  const legacyVip = tableRows.filter((t) => t.tableCategory === 'vip');
  const hostedGeneral = hostedMapped.filter((t) => t.tableCategory === 'general');
  const hostedVip = hostedMapped.filter((t) => t.tableCategory === 'vip');

  const generalRows = [...legacyGeneral, ...hostedGeneral];
  const vipRows = [...legacyVip, ...hostedVip];

  const generalStats = computeCategoryTableStats(generalRows, hosting.general.max_tables);
  const vipStats = computeCategoryTableStats(vipRows, hosting.vip.max_tables);

  return {
    going_count: goingCount,
    hosted_tables: tableRows.length + hostedSecRows.length,
    general: generalStats,
    vip: vipStats,
  };
}

function mapEventDetail(event, stats = null) {
  const v = event.venue;
  const resolvedLocationCity = event.locationCity || event.city || v?.city || null;
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date.toISOString().slice(0, 10),
    city: event.city,
    location_address: event.locationAddress || v?.address || null,
    location_city: resolvedLocationCity,
    location_suburb: event.locationSuburb || v?.suburb || null,
    location_province: event.locationProvince || v?.province || null,
    venue_id: event.venueId,
    status: event.status,
    is_featured: event.isFeatured,
    cover_image_url: event.coverImageUrl,
    banner_url: event.bannerUrl,
    ticket_tiers: event.ticketTiers,
    start_time: event.startTime,
    has_entrance_fee: event.hasEntranceFee,
    entrance_fee_amount: event.entranceFeeAmount,
    hosting_config: normalizeHostingConfig(event.hostingConfig),
    venue_name: v?.name ?? null,
    venue_address: v?.address ?? null,
    venue_city: v?.city ?? null,
    venue_suburb: v?.suburb ?? null,
    venue_province: v?.province ?? null,
    ...(stats ? { stats } : {}),
    total_attending: stats?.going_count ?? 0,
  };
}

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.status) where.status = req.query.status;
    if (req.query.venue_id) where.venueId = req.query.venue_id;
    if (req.query.city) where.city = String(req.query.city);
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(req.query.venue_id, req.userId, req.userRole);
      if (!ok && req.query.venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyEventVenueIsolation(where, req.userId, req.userRole, req.query.venue_id || null);
    }
    const take = Math.min(parseInt(req.query.limit) || 50, 100);
    const sortDesc = req.query.sort === '-date';
    const followedSet = await followedVenueIdSet(req.userId);
    const fetchCap = req.userId && followedSet.size > 0 ? Math.min(take * 15, 500) : take;
    const events = await prisma.event.findMany({
      where,
      orderBy: { date: sortDesc ? 'desc' : 'asc' },
      take: fetchCap,
    });
    const ordered =
      req.userId && followedSet.size > 0
        ? sortEventsByFollowThenDate(events, followedSet, sortDesc).slice(0, take)
        : events;
    res.json(ordered.map(mapEventRow));
  } catch (err) {
    next(err);
  }
});

/** Public summary of SEC hosted tables for an event (event details page). */
router.get('/:id/hosted-tables-summary', optionalAuth, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true },
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const rows = await prisma.hostedTable.findMany({
      where: {
        eventId: req.params.id,
        tableType: 'IN_APP_EVENT',
        status: { in: ['ACTIVE', 'FULL'] },
      },
      include: {
        host: {
          select: {
            username: true,
            fullName: true,
            userProfile: { select: { username: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: rows.map((t) => ({
        id: t.id,
        table_name: t.tableName,
        is_public: t.isPublic,
        guest_quantity: t.guestQuantity,
        spots_remaining: t.spotsRemaining,
        status: t.status,
        hosting_category: t.hostingCategory,
        host: {
          username: t.host?.userProfile?.username || t.host?.username,
          full_name: t.host?.fullName,
          avatar_url: t.host?.userProfile?.avatarUrl || null,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/filter', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.id) where.id = req.query.id;
    if (req.query.venue_id) where.venueId = req.query.venue_id;
    if (req.query.status) where.status = req.query.status;
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(req.query.venue_id, req.userId, req.userRole);
      if (!ok && req.query.venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyEventVenueIsolation(where, req.userId, req.userRole, req.query.venue_id || null);
    }
    const sort = String(req.query.sort || 'date');
    const sortDesc = sort === '-date';
    const take = Math.min(parseInt(req.query.limit) || 100, 100);
    const followedSet = await followedVenueIdSet(req.userId);
    const fetchCap = req.userId && followedSet.size > 0 ? Math.min(take * 15, 500) : take;
    const events = await prisma.event.findMany({
      where,
      orderBy: { date: sortDesc ? 'desc' : 'asc' },
      take: fetchCap,
    });
    const ordered =
      req.userId && followedSet.size > 0
        ? sortEventsByFollowThenDate(events, followedSet, sortDesc).slice(0, take)
        : events;
    res.json(ordered.map(mapEventRow));
  } catch (err) {
    next(err);
  }
});

/** One round-trip for Home featured carousel (replaces N × GET /events/:id). */
router.get('/featured-details', optionalAuth, async (req, res, next) => {
  try {
    const raw = String(req.query.ids || '').trim();
    if (!raw) return res.json([]);
    const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 12);
    if (ids.length === 0) return res.json([]);
    const events = await prisma.event.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'published' },
      include: { venue: true },
    });
    const byId = new Map(events.map((e) => [e.id, e]));
    const out = await Promise.all(
      ids.map(async (id) => {
        const event = byId.get(id);
        if (!event) return null;
        const stats = await computeEventStats(event.id, event.hostingConfig);
        return mapEventDetail(event, stats);
      }),
    );
    res.json(out.filter(Boolean));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true },
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status === 'draft' && req.userId) {
      if (event.venue.ownerUserId !== req.userId && !isStaff(req.userRole)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const stats = await computeEventStats(event.id, event.hostingConfig);
    res.json(mapEventDetail(event, stats));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    const hasFee = d.has_entrance_fee ?? false;
    if (hasFee && (d.entrance_fee_amount == null || Number.isNaN(d.entrance_fee_amount))) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    const venue = await prisma.venue.findFirst({ where: { id: d.venue_id, deletedAt: null } });
    if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const resolvedLocationCity = d.location_city || d.city || venue.city;
    if (!resolvedLocationCity) return res.status(400).json({ error: 'Invalid input' });
    const event = await prisma.event.create({
      data: {
        venueId: d.venue_id,
        title: d.title,
        description: d.description,
        date: new Date(d.date),
        city: resolvedLocationCity,
        locationAddress: d.location_address || venue.address || null,
        locationCity: resolvedLocationCity,
        locationSuburb: d.location_suburb || venue.suburb || null,
        locationProvince: d.location_province || venue.province || null,
        status: d.status,
        isFeatured: d.is_featured ?? false,
        coverImageUrl: d.cover_image_url,
        bannerUrl: d.banner_url,
        ticketTiers: d.ticket_tiers,
        startTime: d.start_time ?? null,
        hasEntranceFee: hasFee,
        entranceFeeAmount: hasFee ? d.entrance_fee_amount : null,
        hostingConfig: normalizeHostingConfig(d.hosting_config ?? null),
      },
    });
    ensureGroupChatForEvent(event.id, event.title, req.userId).catch((e) => {
      logger.error('Group chat creation after event failed', { eventId: event.id, message: e?.message });
    });
    res.status(201).json({ id: event.id, title: event.title, venue_id: event.venueId });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true },
    });
    if (!event || (event.venue.ownerUserId !== req.userId && !isStaff(req.userRole))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const parsed = eventSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    const body = req.body || {};
    const hasCityInput = Object.prototype.hasOwnProperty.call(body, 'city');
    const hasLocationAddressInput = Object.prototype.hasOwnProperty.call(body, 'location_address');
    const hasLocationCityInput = Object.prototype.hasOwnProperty.call(body, 'location_city');
    const hasLocationSuburbInput = Object.prototype.hasOwnProperty.call(body, 'location_suburb');
    const hasLocationProvinceInput = Object.prototype.hasOwnProperty.call(body, 'location_province');

    const updates = {};
    if (d.title != null) updates.title = d.title;
    if (d.description != null) updates.description = d.description;
    if (d.date != null) updates.date = new Date(d.date);
    if (hasLocationAddressInput) {
      updates.locationAddress = d.location_address || event.venue.address || null;
    }
    if (hasLocationSuburbInput) {
      updates.locationSuburb = d.location_suburb || event.venue.suburb || null;
    }
    if (hasLocationProvinceInput) {
      updates.locationProvince = d.location_province || event.venue.province || null;
    }
    if (hasCityInput || hasLocationCityInput) {
      const resolvedCity = d.location_city || d.city || event.venue.city;
      if (!resolvedCity) return res.status(400).json({ error: 'Invalid input' });
      updates.city = resolvedCity;
      updates.locationCity = resolvedCity;
    }
    if (d.status != null) updates.status = d.status;
    if (d.cover_image_url !== undefined) updates.coverImageUrl = d.cover_image_url;
    if (d.banner_url !== undefined) updates.bannerUrl = d.banner_url;
    if (d.ticket_tiers != null) updates.ticketTiers = d.ticket_tiers;
    if (d.start_time !== undefined) updates.startTime = d.start_time;
    if (d.has_entrance_fee !== undefined || d.entrance_fee_amount !== undefined) {
      const nextHasFee = d.has_entrance_fee !== undefined ? d.has_entrance_fee : event.hasEntranceFee;
      let nextAmount =
        d.entrance_fee_amount !== undefined ? d.entrance_fee_amount : event.entranceFeeAmount;
      if (d.has_entrance_fee === false) nextAmount = null;
      if (nextHasFee && (nextAmount == null || Number.isNaN(nextAmount))) {
        return res.status(400).json({ error: 'Invalid input' });
      }
      updates.hasEntranceFee = nextHasFee;
      updates.entranceFeeAmount = nextHasFee ? nextAmount : null;
    }
    if (d.hosting_config !== undefined) {
      const mergedHosting = mergeHostingConfigPatch(event.hostingConfig, d.hosting_config);
      const hostCfgCheck = validateHostingTierSlotsConfig(mergedHosting);
      if (!hostCfgCheck.ok) return res.status(400).json({ error: hostCfgCheck.error });
      const tierSlotsCheck = await assertTierSlotsNotBelowCurrentHostedTables(event.id, mergedHosting);
      if (!tierSlotsCheck.ok) return res.status(400).json({ error: tierSlotsCheck.error });
      updates.hostingConfig = mergedHosting;
    }

    const updated = await prisma.event.update({ where: { id: event.id }, data: updates });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true },
    });
    if (!event || (event.venue.ownerUserId !== req.userId && !isStaff(req.userRole))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.event.update({
      where: { id: event.id },
      data: { deletedAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
