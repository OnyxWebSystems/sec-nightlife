/**
 * Host dashboard API — house parties, hosted tables, house-party jobs.
 * All authenticated users with role USER (and staff where noted) may host.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { logFriendActivity } from '../lib/friendActivity.js';
import { logger } from '../lib/logger.js';
import { signCloudinaryUrl, privateDownloadUrl } from '../lib/cloudinarySignedUrl.js';

const router = Router();

const postingSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  requirements: z.string().trim().min(1),
  jobType: z.enum(['FULL_TIME', 'PART_TIME', 'ONCE_OFF', 'CONTRACT']),
  compensationType: z.enum(['FIXED', 'NEGOTIABLE', 'UNPAID_TRIAL']),
  compensationAmount: z.number().nonnegative().optional().nullable(),
  compensationPer: z.enum(['HOUR', 'MONTH', 'COMMISSION', 'ONCE_OFF']).optional().nullable(),
  currency: z.string().trim().min(1).default('ZAR'),
  totalSpots: z.number().int().min(1).default(1),
  closingDate: z.coerce.date().optional().nullable(),
});

const applicationSchema = z.object({
  coverMessage: z.string().trim().min(50).max(1000),
  cvUrl: z.string().url().optional().nullable(),
  cvFileName: z.string().max(255).optional().nullable(),
  portfolioUrl: z.string().url().optional().nullable(),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

function assertHostEligibleRole(req, res) {
  if (['SUPER_ADMIN', 'USER', 'VENUE'].includes(req.userRole)) {
    return true;
  }
  res.status(403).json({ error: 'Only party goer, business owner, and super admin accounts can host parties or tables.' });
  return false;
}

function requirePaystackKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    const err = new Error('Paystack is not configured');
    err.status = 500;
    throw err;
  }
  return key;
}

async function initializePaystackPayment({ userId, amountZar, metadata }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const email = user?.email || 'user@secnightlife.app';
  const reference = crypto.randomBytes(16).toString('hex');
  const amountInCents = Math.round(amountZar * 100);
  await prisma.payment.create({
    data: {
      userId,
      email,
      amount: amountZar,
      reference,
      status: 'pending',
      type: 'other',
      metadata: { user_id: userId, ...metadata },
    },
  });
  await prisma.transaction.create({
    data: {
      userId,
      amount: amountZar,
      currency: 'ZAR',
      type: 'paystack',
      status: 'pending',
      stripeId: reference,
      metadata: { provider: 'paystack', reference, ...metadata },
    },
  });
  const key = requirePaystackKey();
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount: amountInCents,
      reference,
      metadata: { user_id: userId, ...metadata },
      callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    const err = new Error(data?.message || 'Paystack request failed');
    err.status = res.status;
    throw err;
  }
  return { reference, authorization_url: data.data.authorization_url, access_code: data.data.access_code };
}

const publicHostSelect = {
  id: true,
  username: true,
  fullName: true,
  userProfile: { select: { username: true, avatarUrl: true, serviceRatingAvg: true, serviceRatingCount: true } },
};

async function formatPublicHost(user) {
  if (!user || typeof user !== 'object') {
    return { username: null, fullName: null, avatarUrl: null, averageRating: null };
  }
  const profile = user.userProfile;
  const username = profile?.username || user.username;
  const avatarUrl = profile?.avatarUrl || null;
  return {
    username,
    fullName: user.fullName ?? null,
    avatarUrl,
    averageRating: profile?.serviceRatingAvg != null ? Number(profile.serviceRatingAvg) : null,
  };
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

async function areFriends(a, b) {
  const f = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: a, receiverId: b },
        { requesterId: b, receiverId: a },
      ],
    },
  });
  return !!f;
}

function parseTimeToMinutes(value) {
  if (value == null || typeof value !== 'string') return null;
  const t = value.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatVenueAddressFromVenue(venue) {
  if (!venue) return null;
  const parts = [venue.address, venue.suburb, venue.city].filter(Boolean);
  return parts.length ? parts.join(', ') : venue.city || null;
}

function assertTableTimeNotBeforeEventStart(eventTimeStr, eventStartTimeStr) {
  if (!eventStartTimeStr) return { ok: true };
  const tableM = parseTimeToMinutes(eventTimeStr);
  const eventM = parseTimeToMinutes(eventStartTimeStr);
  if (tableM == null || eventM == null) {
    return { ok: false, error: 'Invalid time format. Use HH:mm (e.g. 18:00).' };
  }
  if (tableM < eventM) {
    return { ok: false, error: 'Table time cannot be before the event start time.' };
  }
  return { ok: true };
}

async function addUserToHostedTableGroupChat(hostedTableId, userId) {
  const gc = await prisma.hostedTableGroupChat.findUnique({
    where: { hostedTableId },
    select: { id: true },
  });
  if (!gc) return;
  await prisma.hostedTableGroupChatMember.upsert({
    where: {
      hostedTableGroupChatId_userId: { hostedTableGroupChatId: gc.id, userId },
    },
    create: { hostedTableGroupChatId: gc.id, userId },
    update: {},
  });
}

function buildEventLocationPayload(event) {
  if (!event?.venue) return null;
  const v = event.venue;
  const displayLabel = formatVenueAddressFromVenue(v) || event.city || v.name;
  return {
    venueName: v.name,
    address: v.address,
    suburb: v.suburb,
    city: v.city,
    latitude: v.latitude,
    longitude: v.longitude,
    displayLabel,
    eventStartTime: event.startTime,
  };
}

// ——— House parties: public (optional auth) ——————————————————————
router.get('/parties/public', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(10, parseInt(req.query.limit) || 10);
    const city = req.query.city ? String(req.query.city).trim() : '';
    const now = new Date();
    const where = {
      status: 'PUBLISHED',
      startTime: { gt: now },
      spotsRemaining: { gt: 0 },
    };
    if (city) {
      where.location = { contains: city, mode: 'insensitive' };
    }
    const rows = await prisma.houseParty.findMany({
      where,
      include: { host: { select: publicHostSelect } },
    });
    let friendIds = new Set();
    if (req.userId) friendIds = await getFriendIds(req.userId);
    const scored = rows.map((p) => ({
      p,
      friend: friendIds.has(p.hostUserId),
    }));
    scored.sort((a, b) => {
      if (a.p.boosted !== b.p.boosted) return a.p.boosted ? -1 : 1;
      if (a.friend !== b.friend) return a.friend ? -1 : 1;
      return a.p.startTime.getTime() - b.p.startTime.getTime();
    });
    const slice = scored.slice((page - 1) * limit, page * limit);
    const out = await Promise.all(
      slice.map(async ({ p }) => {
        const host = await formatPublicHost(p.host);
        return {
          id: p.id,
          title: p.title,
          description: p.description,
          location: p.location,
          startTime: p.startTime,
          endTime: p.endTime,
          hasEntranceFee: p.hasEntranceFee,
          entranceFeeAmount: p.entranceFeeAmount,
          entranceFeeNote: p.entranceFeeNote,
          freeEntryGroup: p.freeEntryGroup,
          guestQuantity: p.guestQuantity,
          spotsRemaining: p.spotsRemaining,
          boosted: p.boosted,
          coverImageUrl: p.coverImageUrl,
          host,
        };
      }),
    );
    res.json({ items: out, page, limit, total: scored.length });
  } catch (e) {
    next(e);
  }
});

/** Public-ish detail for TableDetails when id is a HostedTable (not legacy `tables`). */
router.get('/hosted-tables/:tableId', optionalAuth, async (req, res, next) => {
  try {
    const t = await prisma.hostedTable.findFirst({
      where: { id: req.params.tableId },
      include: {
        host: { select: publicHostSelect },
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            startTime: true,
            city: true,
            venue: {
              select: {
                name: true,
                address: true,
                suburb: true,
                city: true,
                province: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });
    if (!t) return res.status(404).json({ error: 'Not found' });
    const isVisible = t.status === 'ACTIVE' && t.isPublic;
    if (!isVisible) {
      const uid = req.userId;
      const allowed =
        uid &&
        (t.hostUserId === uid ||
          (await prisma.hostedTableMember.findFirst({
            where: { hostedTableId: t.id, userId: uid },
          })));
      if (!allowed) return res.status(404).json({ error: 'Not found' });
    }
    const eventLocation =
      t.tableType === 'IN_APP_EVENT' && t.event ? buildEventLocationPayload(t.event) : null;
    const resolvedAddress =
      eventLocation?.displayLabel ||
      [t.venueAddress, t.venueName].filter(Boolean).join(', ') ||
      t.venueName;
    res.json({
      kind: 'hosted',
      id: t.id,
      tableName: t.tableName,
      tableDescription: t.tableDescription,
      status: t.status,
      venueName: t.venueName,
      venueAddress: t.venueAddress,
      resolvedAddress,
      eventDate: t.eventDate,
      eventTime: t.eventTime,
      eventId: t.eventId,
      eventLocation,
      event: t.event
        ? {
            id: t.event.id,
            title: t.event.title,
            date: t.event.date,
            start_time: t.event.startTime,
            city: t.event.city,
          }
        : null,
      host: await formatPublicHost(t.host),
      spotsRemaining: t.spotsRemaining,
      guestQuantity: t.guestQuantity,
      hasJoiningFee: t.hasJoiningFee,
      joiningFee: t.joiningFee,
    });
  } catch (e) {
    next(e);
  }
});

// ——— Hosted tables: public available ————————————————————————————
router.get('/tables/available', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(10, parseInt(req.query.limit) || 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const where = {
      status: 'ACTIVE',
      isPublic: true,
      spotsRemaining: { gt: 0 },
      eventDate: { gte: today },
    };
    const rows = await prisma.hostedTable.findMany({
      where,
      include: {
        host: { select: publicHostSelect },
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            startTime: true,
            city: true,
            venue: {
              select: {
                name: true,
                address: true,
                suburb: true,
                city: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });
    let friendIds = new Set();
    if (req.userId) {
      try {
        friendIds = await getFriendIds(req.userId);
      } catch (e) {
        logger.warn('getFriendIds failed in /tables/available', { err: e?.message });
      }
    }
    const scored = rows.map((t) => ({ t, friend: friendIds.has(t.hostUserId) }));
    scored.sort((a, b) => {
      if (a.t.boosted !== b.t.boosted) return a.t.boosted ? -1 : 1;
      if (a.friend !== b.friend) return a.friend ? -1 : 1;
      const ad = a.t.eventDate instanceof Date ? a.t.eventDate.getTime() : 0;
      const bd = b.t.eventDate instanceof Date ? b.t.eventDate.getTime() : 0;
      return ad - bd;
    });
    const slice = scored.slice((page - 1) * limit, page * limit);
    const out = await Promise.all(
      slice.map(async ({ t }) => ({
        id: t.id,
        tableName: t.tableName,
        tableDescription: t.tableDescription,
        tableType: t.tableType,
        eventType: t.eventType,
        hasJoiningFee: t.hasJoiningFee,
        joiningFee: t.joiningFee,
        photo: t.photo,
        venueName: t.venueName,
        venueAddress: t.venueAddress,
        displayLocation:
          t.tableType === 'IN_APP_EVENT'
            ? buildEventLocationPayload(t.event)?.displayLabel || t.venueAddress || t.venueName
            : t.venueAddress || t.venueName,
        eventLocation: t.tableType === 'IN_APP_EVENT' ? buildEventLocationPayload(t.event) : null,
        eventDate: t.eventDate,
        eventTime: t.eventTime,
        drinkPreferences: t.drinkPreferences,
        desiredCompany: t.desiredCompany,
        guestQuantity: t.guestQuantity,
        spotsRemaining: t.spotsRemaining,
        boosted: t.boosted,
        eventId: t.eventId,
        host: await formatPublicHost(t.host ?? null).catch(() => ({
          username: null,
          fullName: null,
          avatarUrl: null,
          averageRating: null,
        })),
      })),
    );
    res.json({ items: out, page, limit, total: scored.length });
  } catch (e) {
    next(e);
  }
});

// ——— Unread house-party job messages —————————————————————————————
router.get('/notifications/unread-count', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const uid = req.userId;
    const count = await prisma.housePartyJobMessage.count({
      where: {
        readAt: null,
        NOT: { senderUserId: uid },
        application: {
          OR: [{ applicantUserId: uid }, { housePartyJob: { hostUserId: uid } }],
        },
      },
    });
    res.json({ count });
  } catch (e) {
    next(e);
  }
});

// ——— CRUD parties —————————————————————————————————————————————————
const createPartySchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  location: z.string().trim().min(1),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  coverImagePublicId: z.string().optional().nullable(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  hasEntranceFee: z.boolean(),
  entranceFeeAmount: z.number().optional().nullable(),
  entranceFeeNote: z.string().optional().nullable(),
  freeEntryGroup: z.string().optional().nullable(),
  guestQuantity: z.number().int().min(2).max(500),
});

router.post('/parties', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const parsed = createPartySchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    if (d.startTime <= new Date()) return res.status(400).json({ error: 'startTime must be in the future' });
    if (d.endTime <= d.startTime) return res.status(400).json({ error: 'endTime must be after startTime' });
    if (d.hasEntranceFee && (d.entranceFeeAmount == null || d.entranceFeeAmount <= 0)) {
      return res.status(400).json({ error: 'entranceFeeAmount required when hasEntranceFee is true' });
    }
    const party = await prisma.houseParty.create({
      data: {
        hostUserId: req.userId,
        title: d.title,
        description: d.description,
        location: d.location,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        coverImageUrl: d.coverImageUrl ?? null,
        coverImagePublicId: d.coverImagePublicId ?? null,
        startTime: d.startTime,
        endTime: d.endTime,
        hasEntranceFee: d.hasEntranceFee,
        entranceFeeAmount: d.hasEntranceFee ? d.entranceFeeAmount : null,
        entranceFeeNote: d.entranceFeeNote ?? null,
        freeEntryGroup: d.freeEntryGroup ?? null,
        guestQuantity: d.guestQuantity,
        spotsRemaining: d.guestQuantity,
        status: 'DRAFT',
      },
    });
    res.status(201).json(party);
  } catch (e) {
    next(e);
  }
});

router.post('/parties/:partyId/publish', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({ where: { id: req.params.partyId } });
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!['DRAFT', 'PENDING_PAYMENT'].includes(party.status)) {
      return res.status(400).json({ error: 'Party cannot be published in current status' });
    }
    await prisma.houseParty.update({
      where: { id: party.id },
      data: { status: 'PENDING_PAYMENT' },
    });
    const pay = await initializePaystackPayment({
      userId: req.userId,
      amountZar: 100,
      metadata: { type: 'HOUSE_PARTY_PUBLISH', housePartyId: party.id, user_id: req.userId },
    });
    res.json(pay);
  } catch (e) {
    next(e);
  }
});

router.post('/parties/:partyId/boost', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({ where: { id: req.params.partyId } });
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (party.status !== 'PUBLISHED') return res.status(400).json({ error: 'Only published parties can be boosted' });
    const pay = await initializePaystackPayment({
      userId: req.userId,
      amountZar: 150,
      metadata: { type: 'HOUSE_PARTY_BOOST', housePartyId: party.id, user_id: req.userId },
    });
    res.json(pay);
  } catch (e) {
    next(e);
  }
});

router.get('/parties', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const parties = await prisma.houseParty.findMany({
      where: { hostUserId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { attendees: true, jobs: true } },
      },
    });
    res.json(
      parties.map((p) => ({
        ...p,
        attendeeCount: p._count.attendees,
        jobCount: p._count.jobs,
        _count: undefined,
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/parties/:partyId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({
      where: { id: req.params.partyId, hostUserId: req.userId },
      include: {
        attendees: {
          include: {
            user: { select: { id: true, fullName: true, userProfile: { select: { username: true, avatarUrl: true } } } },
          },
        },
        jobs: { include: { _count: { select: { applications: true } } } },
      },
    });
    if (!party) return res.status(404).json({ error: 'Not found' });
    res.json(party);
  } catch (e) {
    next(e);
  }
});

const patchPartySchema = createPartySchema.partial().extend({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(500).optional(),
});

router.patch('/parties/:partyId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({ where: { id: req.params.partyId } });
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (['COMPLETED', 'CANCELLED'].includes(party.status)) {
      return res.status(400).json({ error: 'Cannot edit completed or cancelled party' });
    }
    if (!['DRAFT', 'PUBLISHED'].includes(party.status)) {
      return res.status(400).json({ error: 'Cannot edit in current status' });
    }
    const parsed = patchPartySchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    if (d.guestQuantity != null && d.guestQuantity !== party.guestQuantity) {
      const going = await prisma.housePartyAttendee.count({ where: { housePartyId: party.id, status: 'GOING' } });
      if (d.guestQuantity < going) {
        return res.status(400).json({ error: 'guestQuantity cannot be less than current attendees' });
      }
      const newSpots = d.guestQuantity - going;
      const updated = await prisma.houseParty.update({
        where: { id: party.id },
        data: { ...d, spotsRemaining: newSpots },
      });
      return res.json(updated);
    }
    const updated = await prisma.houseParty.update({ where: { id: party.id }, data: d });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete('/parties/:partyId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({ where: { id: req.params.partyId } });
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (party.status === 'DRAFT') {
      await prisma.houseParty.delete({ where: { id: party.id } });
      return res.json({ deleted: true });
    }
    if (party.status === 'PUBLISHED') {
      await prisma.houseParty.update({ where: { id: party.id }, data: { status: 'CANCELLED' } });
      return res.json({ cancelled: true });
    }
    return res.status(400).json({ error: 'Cannot delete in current status' });
  } catch (e) {
    next(e);
  }
});

router.post('/parties/:partyId/join', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    const partyId = req.params.partyId;
    const party = await prisma.houseParty.findFirst({ where: { id: partyId } });
    if (!party) return res.status(404).json({ error: 'Not found' });
    if (party.hostUserId === req.userId) return res.status(403).json({ error: 'You cannot join your own party' });
    if (party.status !== 'PUBLISHED') return res.status(400).json({ error: 'Party is not published' });
    if (party.startTime <= new Date()) return res.status(400).json({ error: 'Party has already started' });
    const existing = await prisma.housePartyAttendee.findUnique({
      where: { housePartyId_userId: { housePartyId: partyId, userId: req.userId } },
    });
    if (existing && existing.status !== 'CANCELLED') {
      return res.status(400).json({ error: 'Already registered' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.houseParty.findUnique({ where: { id: partyId } });
      if (fresh.spotsRemaining > 0) {
        await tx.houseParty.update({
          where: { id: partyId },
          data: { spotsRemaining: { decrement: 1 } },
        });
        const att = await tx.housePartyAttendee.upsert({
          where: { housePartyId_userId: { housePartyId: partyId, userId: req.userId } },
          create: { housePartyId: partyId, userId: req.userId, status: 'GOING' },
          update: { status: 'GOING' },
        });
        return { status: 'GOING', att };
      }
      const att = await tx.housePartyAttendee.upsert({
        where: { housePartyId_userId: { housePartyId: partyId, userId: req.userId } },
        create: { housePartyId: partyId, userId: req.userId, status: 'WAITLISTED' },
        update: { status: 'WAITLISTED' },
      });
      return { status: 'WAITLISTED', att };
    });

    const joiner = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { userProfile: { select: { username: true } } },
    });
    const uname = joiner?.userProfile?.username || joiner?.username || 'someone';
    await createInAppNotification({
      userId: party.hostUserId,
      type: 'EVENT_JOINED',
      title: 'New guest',
      body: `@${uname} is coming to your party!`,
      referenceId: partyId,
      referenceType: 'HOUSE_PARTY',
    });
    await logFriendActivity({
      userId: req.userId,
      activityType: 'JOINED_EVENT',
      referenceId: partyId,
      referenceType: 'HOUSE_PARTY',
      description: 'joined a house party',
    });
    res.json({ status: result.status });
  } catch (e) {
    next(e);
  }
});

router.delete('/parties/:partyId/join', authenticateToken, async (req, res, next) => {
  try {
    const partyId = req.params.partyId;
    const att = await prisma.housePartyAttendee.findUnique({
      where: { housePartyId_userId: { housePartyId: partyId, userId: req.userId } },
    });
    if (!att) return res.status(404).json({ error: 'Not attending' });
    await prisma.$transaction(async (tx) => {
      await tx.housePartyAttendee.delete({ where: { id: att.id } });
      if (att.status === 'GOING') {
        await tx.houseParty.update({
          where: { id: partyId },
          data: { spotsRemaining: { increment: 1 } },
        });
        const first = await tx.housePartyAttendee.findFirst({
          where: { housePartyId: partyId, status: 'WAITLISTED' },
          orderBy: { joinedAt: 'asc' },
        });
        if (first) {
          await tx.housePartyAttendee.update({
            where: { id: first.id },
            data: { status: 'GOING' },
          });
          await tx.houseParty.update({
            where: { id: partyId },
            data: { spotsRemaining: { decrement: 1 } },
          });
          await createInAppNotification({
            userId: first.userId,
            type: 'EVENT_JOINED',
            title: 'Spot opened',
            body: `A spot opened up — you're going to the party!`,
            referenceId: partyId,
            referenceType: 'HOUSE_PARTY',
          });
        }
      }
    });
    res.json({ cancelled: true });
  } catch (e) {
    next(e);
  }
});

// ——— Hosted tables CRUD ————————————————————————————————————————————
const createTableSchema = z.object({
  tableType: z.enum(['IN_APP_EVENT', 'EXTERNAL_VENUE']),
  tableName: z.string().trim().min(1, 'tableName is required').max(60, 'tableName max 60 characters'),
  tableDescription: z.string().trim().max(300, 'tableDescription max 300 characters').optional().nullable(),
  eventType: z.enum(['CLUB_TABLE', 'HOUSE_PARTY', 'BOAT_PARTY', 'RESTAURANT', 'OTHER']),
  eventId: z.string().optional().nullable(),
  venueName: z.string().trim().min(1).optional(),
  venueAddress: z.string().optional().nullable(),
  eventDate: z.coerce.date(),
  eventTime: z.string().min(1),
  hasJoiningFee: z.boolean().default(false),
  joiningFee: z.number().min(10, 'joiningFee must be at least R10').optional().nullable(),
  photo: z.string().url().optional().nullable(),
  photoPublicId: z.string().optional().nullable(),
  drinkPreferences: z.string().optional().nullable(),
  desiredCompany: z.string().optional().nullable(),
  guestQuantity: z.number().int().min(1).max(20),
  isPublic: z.boolean().default(true),
});

router.post('/tables', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const parsed = createTableSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    if (d.hasJoiningFee && (d.joiningFee == null || d.joiningFee < 10)) {
      return res.status(400).json({ error: 'joiningFee is required and must be at least R10 when hasJoiningFee is true' });
    }
    if (d.tableType === 'EXTERNAL_VENUE' && (!d.venueAddress || !d.venueAddress.trim())) {
      return res.status(400).json({ error: 'venueAddress is required for external venue tables' });
    }
    const future = new Date();
    if (d.tableType === 'IN_APP_EVENT') {
      if (!d.eventId) return res.status(400).json({ error: 'eventId required for in-app event' });
      const ev = await prisma.event.findFirst({
        where: { id: d.eventId, deletedAt: null },
        include: { venue: true },
      });
      if (!ev) return res.status(404).json({ error: 'Event not found' });
      if (ev.date <= future) return res.status(400).json({ error: 'Event must be in the future' });
      const timeCheck = assertTableTimeNotBeforeEventStart(d.eventTime, ev.startTime);
      if (!timeCheck.ok) return res.status(400).json({ error: timeCheck.error });
      const venueName = ev.venue?.name || d.venueName || 'Venue';
      const venueAddress = formatVenueAddressFromVenue(ev.venue) ?? d.venueAddress?.trim() ?? ev.city ?? null;
      const t = await prisma.$transaction(async (tx) =>
        tx.hostedTable.create({
          data: {
            hostUserId: req.userId,
            tableType: 'IN_APP_EVENT',
            tableName: d.tableName,
            tableDescription: d.tableDescription ?? null,
            eventType: d.eventType,
            eventId: d.eventId,
            venueName,
            venueAddress,
            eventDate: ev.date,
            eventTime: d.eventTime,
            hasJoiningFee: d.hasJoiningFee,
            joiningFee: d.hasJoiningFee ? d.joiningFee : null,
            photo: d.photo ?? null,
            photoPublicId: d.photoPublicId ?? null,
            drinkPreferences: d.drinkPreferences ?? null,
            desiredCompany: d.desiredCompany ?? null,
            guestQuantity: d.guestQuantity,
            spotsRemaining: d.guestQuantity - 1,
            isPublic: d.isPublic,
            status: 'ACTIVE',
            members: {
              create: [{ userId: req.userId, status: 'GOING' }],
            },
            groupChat: {
              create: {
                name: d.tableName,
                members: { create: [{ userId: req.userId }] },
              },
            },
          },
          include: { members: true, groupChat: true },
        }),
      );
      await logFriendActivity({
        userId: req.userId,
        activityType: 'HOSTED_TABLE',
        referenceId: t.id,
        referenceType: 'HOSTED_TABLE',
        description: 'hosted a table',
      });
      return res.status(201).json({
        ...t,
        eventLocation: buildEventLocationPayload(ev),
      });
    }
    if (!d.venueName) return res.status(400).json({ error: 'venueName required for external venue' });
    if (d.eventDate <= future) return res.status(400).json({ error: 'eventDate must be in the future' });
    const t = await prisma.$transaction(async (tx) =>
      tx.hostedTable.create({
        data: {
          hostUserId: req.userId,
          tableType: 'EXTERNAL_VENUE',
          tableName: d.tableName,
          tableDescription: d.tableDescription ?? null,
          eventType: d.eventType,
          eventId: null,
          venueName: d.venueName,
          venueAddress: d.venueAddress.trim(),
          eventDate: d.eventDate,
          eventTime: d.eventTime,
          hasJoiningFee: d.hasJoiningFee,
          joiningFee: d.hasJoiningFee ? d.joiningFee : null,
          photo: d.photo ?? null,
          photoPublicId: d.photoPublicId ?? null,
          drinkPreferences: d.drinkPreferences ?? null,
          desiredCompany: d.desiredCompany ?? null,
          guestQuantity: d.guestQuantity,
          spotsRemaining: d.guestQuantity - 1,
          isPublic: d.isPublic,
          status: 'ACTIVE',
          members: { create: [{ userId: req.userId, status: 'GOING' }] },
          groupChat: {
            create: {
              name: d.tableName,
              members: { create: [{ userId: req.userId }] },
            },
          },
        },
        include: { members: true, groupChat: true },
      }),
    );
    await logFriendActivity({
      userId: req.userId,
      activityType: 'HOSTED_TABLE',
      referenceId: t.id,
      referenceType: 'HOSTED_TABLE',
      description: 'hosted a table',
    });
    res.status(201).json(t);
  } catch (e) {
    next(e);
  }
});

router.post('/tables/:tableId/boost', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const t = await prisma.hostedTable.findFirst({ where: { id: req.params.tableId } });
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (t.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const pay = await initializePaystackPayment({
      userId: req.userId,
      amountZar: 150,
      metadata: { type: 'TABLE_BOOST', hostedTableId: t.id, user_id: req.userId },
    });
    res.json(pay);
  } catch (e) {
    next(e);
  }
});

router.get('/tables', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const tables = await prisma.hostedTable.findMany({
      where: { hostUserId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            startTime: true,
            city: true,
            venue: {
              select: {
                name: true,
                address: true,
                suburb: true,
                city: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
        groupChat: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });
    const ids = tables.map((t) => t.id);
    const pendingRows =
      ids.length === 0
        ? []
        : await prisma.hostedTableMember.groupBy({
            by: ['hostedTableId'],
            where: { hostedTableId: { in: ids }, status: 'PENDING' },
            _count: true,
          });
    const pendingByTable = Object.fromEntries(pendingRows.map((r) => [r.hostedTableId, r._count]));
    const out = tables.map((t) => ({
      ...t,
      eventLocation: t.tableType === 'IN_APP_EVENT' && t.event ? buildEventLocationPayload(t.event) : null,
      pendingJoinCount: pendingByTable[t.id] ?? 0,
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/tables/memberships/active', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const hosted = await prisma.hostedTable.findMany({
      where: { hostUserId: req.userId, status: 'ACTIVE' },
      select: { id: true },
    });
    const memberOf = await prisma.hostedTableMember.findMany({
      where: { userId: req.userId, hostedTable: { status: 'ACTIVE' } },
      select: { hostedTableId: true },
    });
    res.json({
      hasActive: hosted.length > 0 || memberOf.length > 0,
      hostedIds: hosted.map((h) => h.id),
      memberTableIds: [...new Set(memberOf.map((m) => m.hostedTableId))],
    });
  } catch (e) {
    next(e);
  }
});

router.get('/tables/:tableId/pending-requests', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const t = await prisma.hostedTable.findFirst({
      where: { id: req.params.tableId },
      select: { id: true, hostUserId: true },
    });
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (t.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const rows = await prisma.hostedTableMember.findMany({
      where: { hostedTableId: t.id, status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            userProfile: { select: { username: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    res.json(
      rows.map((m) => ({
        id: m.id,
        userId: m.userId,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          username: m.user.userProfile?.username || m.user.username,
          fullName: m.user.fullName,
          avatarUrl: m.user.userProfile?.avatarUrl || null,
        },
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.patch('/tables/:tableId/join-requests/:userId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const { action } = z.object({ action: z.enum(['approve', 'reject']) }).parse(req.body || {});
    const table = await prisma.hostedTable.findFirst({
      where: { id: req.params.tableId },
      select: {
        id: true,
        hostUserId: true,
        tableName: true,
        spotsRemaining: true,
        status: true,
      },
    });
    if (!table) return res.status(404).json({ error: 'Not found' });
    if (table.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const targetUserId = req.params.userId;
    const member = await prisma.hostedTableMember.findUnique({
      where: { hostedTableId_userId: { hostedTableId: table.id, userId: targetUserId } },
    });
    if (!member || member.status !== 'PENDING') {
      return res.status(400).json({ error: 'No pending request for this user' });
    }
    if (action === 'reject') {
      await prisma.hostedTableMember.delete({ where: { id: member.id } });
      return res.json({ rejected: true });
    }
    if (table.spotsRemaining <= 0) return res.status(400).json({ error: 'Table is full' });
    await prisma.$transaction(async (tx) => {
      await tx.hostedTableMember.update({
        where: { id: member.id },
        data: { status: 'GOING' },
      });
      const nextSpots = table.spotsRemaining - 1;
      await tx.hostedTable.update({
        where: { id: table.id },
        data: {
          spotsRemaining: { decrement: 1 },
          ...(nextSpots <= 0 ? { status: 'FULL' } : {}),
        },
      });
    });
    await addUserToHostedTableGroupChat(table.id, targetUserId);
    await createInAppNotification({
      userId: targetUserId,
      type: 'TABLE_JOINED',
      title: 'Request approved',
      body: `Your join request for "${table.tableName}" was approved`,
      referenceId: table.id,
      referenceType: 'HOSTED_TABLE',
    });
    res.json({ approved: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

const patchTableSchema = z.object({
  tableName: z.string().trim().min(1).max(60).optional(),
  tableDescription: z.string().trim().max(300).optional().nullable(),
  eventType: z.enum(['CLUB_TABLE', 'HOUSE_PARTY', 'BOAT_PARTY', 'RESTAURANT', 'OTHER']).optional(),
  drinkPreferences: z.string().optional().nullable(),
  desiredCompany: z.string().optional().nullable(),
  hasJoiningFee: z.boolean().optional(),
  joiningFee: z.number().min(10).optional().nullable(),
  photo: z.string().url().optional().nullable(),
  photoPublicId: z.string().optional().nullable(),
  guestQuantity: z.number().int().min(1).max(20).optional(),
  eventTime: z.string().optional(),
  isPublic: z.boolean().optional(),
  venueAddress: z.string().trim().min(1).optional().nullable(),
});

router.patch('/tables/:tableId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const t = await prisma.hostedTable.findFirst({ where: { id: req.params.tableId } });
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (t.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const parsed = patchTableSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    if (t.tableType === 'EXTERNAL_VENUE' && d.venueAddress != null && !d.venueAddress.trim()) {
      return res.status(400).json({ error: 'venueAddress cannot be empty' });
    }
    if (d.eventTime != null && t.eventId) {
      const ev = await prisma.event.findFirst({ where: { id: t.eventId, deletedAt: null } });
      if (ev) {
        const timeCheck = assertTableTimeNotBeforeEventStart(d.eventTime, ev.startTime);
        if (!timeCheck.ok) return res.status(400).json({ error: timeCheck.error });
      }
    }
    const hasJoiningFee = d.hasJoiningFee != null ? d.hasJoiningFee : t.hasJoiningFee;
    const joiningFee = d.joiningFee != null ? d.joiningFee : t.joiningFee;
    if (hasJoiningFee && (joiningFee == null || joiningFee < 10)) {
      return res.status(400).json({ error: 'joiningFee must be at least R10 when hasJoiningFee is true' });
    }
    if (d.guestQuantity != null) {
      const going = await prisma.hostedTableMember.count({
        where: { hostedTableId: t.id, status: 'GOING' },
      });
      if (d.guestQuantity < going) return res.status(400).json({ error: 'guestQuantity too low' });
      const updated = await prisma.hostedTable.update({
        where: { id: t.id },
        data: {
          ...d,
          venueAddress:
            d.venueAddress != null && t.tableType === 'EXTERNAL_VENUE' ? d.venueAddress.trim() : d.venueAddress,
          spotsRemaining: d.guestQuantity - going,
        },
      });
      if (d.tableName != null && d.tableName !== t.tableName) {
        await prisma.hostedTableGroupChat.updateMany({
          where: { hostedTableId: t.id },
          data: { name: d.tableName },
        });
      }
      return res.json(updated);
    }
    const data = { ...d };
    if (data.venueAddress != null && t.tableType === 'EXTERNAL_VENUE') {
      data.venueAddress = data.venueAddress.trim();
    }
    const updated = await prisma.hostedTable.update({ where: { id: t.id }, data });
    if (d.tableName != null && d.tableName !== t.tableName) {
      await prisma.hostedTableGroupChat.updateMany({
        where: { hostedTableId: t.id },
        data: { name: d.tableName },
      });
    }
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.delete('/tables/:tableId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const t = await prisma.hostedTable.findFirst({
      where: { id: req.params.tableId },
      include: { members: true },
    });
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (t.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.hostedTable.update({ where: { id: t.id }, data: { status: 'CLOSED' } });
    const memberIds = t.members.filter((m) => m.userId !== t.hostUserId).map((m) => m.userId);
    await Promise.all(
      memberIds.map((uid) =>
        createInAppNotification({
          userId: uid,
          type: 'TABLE_JOINED',
          title: 'Table closed',
          body: 'A table you joined has been closed by the host',
          referenceId: t.id,
          referenceType: 'HOSTED_TABLE',
        }),
      ),
    );
    res.json({ closed: true });
  } catch (e) {
    next(e);
  }
});

router.post('/tables/:tableId/join', authenticateToken, requireVerified, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const t = await prisma.hostedTable.findFirst({ where: { id: req.params.tableId } });
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (t.hostUserId === req.userId) return res.status(403).json({ error: 'Cannot join your own table' });
    if (t.status !== 'ACTIVE') return res.status(400).json({ error: 'Table not available' });
    const exists = await prisma.hostedTableMember.findUnique({
      where: { hostedTableId_userId: { hostedTableId: t.id, userId: req.userId } },
    });
    if (exists) {
      if (exists.status === 'PENDING') return res.status(400).json({ error: 'Your join request is already pending' });
      return res.status(400).json({ error: 'Already a member' });
    }
    if (!t.isPublic) {
      if (t.spotsRemaining <= 0) return res.status(400).json({ error: 'Table not available' });
      await prisma.hostedTableMember.create({
        data: { hostedTableId: t.id, userId: req.userId, status: 'PENDING' },
      });
      const joiner = await prisma.user.findUnique({
        where: { id: req.userId },
        include: { userProfile: { select: { username: true } } },
      });
      const uname = joiner?.userProfile?.username || joiner?.username || 'someone';
      await createInAppNotification({
        userId: t.hostUserId,
        type: 'TABLE_JOINED',
        title: 'Join request',
        body: `@${uname} requested to join your table`,
        referenceId: t.id,
        referenceType: 'HOSTED_TABLE',
      });
      return res.json({ joined: false, pending: true });
    }
    if (t.spotsRemaining <= 0) return res.status(400).json({ error: 'Table not available' });
    await prisma.$transaction(async (tx) => {
      await tx.hostedTableMember.create({
        data: { hostedTableId: t.id, userId: req.userId, status: 'GOING' },
      });
      const nextSpots = t.spotsRemaining - 1;
      await tx.hostedTable.update({
        where: { id: t.id },
        data: {
          spotsRemaining: { decrement: 1 },
          ...(nextSpots <= 0 ? { status: 'FULL' } : {}),
        },
      });
    });
    await addUserToHostedTableGroupChat(t.id, req.userId);
    const joiner = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { userProfile: { select: { username: true } } },
    });
    const uname = joiner?.userProfile?.username || joiner?.username || 'someone';
    await createInAppNotification({
      userId: t.hostUserId,
      type: 'TABLE_JOINED',
      title: 'New member',
      body: `@${uname} joined your table`,
      referenceId: t.id,
      referenceType: 'HOSTED_TABLE',
    });
    await logFriendActivity({
      userId: req.userId,
      activityType: 'JOINED_TABLE',
      referenceId: t.id,
      referenceType: 'HOSTED_TABLE',
      description: 'joined a table',
    });
    res.json({ joined: true });
  } catch (e) {
    next(e);
  }
});

router.post('/tables/:tableId/invite', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const { inviteeUserId } = z.object({ inviteeUserId: z.string().min(1) }).parse(req.body || {});
    const table = await prisma.hostedTable.findFirst({
      where: { id: req.params.tableId },
      include: { members: true },
    });
    if (!table) return res.status(404).json({ error: 'Not found' });
    const isHost = table.hostUserId === req.userId;
    const isMember = table.members.some((m) => m.userId === req.userId);
    if (!isHost && !isMember) return res.status(403).json({ error: 'Forbidden' });
    if (!table.isPublic && !isHost) {
      return res.status(403).json({ error: 'Only the host can invite people to a private table' });
    }
    if (inviteeUserId === req.userId) return res.status(400).json({ error: 'Invalid invitee' });
    const already = await prisma.hostedTableMember.findUnique({
      where: { hostedTableId_userId: { hostedTableId: table.id, userId: inviteeUserId } },
    });
    if (already?.status === 'GOING') return res.status(400).json({ error: 'User already a member' });
    if (already?.status === 'PENDING') return res.status(400).json({ error: 'User already has a pending request' });
    const pendingInv = await prisma.tableInvite.findUnique({
      where: { hostedTableId_inviteeUserId: { hostedTableId: table.id, inviteeUserId } },
    });
    if (pendingInv && pendingInv.status === 'PENDING') return res.status(400).json({ error: 'Invite already pending' });
    if (!(await areFriends(req.userId, inviteeUserId))) {
      return res.status(400).json({ error: 'You must be friends with this user' });
    }
    const inviter = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { userProfile: { select: { username: true } } },
    });
    const inviterUsername = inviter?.userProfile?.username || inviter?.username || 'Someone';
    const inv = await prisma.tableInvite.create({
      data: {
        hostedTableId: table.id,
        inviterUserId: req.userId,
        inviteeUserId,
        status: 'PENDING',
      },
    });
    await createInAppNotification({
      userId: inviteeUserId,
      type: 'TABLE_INVITE',
      title: `Table invite from @${inviterUsername}`,
      body: `@${inviterUsername} invited you to join their table at ${table.venueName}`,
      referenceId: table.id,
      referenceType: 'TABLE_INVITE',
    });
    res.status(201).json(inv);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.patch('/tables/invites/:inviteId/respond', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const { response } = z.object({ response: z.enum(['ACCEPTED', 'DECLINED']) }).parse(req.body || {});
    const inv = await prisma.tableInvite.findFirst({
      where: { id: req.params.inviteId, inviteeUserId: req.userId },
      include: { hostedTable: true },
    });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (inv.status !== 'PENDING') return res.status(400).json({ error: 'Already responded' });
    if (response === 'DECLINED') {
      const u = await prisma.tableInvite.update({
        where: { id: inv.id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
      return res.json(u);
    }
    const table = inv.hostedTable;
    const existingMember = await prisma.hostedTableMember.findUnique({
      where: { hostedTableId_userId: { hostedTableId: table.id, userId: req.userId } },
    });
    if (existingMember?.status === 'GOING') return res.status(400).json({ error: 'Already a member' });
    if (table.spotsRemaining <= 0) return res.status(400).json({ error: 'Table is full' });
    await prisma.$transaction(async (tx) => {
      await tx.tableInvite.update({
        where: { id: inv.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      if (existingMember?.status === 'PENDING') {
        await tx.hostedTableMember.update({
          where: { id: existingMember.id },
          data: { status: 'GOING' },
        });
      } else {
        await tx.hostedTableMember.create({
          data: { hostedTableId: table.id, userId: req.userId, status: 'GOING' },
        });
      }
      const nextSpots = table.spotsRemaining - 1;
      await tx.hostedTable.update({
        where: { id: table.id },
        data: {
          spotsRemaining: { decrement: 1 },
          ...(nextSpots <= 0 ? { status: 'FULL' } : {}),
        },
      });
    });
    await addUserToHostedTableGroupChat(table.id, req.userId);
    const invitee = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { userProfile: { select: { username: true } } },
    });
    const un = invitee?.userProfile?.username || invitee?.username || 'someone';
    await createInAppNotification({
      userId: table.hostUserId,
      type: 'TABLE_JOINED',
      title: 'Invite accepted',
      body: `@${un} accepted your table invite`,
      referenceId: table.id,
      referenceType: 'HOSTED_TABLE',
    });
    const updated = await prisma.tableInvite.findUnique({ where: { id: inv.id } });
    res.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.get('/tables/invites/pending', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const invites = await prisma.tableInvite.findMany({
      where: { inviteeUserId: req.userId, status: 'PENDING' },
      include: {
        hostedTable: true,
        inviter: { select: publicHostSelect },
      },
      orderBy: { sentAt: 'desc' },
    });
    res.json(invites);
  } catch (e) {
    next(e);
  }
});

// ——— House party jobs —————————————————————————————————————————————
router.post('/parties/:partyId/jobs', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({ where: { id: req.params.partyId } });
    if (!party || party.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const parsed = postingSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const payload = parsed.data;
    if (
      (payload.compensationType === 'FIXED' || payload.compensationType === 'NEGOTIABLE') &&
      !payload.compensationPer
    ) {
      return res.status(400).json({ error: 'compensationPer is required' });
    }
    const job = await prisma.housePartyJob.create({
      data: {
        housePartyId: party.id,
        hostUserId: req.userId,
        title: payload.title,
        description: payload.description,
        requirements: payload.requirements,
        jobType: payload.jobType,
        compensationType: payload.compensationType,
        compensationAmount: payload.compensationAmount ?? null,
        compensationPer: payload.compensationPer || 'MONTH',
        currency: payload.currency,
        totalSpots: payload.totalSpots,
        closingDate: payload.closingDate ?? null,
        status: 'OPEN',
      },
    });
    res.status(201).json(job);
  } catch (e) {
    next(e);
  }
});

router.get('/parties/:partyId/jobs', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const party = await prisma.houseParty.findFirst({ where: { id: req.params.partyId } });
    if (!party || party.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const jobs = await prisma.housePartyJob.findMany({
      where: { housePartyId: party.id },
      include: { _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(jobs);
  } catch (e) {
    next(e);
  }
});

router.get('/parties/:partyId/jobs/:jobId/applications', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const job = await prisma.housePartyJob.findFirst({
      where: { id: req.params.jobId, housePartyId: req.params.partyId, hostUserId: req.userId },
    });
    if (!job) return res.status(403).json({ error: 'Forbidden' });
    const applications = await prisma.housePartyJobApplication.findMany({
      where: { housePartyJobId: job.id },
      orderBy: { appliedAt: 'desc' },
      include: {
        applicant: { select: { id: true, fullName: true, userProfile: { select: { username: true, avatarUrl: true } } } },
      },
    });
    const safe = applications.map(({ cvUrl: _c, ...rest }) => rest);
    res.json(safe);
  } catch (e) {
    next(e);
  }
});

router.patch('/parties/jobs/applications/:applicationId/status', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const { status } = z.object({ status: z.enum(['SHORTLISTED', 'REJECTED', 'HIRED']) }).parse(req.body || {});
    const application = await prisma.housePartyJobApplication.findFirst({
      where: { id: req.params.applicationId },
      include: { housePartyJob: true, applicant: { select: { id: true, userProfile: { select: { username: true } } } } },
    });
    if (!application || application.housePartyJob.hostUserId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.housePartyJobApplication.update({ where: { id: application.id }, data: { status } });
      if (status === 'HIRED') {
        const posting = await tx.housePartyJob.update({
          where: { id: application.housePartyJobId },
          data: { filledSpots: { increment: 1 } },
        });
        if (posting.filledSpots >= posting.totalSpots) {
          await tx.housePartyJob.update({ where: { id: posting.id }, data: { status: 'FILLED' } });
        }
      }
    });
    const titles = { SHORTLISTED: 'Shortlisted', REJECTED: 'Not selected', HIRED: 'Hired' };
    await createInAppNotification({
      userId: application.applicantUserId,
      type: 'DIRECT_MESSAGE',
      title: titles[status] || 'Application update',
      body: `Your application for "${application.housePartyJob.title}" was updated.`,
      referenceId: application.id,
      referenceType: 'HOUSE_PARTY_JOB_APPLICATION',
    });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.get('/parties/jobs/applications/:applicationId/cv', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const application = await prisma.housePartyJobApplication.findFirst({
      where: { id: req.params.applicationId },
      include: { housePartyJob: true },
    });
    if (!application || application.housePartyJob.hostUserId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const raw = application.cvUrl;
    const viewUrl = raw ? privateDownloadUrl(raw) || signCloudinaryUrl(raw) || raw : null;
    logger.info('House party CV access', { applicationId: application.id, accessedBy: req.userId });
    res.set('Cache-Control', 'no-store');
    res.json({ cvUrl: raw, viewUrl, cvFileName: application.cvFileName });
  } catch (e) {
    next(e);
  }
});

async function getHousePartyApplicationAccess(applicationId, userId) {
  return prisma.housePartyJobApplication.findFirst({
    where: {
      id: applicationId,
      OR: [{ applicantUserId: userId }, { housePartyJob: { hostUserId: userId } }],
    },
    include: { housePartyJob: true },
  });
}

router.get('/parties/jobs/applications/:applicationId/messages', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const application = await getHousePartyApplicationAccess(req.params.applicationId, req.userId);
    if (!application) return res.status(403).json({ error: 'Forbidden' });
    await prisma.housePartyJobMessage.updateMany({
      where: { applicationId: application.id, readAt: null, senderUserId: { not: req.userId } },
      data: { readAt: new Date() },
    });
    const messages = await prisma.housePartyJobMessage.findMany({
      where: { applicationId: application.id },
      orderBy: { sentAt: 'asc' },
      include: { sender: { select: { id: true, fullName: true } } },
    });
    res.json(messages);
  } catch (e) {
    next(e);
  }
});

router.post('/parties/jobs/applications/:applicationId/messages', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const parsed = messageSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const application = await getHousePartyApplicationAccess(req.params.applicationId, req.userId);
    if (!application) return res.status(403).json({ error: 'Forbidden' });
    const senderIsHost = application.housePartyJob.hostUserId === req.userId;
    if (!senderIsHost && application.status === 'REJECTED') {
      return res.status(403).json({ error: 'Messaging not allowed' });
    }
    const msg = await prisma.housePartyJobMessage.create({
      data: {
        applicationId: application.id,
        senderUserId: req.userId,
        body: parsed.data.body,
      },
    });
    const otherId = senderIsHost ? application.applicantUserId : application.housePartyJob.hostUserId;
    await createInAppNotification({
      userId: otherId,
      type: 'DIRECT_MESSAGE',
      title: 'New message',
      body: `New message about "${application.housePartyJob.title}"`,
      referenceId: application.id,
      referenceType: 'HOUSE_PARTY_JOB_APPLICATION',
    });
    res.status(201).json(msg);
  } catch (e) {
    next(e);
  }
});

router.post('/parties/:partyId/jobs/:jobId/apply', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const parsed = applicationSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const job = await prisma.housePartyJob.findFirst({
      where: { id: req.params.jobId, housePartyId: req.params.partyId },
      include: { houseParty: true },
    });
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (job.hostUserId === req.userId) return res.status(403).json({ error: 'Cannot apply to your own job' });
    if (job.status !== 'OPEN') return res.status(400).json({ error: 'Job not open' });
    const dup = await prisma.housePartyJobApplication.findUnique({
      where: { housePartyJobId_applicantUserId: { housePartyJobId: job.id, applicantUserId: req.userId } },
    });
    if (dup) return res.status(400).json({ error: 'Already applied' });
    const app = await prisma.housePartyJobApplication.create({
      data: {
        housePartyJobId: job.id,
        applicantUserId: req.userId,
        coverMessage: parsed.data.coverMessage,
        cvUrl: parsed.data.cvUrl,
        cvFileName: parsed.data.cvFileName,
        portfolioUrl: parsed.data.portfolioUrl,
      },
    });
    const applicant = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { userProfile: { select: { username: true } } },
    });
    const uname = applicant?.userProfile?.username || applicant?.username || 'someone';
    await createInAppNotification({
      userId: job.hostUserId,
      type: 'DIRECT_MESSAGE',
      title: 'New application',
      body: `@${uname} applied for ${job.title}`,
      referenceId: app.id,
      referenceType: 'HOUSE_PARTY_JOB_APPLICATION',
    });
    res.status(201).json(app);
  } catch (e) {
    next(e);
  }
});

router.get('/jobs', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const jobs = await prisma.housePartyJob.findMany({
      where: { hostUserId: req.userId },
      include: {
        houseParty: { select: { id: true, title: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(jobs);
  } catch (e) {
    next(e);
  }
});

router.patch('/parties/:partyId/jobs/:jobId', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const job = await prisma.housePartyJob.findFirst({
      where: { id: req.params.jobId, housePartyId: req.params.partyId, hostUserId: req.userId },
    });
    if (!job) return res.status(403).json({ error: 'Forbidden' });
    const schema = postingSchema.partial().extend({ status: z.enum(['OPEN', 'CLOSED', 'FILLED']).optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const updated = await prisma.housePartyJob.update({
      where: { id: job.id },
      data: parsed.data,
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.get('/activity/summary', authenticateToken, async (req, res, next) => {
  try {
    if (!assertHostEligibleRole(req, res)) return;
    const uid = req.userId;
    const [partiesCount, tablesCount, partyAttendees, tableMembers, reviews, jobsPosted] = await Promise.all([
      prisma.houseParty.count({ where: { hostUserId: uid } }),
      prisma.hostedTable.count({ where: { hostUserId: uid } }),
      prisma.housePartyAttendee.count({
        where: { houseParty: { hostUserId: uid }, status: 'GOING' },
      }),
      prisma.hostedTableMember.count({
        where: { hostedTable: { hostUserId: uid }, status: 'GOING', userId: { not: uid } },
      }),
      prisma.userProfile.findUnique({ where: { userId: uid }, select: { serviceRatingAvg: true, serviceRatingCount: true } }),
      prisma.housePartyJob.count({ where: { hostUserId: uid } }),
    ]);
    res.json({
      totalHousePartiesHosted: partiesCount,
      totalTablesHosted: tablesCount,
      totalPartyAttendees: partyAttendees,
      totalTableJoiners: tableMembers,
      averageRatingReceived: reviews?.serviceRatingAvg != null ? Number(reviews.serviceRatingAvg) : null,
      jobsPostedCount: jobsPosted,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
