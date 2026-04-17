import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = Router();

function requireVenueOwner(req, res) {
  if (req.userRole !== 'VENUE') {
    res.status(403).json({ error: 'Business owner account required' });
    return false;
  }
  return true;
}

async function assertVenueOwnedByUser(venueId, userId) {
  return prisma.venue.findFirst({ where: { id: venueId, ownerUserId: userId, deletedAt: null } });
}

async function initializePaystackPayment({ userId, amountZar, metadata }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('Paystack is not configured');
  const reference = crypto.randomBytes(16).toString('hex');
  const email = user?.email || 'user@secnightlife.app';
  await prisma.payment.create({
    data: { userId, email, amount: amountZar, reference, status: 'pending', type: 'other', metadata: { user_id: userId, ...metadata } },
  });
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      amount: Math.round(amountZar * 100),
      reference,
      metadata: { user_id: userId, ...metadata },
      callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) throw new Error(data?.message || 'Could not initialize payment');
  return { reference, authorization_url: data.data.authorization_url, access_code: data.data.access_code };
}

const createTableSchema = z.object({
  venueId: z.string().min(1),
  eventId: z.string().optional().nullable(),
  tableName: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().nullable(),
  guestCapacity: z.number().int().min(1).max(100),
  minimumSpend: z.number().min(50),
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const parsed = createTableSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    const owned = await assertVenueOwnedByUser(d.venueId, req.userId);
    if (!owned) return res.status(403).json({ error: 'Forbidden' });
    if (d.eventId) {
      const event = await prisma.event.findFirst({ where: { id: d.eventId, venueId: d.venueId, deletedAt: null } });
      if (!event) return res.status(404).json({ error: 'Event not found' });
    }
    const table = await prisma.venueTable.create({
      data: {
        venueId: d.venueId,
        eventId: d.eventId ?? null,
        tableName: d.tableName,
        description: d.description ?? null,
        guestCapacity: d.guestCapacity,
        minimumSpend: d.minimumSpend,
        amountContributed: 0,
        currentOccupancy: 0,
        status: 'AVAILABLE',
        isActive: true,
      },
    });
    res.status(201).json(table);
  } catch (e) {
    next(e);
  }
});

router.post('/:tableId/menu-items', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const items = z.array(z.object({
      name: z.string().trim().min(1),
      category: z.string().trim().min(1),
      price: z.number().min(1),
      isAvailable: z.boolean().optional(),
    })).min(1).parse(req.body || []);
    const table = await prisma.venueTable.findUnique({ where: { id: req.params.tableId }, include: { venue: true } });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.venueTableMenuItem.createMany({
      data: items.map((i) => ({ venueTableId: table.id, name: i.name, category: i.category, price: i.price, isAvailable: i.isAvailable ?? true })),
    });
    const all = await prisma.venueTableMenuItem.findMany({ where: { venueTableId: table.id } });
    res.status(201).json(all);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.patch('/:tableId/menu-items/:itemId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const payload = z.object({
      name: z.string().trim().min(1).optional(),
      category: z.string().trim().min(1).optional(),
      price: z.number().min(1).optional(),
      isAvailable: z.boolean().optional(),
    }).parse(req.body || {});
    const item = await prisma.venueTableMenuItem.findFirst({
      where: { id: req.params.itemId, venueTableId: req.params.tableId },
      include: { venueTable: { include: { venue: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    if (item.venueTable.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const updated = await prisma.venueTableMenuItem.update({ where: { id: item.id }, data: payload });
    res.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.delete('/:tableId/menu-items/:itemId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const item = await prisma.venueTableMenuItem.findFirst({
      where: { id: req.params.itemId, venueTableId: req.params.tableId },
      include: { venueTable: { include: { venue: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    if (item.venueTable.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.venueTableMenuItem.delete({ where: { id: item.id } });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.get('/venue/:venueId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const owned = await assertVenueOwnedByUser(req.params.venueId, req.userId);
    if (!owned) return res.status(403).json({ error: 'Forbidden' });
    const tables = await prisma.venueTable.findMany({
      where: { venueId: req.params.venueId },
      include: { menuItems: true, _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const out = tables.map((t) => ({
      ...t,
      memberCount: t._count.members,
      progressPercentage: t.minimumSpend > 0 ? Number(((t.amountContributed / t.minimumSpend) * 100).toFixed(1)) : 0,
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

router.get('/available', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(10, parseInt(req.query.limit) || 10);
    const rows = await prisma.venueTable.findMany({
      where: {
        isActive: true,
        status: { in: ['AVAILABLE', 'PARTIALLY_FILLED'] },
      },
      include: {
        venue: { select: { id: true, name: true, city: true, venueType: true, coverImageUrl: true } },
        event: { select: { id: true, title: true, date: true } },
        menuItems: { where: { isAvailable: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const availableRows = rows.filter((t) => t.currentOccupancy < t.guestCapacity);
    const paged = availableRows.slice((page - 1) * limit, page * limit);
    res.json({
      items: paged.map((t) => ({
        ...t,
        spotsRemaining: Math.max(0, t.guestCapacity - t.currentOccupancy),
        progressPercentage: t.minimumSpend > 0 ? Number(((t.amountContributed / t.minimumSpend) * 100).toFixed(1)) : 0,
      })),
      page,
      limit,
      total: availableRows.length,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:tableId', optionalAuth, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: {
        venue: { select: { id: true, name: true, city: true, venueType: true, coverImageUrl: true } },
        event: { select: { id: true, title: true, date: true } },
        menuItems: true,
        members: {
          where: { status: 'CONFIRMED' },
          include: { user: { select: { id: true, fullName: true, userProfile: { select: { username: true, avatarUrl: true } } } } },
        },
      },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json({
      ...table,
      spotsRemaining: Math.max(0, table.guestCapacity - table.currentOccupancy),
      progressPercentage: table.minimumSpend > 0 ? Number(((table.amountContributed / table.minimumSpend) * 100).toFixed(1)) : 0,
      members: table.members.map((m) => ({ id: m.id, userId: m.userId, avatarUrl: m.user.userProfile?.avatarUrl || null, username: m.user.userProfile?.username || m.user.fullName || 'member' })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:tableId/join', authenticateToken, async (req, res, next) => {
  try {
    if (!['USER', 'VENUE'].includes(req.userRole)) return res.status(403).json({ error: 'Forbidden' });
    const payload = z.object({
      selectedMenuItems: z.array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(1) })).min(1),
    }).parse(req.body || {});
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: { venue: true, menuItems: true },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (!['AVAILABLE', 'PARTIALLY_FILLED'].includes(table.status) || !table.isActive) return res.status(400).json({ error: 'Table not available' });
    if (table.currentOccupancy >= table.guestCapacity) return res.status(400).json({ error: 'Table is full' });
    if (table.venue.ownerUserId === req.userId) return res.status(403).json({ error: 'Venue owners cannot join their own table' });
    const existing = await prisma.venueTableMember.findUnique({ where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } } });
    if (existing && existing.status !== 'LEFT') return res.status(400).json({ error: 'Already joined' });

    const menuMap = new Map(table.menuItems.map((i) => [i.id, i]));
    let total = 0;
    for (const sel of payload.selectedMenuItems) {
      const item = menuMap.get(sel.menuItemId);
      if (!item || item.venueTableId !== table.id || !item.isAvailable) {
        return res.status(400).json({ error: 'Invalid menu item selection' });
      }
      total += item.price * sel.quantity;
    }
    if (total <= 0) return res.status(400).json({ error: 'Invalid contribution total' });

    const member = await prisma.venueTableMember.upsert({
      where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
      create: { venueTableId: table.id, userId: req.userId, selectedMenuItems: payload.selectedMenuItems, status: 'PENDING_PAYMENT' },
      update: { selectedMenuItems: payload.selectedMenuItems, status: 'PENDING_PAYMENT' },
    });
    const pay = await initializePaystackPayment({
      userId: req.userId,
      amountZar: total,
      metadata: {
        type: 'VENUE_TABLE_JOIN',
        venueTableId: table.id,
        venueId: table.venueId,
        venueTableMemberId: member.id,
        selectedMenuItems: payload.selectedMenuItems,
      },
    });
    res.status(201).json({ ...pay, memberId: member.id, amount: total });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.delete('/:tableId/join', authenticateToken, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({ where: { id: req.params.tableId } });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    const member = await prisma.venueTableMember.findUnique({
      where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
    });
    if (!member || member.status !== 'CONFIRMED') return res.status(400).json({ error: 'Only confirmed members can leave' });

    const nextOccupancy = Math.max(0, table.currentOccupancy - 1);
    const nextStatus =
      table.status === 'LOCKED' && table.amountContributed >= table.minimumSpend
        ? 'LOCKED'
        : (nextOccupancy > 0 || table.amountContributed > 0 ? 'PARTIALLY_FILLED' : 'AVAILABLE');
    await prisma.$transaction([
      prisma.venueTableMember.update({ where: { id: member.id }, data: { status: 'LEFT' } }),
      prisma.venueTable.update({ where: { id: table.id }, data: { currentOccupancy: { decrement: 1 }, status: nextStatus } }),
    ]);
    res.json({ left: true, refund: false });
  } catch (e) {
    next(e);
  }
});

export default router;
