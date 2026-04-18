/**
 * Tables Routes
 * SECURITY: Capacity enforcement is atomic. No duplicate joins. No silent failures.
 * SECURITY: Email verification required for all write actions.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { requireIdentityVerified } from '../middleware/requireIdentityVerified.js';
import { applyTableVenueIsolation, canAccessVenue, isStaff } from '../lib/access.js';
import { auditFromReq } from '../lib/audit.js';
import { createNotification, createNotifications } from '../lib/notifications.js';
import { addUserToEventGroupChat } from '../lib/groupChatHelpers.js';
import { logFriendActivity } from '../lib/friendActivity.js';
import { upsertConfirmedAttendance } from '../lib/eventAttendance.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';

const router = Router();

async function resolveUserIdFromProfileOrUser(id) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (user) return user.id;
  const profile = await prisma.userProfile.findFirst({ where: { id }, select: { userId: true } });
  return profile?.userId || null;
}

const tableCreateSchema = z.object({
  event_id: z.string().uuid(),
  venue_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  max_guests: z.number().int().min(1).max(500),
  min_spend: z.number().min(0).optional(),
  joining_fee: z.number().min(0).optional(),
  is_public: z.boolean().optional(),
});

function formatTable(t) {
  return {
    id: t.id,
    event_id: t.eventId,
    venue_id: t.venueId,
    host_user_id: t.hostUserId,
    name: t.name,
    status: t.status,
    max_guests: t.maxGuests,
    current_guests: t.currentGuests,
    min_spend: t.minSpend,
    joining_fee: t.joiningFee,
    is_public: t.isPublic ?? true,
    members: t.members,
    pending_requests: t.pendingRequests,
    created_date: t.createdAt.toISOString()
  };
}

async function getTableForNotifications(tableId) {
  return prisma.table.findFirst({
    where: { id: tableId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      maxGuests: true,
      currentGuests: true,
      hostUserId: true,
      venue: { select: { ownerUserId: true, name: true } },
      eventId: true,
      venueId: true,
    },
  });
}

function extractUserIdsFromMembers(members) {
  const list = Array.isArray(members) ? members : [];
  const ids = list
    .map((m) => {
      if (!m) return null;
      if (typeof m === 'string') return m;
      if (typeof m === 'object') return m.user_id || m.userId || null;
      return null;
    })
    .filter(Boolean);
  return [...new Set(ids)];
}

function extractUserIdsFromPending(pendingRequests) {
  const list = Array.isArray(pendingRequests) ? pendingRequests : [];
  const ids = list
    .map((p) => {
      if (!p) return null;
      if (typeof p === 'string') return p;
      if (typeof p === 'object') return p.user_id || p.userId || null;
      return null;
    })
    .filter(Boolean);
  return [...new Set(ids)];
}

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { status = 'open', event_id, venue_id, host_user_id, sort, limit = 100 } = req.query;
    const where = { deletedAt: null };
    if (status) where.status = status;
    if (event_id) where.eventId = event_id;
    if (venue_id) where.venueId = venue_id;
    if (host_user_id) {
      // SECURITY: only allow viewing other users' tables if staff
      if (req.userId && host_user_id !== req.userId && !isStaff(req.userRole)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      where.hostUserId = host_user_id;
    }
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(venue_id, req.userId, req.userRole);
      if (!ok && venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyTableVenueIsolation(where, req.userId, req.userRole, venue_id || null);
    }
    const orderBy = sort === '-created_date' ? { createdAt: 'desc' } : { createdAt: 'asc' };
    const tables = await prisma.table.findMany({
      where,
      orderBy,
      take: Math.min(parseInt(limit) || 100, 100)
    });
    res.json(tables.map(formatTable));
  } catch (err) {
    next(err);
  }
});

router.get('/filter', optionalAuth, async (req, res, next) => {
  try {
    const { id, event_id, venue_id, host_user_id, member_user_id, status, sort, limit = 100 } = req.query;

    if (member_user_id) {
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const mid = String(member_user_id);
      if (mid !== req.userId && !isStaff(req.userRole)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const where = { deletedAt: null, NOT: { hostUserId: mid } };
      if (id) where.id = String(id);
      if (event_id) where.eventId = String(event_id);
      if (venue_id) where.venueId = String(venue_id);
      if (status) where.status = status;
      if (req.userId && req.userRole === 'VENUE') {
        const ok = await canAccessVenue(venue_id, req.userId, req.userRole);
        if (!ok && venue_id) return res.status(403).json({ error: 'Forbidden' });
        await applyTableVenueIsolation(where, req.userId, req.userRole, venue_id || null);
      }
      const orderBy = sort === '-created_date' ? { createdAt: 'desc' } : { createdAt: 'asc' };
      const take = Math.min(parseInt(limit) || 100, 100);
      const tables = await prisma.table.findMany({
        where,
        orderBy,
        take: 250,
      });
      const filtered = tables.filter((t) => extractUserIdsFromMembers(t.members).includes(mid));
      return res.json(filtered.slice(0, take).map(formatTable));
    }

    const where = { deletedAt: null };
    if (id) where.id = String(id);
    if (event_id) where.eventId = String(event_id);
    if (venue_id) where.venueId = String(venue_id);
    if (host_user_id) {
      if (req.userId && host_user_id !== req.userId && !isStaff(req.userRole)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      where.hostUserId = String(host_user_id);
    }
    if (status) where.status = status;
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(venue_id, req.userId, req.userRole);
      if (!ok && venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyTableVenueIsolation(where, req.userId, req.userRole, venue_id || null);
    }
    const orderBy = sort === '-created_date' ? { createdAt: 'desc' } : { createdAt: 'asc' };
    const tables = await prisma.table.findMany({
      where,
      orderBy,
      take: Math.min(parseInt(limit) || 100, 100)
    });
    res.json(tables.map(formatTable));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const table = await prisma.table.findFirst({
      where: { id: req.params.id, deletedAt: null }
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(formatTable(table));
  } catch (err) {
    next(err);
  }
});

// SECURITY: email must be verified to create, join, or leave tables
router.post('/', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const parsed = tableCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const data = parsed.data;

    const event = await prisma.event.findFirst({
      where: { id: data.event_id, deletedAt: null },
      include: { venue: true }
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.venueId !== data.venue_id) return res.status(400).json({ error: 'Venue does not match event' });

    if (event.maxHostedTables != null) {
      const existingCount = await prisma.table.count({
        where: { eventId: data.event_id, deletedAt: null },
      });
      if (existingCount >= event.maxHostedTables) {
        return res.status(400).json({
          error: 'This event has reached the maximum number of hosted tables set by the venue.',
          code: 'EVENT_TABLES_FULL',
        });
      }
    }

    const table = await prisma.table.create({
      data: {
        eventId: data.event_id,
        venueId: data.venue_id,
        hostUserId: req.userId,
        name: data.name,
        maxGuests: data.max_guests,
        minSpend: data.min_spend,
        joiningFee: data.joining_fee,
        isPublic: data.is_public !== undefined ? data.is_public : true,
      }
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'TABLE_CREATED',
      entityType: 'table',
      entityId: table.id,
      metadata: { tableName: table.name, eventId: table.eventId, venueId: table.venueId }
    });

    // In-app notifications: let venue owner know a new table exists at their venue
    await createNotification({
      userId: event.venue?.ownerUserId,
      type: 'table_update',
      title: 'New table created',
      body: `A new table "${table.name}" was created for ${event.venue?.name || 'your venue'}.`,
      actionUrl: `/BusinessBookings`,
    });

    logFriendActivity({
      userId: req.userId,
      activityType: 'HOSTED_TABLE',
      referenceId: table.id,
      referenceType: 'TABLE',
      description: 'hosted a table',
    });

    res.status(201).json(formatTable(table));
  } catch (err) {
    next(err);
  }
});

const tableInviteSchema = z.object({
  recipient_ids: z.array(z.string().uuid()).min(1).max(50),
});

/** Host invites friends by profile id or user id — creates in-app notifications for recipients */
router.post('/:id/invite', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const parsed = tableInviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

    const tableId = req.params.id;
    const table = await prisma.table.findFirst({
      where: { id: tableId, deletedAt: null },
      include: { event: { select: { title: true } } },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.hostUserId !== req.userId && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Only the table host can send invites' });
    }

    const hostProfile = await prisma.userProfile.findUnique({
      where: { userId: req.userId },
      select: { username: true, id: true },
    });
    const hostUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { fullName: true },
    });
    const hostLabel = hostProfile?.username || hostUser?.fullName || 'Someone';
    const eventTitle = table.event?.title || 'an event';

    let sent = 0;
    for (const rawId of parsed.data.recipient_ids) {
      const targetUserId = await resolveUserIdFromProfileOrUser(rawId);
      if (!targetUserId || targetUserId === req.userId) continue;

      await createInAppNotification({
        userId: targetUserId,
        type: 'TABLE_INVITE',
        title: 'Table invitation',
        body: `${hostLabel} invited you to join their table at ${eventTitle}`,
        referenceId: table.id,
        referenceType: 'TABLE',
      });
      sent += 1;
    }

    res.json({ success: true, sent });
  } catch (err) {
    next(err);
  }
});

/**
 * Request to join a table (adds to pending requests).
 * Used for approval-based flows.
 */
router.post('/:id/request-join', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const tableId = req.params.id;
    const userId = req.userId;

    const result = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findFirst({ where: { id: tableId, deletedAt: null } });
      if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });
      if (table.status !== 'open') throw Object.assign(new Error('Table is not open'), { status: 409 });
      if (table.hostUserId === userId) throw Object.assign(new Error('Host cannot request to join their own table'), { status: 400 });

      const pending = Array.isArray(table.pendingRequests) ? table.pendingRequests : [];
      const alreadyPending = pending.includes(userId);
      if (alreadyPending) throw Object.assign(new Error('Request already pending'), { status: 409 });

      const members = Array.isArray(table.members) ? table.members : [];
      const alreadyMember = members.some(m =>
        (typeof m === 'object' && m?.user_id === userId) || m === userId
      );
      if (alreadyMember) throw Object.assign(new Error('Already a member of this table'), { status: 409 });

      return tx.table.update({
        where: { id: tableId },
        data: { pendingRequests: [...pending, userId] },
      });
    });

    const hydrated = await getTableForNotifications(tableId);
    const requester = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const requesterName = requester?.fullName || 'Someone';

    await createNotifications({
      userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
      type: 'table_request',
      title: 'New table join request',
      body: `${requesterName} requested to join "${hydrated?.name || 'a table'}".`,
      actionUrl: `/ManageTable?id=${tableId}`,
    });

    await auditFromReq(req, {
      userId,
      action: 'TABLE_JOIN_REQUESTED',
      entityType: 'table',
      entityId: tableId,
      metadata: {},
    });

    res.json({ success: true, table: formatTable(result) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/**
 * Approve a pending join request.
 */
router.post('/:id/requests/:userId/approve', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const tableId = req.params.id;
    const targetUserId = req.params.userId;

    const updated = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, deletedAt: null },
        include: { venue: true },
      });
      if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });

      const isHost = table.hostUserId === req.userId;
      const isVenueOwner = table.venue?.ownerUserId === req.userId;
      if (!isHost && !isVenueOwner && !isStaff(req.userRole)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }

      const pending = Array.isArray(table.pendingRequests) ? table.pendingRequests : [];
      if (!pending.includes(targetUserId)) throw Object.assign(new Error('Request not found'), { status: 404 });

      if (table.currentGuests >= table.maxGuests) throw Object.assign(new Error('Table is at full capacity'), { status: 409 });

      const members = Array.isArray(table.members) ? table.members : [];
      const alreadyMember = members.some(m =>
        (typeof m === 'object' && m?.user_id === targetUserId) || m === targetUserId
      );
      if (alreadyMember) throw Object.assign(new Error('Already a member of this table'), { status: 409 });

      const newMembers = [...members, { user_id: targetUserId, status: 'confirmed', joined_at: new Date().toISOString() }];
      const newPending = pending.filter((id) => id !== targetUserId);
      const newCount = table.currentGuests + 1;
      const newStatus = newCount >= table.maxGuests ? 'full' : 'open';

      return tx.table.update({
        where: { id: tableId },
        data: { members: newMembers, pendingRequests: newPending, currentGuests: newCount, status: newStatus },
      });
    });

    const hydrated = await getTableForNotifications(tableId);
    const guest = await prisma.user.findUnique({ where: { id: targetUserId }, select: { fullName: true } });
    const guestName = guest?.fullName || 'A guest';

    await createNotification({
      userId: targetUserId,
      type: 'table_update',
      title: 'Table request approved',
      body: `You were approved to join "${hydrated?.name || 'a table'}".`,
      actionUrl: `/TableDetails?id=${tableId}`,
    });

    // Let host + venue owner know the table changed
    await createNotifications({
      userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
      type: 'table_update',
      title: 'Guest approved',
      body: `${guestName} was approved to join "${hydrated?.name || 'a table'}".`,
      actionUrl: `/ManageTable?id=${tableId}`,
    });

    if (updated.status === 'full') {
      await createNotifications({
        userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
        type: 'table_full',
        title: 'Table is fully booked',
        body: `"${hydrated?.name || 'A table'}" has reached max capacity.`,
        actionUrl: `/ManageTable?id=${tableId}`,
      });
    }

    if (hydrated?.eventId) {
      const ev = await prisma.event.findFirst({
        where: { id: hydrated.eventId, deletedAt: null },
        select: { title: true },
      });
      await addUserToEventGroupChat(hydrated.eventId, targetUserId, ev?.title || hydrated?.name || '');
    }

    logFriendActivity({
      userId: targetUserId,
      activityType: 'JOINED_TABLE',
      referenceId: tableId,
      referenceType: 'TABLE',
      description: 'joined a table',
    });
    if (hydrated?.eventId) await upsertConfirmedAttendance(targetUserId, hydrated.eventId);

    res.json({ success: true, table: formatTable(updated) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/**
 * Reject a pending join request.
 */
router.post('/:id/requests/:userId/reject', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const tableId = req.params.id;
    const targetUserId = req.params.userId;

    const updated = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, deletedAt: null },
        include: { venue: true },
      });
      if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });

      const isHost = table.hostUserId === req.userId;
      const isVenueOwner = table.venue?.ownerUserId === req.userId;
      if (!isHost && !isVenueOwner && !isStaff(req.userRole)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }

      const pending = Array.isArray(table.pendingRequests) ? table.pendingRequests : [];
      if (!pending.includes(targetUserId)) throw Object.assign(new Error('Request not found'), { status: 404 });

      const newPending = pending.filter((id) => id !== targetUserId);
      return tx.table.update({
        where: { id: tableId },
        data: { pendingRequests: newPending },
      });
    });

    const hydrated = await getTableForNotifications(tableId);

    await createNotification({
      userId: targetUserId,
      type: 'table_update',
      title: 'Table request declined',
      body: `Your request to join "${hydrated?.name || 'a table'}" was declined.`,
      actionUrl: `/TableDetails?id=${tableId}`,
    });

    res.json({ success: true, table: formatTable(updated) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/**
 * Remove a member from a table (host/venue owner/staff).
 */
router.post('/:id/members/:userId/remove', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const tableId = req.params.id;
    const targetUserId = req.params.userId;

    const updated = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, deletedAt: null },
        include: { venue: true },
      });
      if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });

      const isHost = table.hostUserId === req.userId;
      const isVenueOwner = table.venue?.ownerUserId === req.userId;
      if (!isHost && !isVenueOwner && !isStaff(req.userRole)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }

      // Host cannot remove themselves via this endpoint
      if (table.hostUserId === targetUserId) {
        throw Object.assign(new Error('Cannot remove the host'), { status: 400 });
      }

      const members = Array.isArray(table.members) ? table.members : [];
      const newMembers = members.filter((m) => !((typeof m === 'object' && m?.user_id === targetUserId) || m === targetUserId));

      const pending = Array.isArray(table.pendingRequests) ? table.pendingRequests : [];
      const newPending = pending.filter((id) => id !== targetUserId);

      const nextCount = newMembers.length;
      const nextStatus =
        table.status === 'full' && nextCount < table.maxGuests ? 'open' : table.status;

      return tx.table.update({
        where: { id: tableId },
        data: {
          members: newMembers,
          pendingRequests: newPending,
          currentGuests: nextCount,
          status: nextStatus,
        },
      });
    });

    const hydrated = await getTableForNotifications(tableId);

    await createNotification({
      userId: targetUserId,
      type: 'table_update',
      title: 'Removed from table',
      body: `You were removed from "${hydrated?.name || 'a table'}".`,
      actionUrl: `/TableDetails?id=${tableId}`,
    });

    await createNotifications({
      userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
      type: 'table_update',
      title: 'Guest removed',
      body: `A guest was removed from "${hydrated?.name || 'a table'}".`,
      actionUrl: `/ManageTable?id=${tableId}`,
    });

    res.json({ success: true, table: formatTable(updated) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/**
 * Join a table — atomic capacity enforcement, no duplicate joins.
 * SECURITY: Uses DB transaction to prevent race conditions.
 */
router.post('/:id/join', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const tableId = req.params.id;
    const userId = req.userId;

    const result = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, deletedAt: null }
      });
      if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });
      if (table.status !== 'open') throw Object.assign(new Error('Table is not open'), { status: 409 });

      // SECURITY: prevent host from joining their own table as member
      if (table.hostUserId === userId) {
        throw Object.assign(new Error('Host cannot join their own table'), { status: 400 });
      }

      const members = Array.isArray(table.members) ? table.members : [];

      // SECURITY: no duplicate joins
      const alreadyMember = members.some(m =>
        (typeof m === 'object' && m?.user_id === userId) || m === userId
      );
      if (alreadyMember) throw Object.assign(new Error('Already a member of this table'), { status: 409 });

      // SECURITY: atomic capacity check
      if (table.currentGuests >= table.maxGuests) {
        throw Object.assign(new Error('Table is at full capacity'), { status: 409 });
      }

      const newMembers = [...members, { user_id: userId, joined_at: new Date().toISOString() }];
      const newCount = table.currentGuests + 1;
      const newStatus = newCount >= table.maxGuests ? 'full' : 'open';

      return tx.table.update({
        where: { id: tableId },
        data: { members: newMembers, currentGuests: newCount, status: newStatus }
      });
    });

    const hydrated = await getTableForNotifications(tableId);
    const joiningUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const joiningName = joiningUser?.fullName || 'Someone';

    await createNotifications({
      userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
      type: 'table_update',
      title: 'Guest joined a table',
      body: `${joiningName} joined "${hydrated?.name || 'a table'}".`,
      actionUrl: `/ManageTable?id=${tableId}`,
    });

    if (result.status === 'full') {
      await createNotifications({
        userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
        type: 'table_full',
        title: 'Table is fully booked',
        body: `"${hydrated?.name || 'A table'}" has reached max capacity.`,
        actionUrl: `/ManageTable?id=${tableId}`,
      });
    }

    await auditFromReq(req, {
      userId,
      action: 'TABLE_JOINED',
      entityType: 'table',
      entityId: tableId,
      metadata: { currentGuests: result.currentGuests, maxGuests: result.maxGuests }
    });

    logFriendActivity({
      userId,
      activityType: 'JOINED_TABLE',
      referenceId: tableId,
      referenceType: 'TABLE',
      description: 'joined a table',
    });
    if (hydrated?.eventId) await upsertConfirmedAttendance(userId, hydrated.eventId);

    res.json({ success: true, table: formatTable(result) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/**
 * Leave a table.
 */
router.post('/:id/leave', authenticateToken, requireVerified, requireIdentityVerified, async (req, res, next) => {
  try {
    const tableId = req.params.id;
    const userId = req.userId;

    const result = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findFirst({ where: { id: tableId, deletedAt: null } });
      if (!table) throw Object.assign(new Error('Table not found'), { status: 404 });

      const members = Array.isArray(table.members) ? table.members : [];
      const isMember = members.some(m =>
        (typeof m === 'object' && m?.user_id === userId) || m === userId
      );
      if (!isMember) throw Object.assign(new Error('Not a member of this table'), { status: 400 });

      const newMembers = members.filter(m =>
        !((typeof m === 'object' && m?.user_id === userId) || m === userId)
      );
      const newCount = Math.max(0, table.currentGuests - 1);
      const newStatus = table.status === 'full' ? 'open' : table.status;

      return tx.table.update({
        where: { id: tableId },
        data: { members: newMembers, currentGuests: newCount, status: newStatus }
      });
    });

    res.json({ success: true, table: formatTable(result) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const table = await prisma.table.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true }
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const isHost = table.hostUserId === req.userId;
    const isVenueOwner = table.venue?.ownerUserId === req.userId;
    if (!isHost && !isVenueOwner && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' }); // SECURITY: ownership check
    }

    const schema = z.object({
      name: z.string().min(1).max(200).optional(),
      status: z.enum(['open', 'full', 'closed']).optional(),
      max_guests: z.number().int().min(1).max(500).optional(),
      min_spend: z.number().min(0).optional(),
      joining_fee: z.number().min(0).optional(),
      is_public: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const data = parsed.data;

    const updates = {};
    if (data.name != null) updates.name = data.name;
    if (data.status != null) updates.status = data.status;
    if (data.max_guests != null) updates.maxGuests = data.max_guests;
    if (data.min_spend != null) updates.minSpend = data.min_spend;
    if (data.joining_fee != null) updates.joiningFee = data.joining_fee;
    if (data.is_public !== undefined) updates.isPublic = data.is_public;

    const updated = await prisma.table.update({ where: { id: table.id }, data: updates });

    // Notifications: table closed -> notify members + pending + host + venue owner
    if (data.status === 'closed' && table.status !== 'closed') {
      const hydrated = await getTableForNotifications(table.id);
      const memberIds = extractUserIdsFromMembers(table.members);
      const pendingIds = extractUserIdsFromPending(table.pendingRequests);
      const audienceIds = [...new Set([...memberIds, ...pendingIds])];

      await createNotifications({
        userIds: audienceIds,
        type: 'table_update',
        title: 'Table closed',
        body: `"${hydrated?.name || 'A table'}" is now closed.`,
        actionUrl: `/TableDetails?id=${table.id}`,
      });

      await createNotifications({
        userIds: [hydrated?.hostUserId, hydrated?.venue?.ownerUserId],
        type: 'table_update',
        title: 'Table closed',
        body: `"${hydrated?.name || 'A table'}" was closed. Members/pending have been notified.`,
        actionUrl: `/ManageTable?id=${table.id}`,
      });
    }

    res.json(formatTable(updated));
  } catch (err) {
    next(err);
  }
});

export default router;
