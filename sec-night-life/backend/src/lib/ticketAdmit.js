import bcrypt from 'bcrypt';
import { prisma } from './prisma.js';
import { isStaff } from './access.js';
import { buildTicketDoorContext } from './ticketDoorContext.js';
import { ticketExpiresAtFromRow } from './ticketHelpers.js';

/**
 * Resolve event row used for optional door PIN (first linked event on ticket).
 */
export async function resolveEventForDoorPin(tx, ticket) {
  if (ticket.eventId) {
    return tx.event.findFirst({
      where: { id: ticket.eventId, deletedAt: null },
      select: { id: true, doorCheckPinHash: true },
    });
  }
  if (ticket.hostedTableId) {
    const ht = await tx.hostedTable.findUnique({
      where: { id: ticket.hostedTableId },
      select: { eventId: true },
    });
    if (ht?.eventId) {
      return tx.event.findFirst({
        where: { id: ht.eventId, deletedAt: null },
        select: { id: true, doorCheckPinHash: true },
      });
    }
  }
  if (ticket.tableId) {
    const tb = await tx.table.findFirst({
      where: { id: ticket.tableId, deletedAt: null },
      select: { eventId: true },
    });
    if (tb?.eventId) {
      return tx.event.findFirst({
        where: { id: tb.eventId, deletedAt: null },
        select: { id: true, doorCheckPinHash: true },
      });
    }
  }
  if (ticket.venueTableId) {
    const vt = await tx.venueTable.findUnique({
      where: { id: ticket.venueTableId },
      select: { eventId: true },
    });
    if (vt?.eventId) {
      return tx.event.findFirst({
        where: { id: vt.eventId, deletedAt: null },
        select: { id: true, doorCheckPinHash: true },
      });
    }
  }
  return null;
}

export async function assertAdmitPermission(tx, staffUserId, staffRole, ticket, door) {
  if (!staffUserId) return { ok: false, reason: 'Not signed in' };
  if (isStaff(staffRole)) return { ok: true };

  if (door?.venue_id) {
    const v = await tx.venue.findFirst({
      where: { id: door.venue_id, deletedAt: null },
      select: { ownerUserId: true },
    });
    if (v?.ownerUserId === staffUserId) return { ok: true };
  }

  if (ticket.housePartyId) {
    const hp = await tx.houseParty.findUnique({
      where: { id: ticket.housePartyId },
      select: { hostUserId: true },
    });
    if (hp?.hostUserId === staffUserId) return { ok: true };
  }

  if (ticket.hostedTableId) {
    const ht = await tx.hostedTable.findUnique({
      where: { id: ticket.hostedTableId },
      select: { hostUserId: true },
    });
    if (ht?.hostUserId === staffUserId) return { ok: true };
  }

  if (ticket.tableId) {
    const tb = await tx.table.findFirst({
      where: { id: ticket.tableId, deletedAt: null },
      select: { hostUserId: true },
    });
    if (tb?.hostUserId === staffUserId) return { ok: true };
  }

  return { ok: false, reason: 'You are not allowed to admit this ticket (venue owner, table host, party host, or staff only).' };
}

export async function verifyDoorPinIfRequired(ev, plainPin) {
  if (!ev?.doorCheckPinHash) return { ok: true };
  if (plainPin == null || String(plainPin).trim() === '') {
    return { ok: false, reason: 'This event requires a door PIN to record entry.' };
  }
  const match = await bcrypt.compare(String(plainPin).trim(), ev.doorCheckPinHash);
  if (!match) return { ok: false, reason: 'Invalid door PIN' };
  return { ok: true };
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient | typeof prisma} tx
 */
export async function admitTicketTx(tx, { ticketId, staffUserId, staffRole, plainPin }) {
  const t = await tx.ticket.findUnique({ where: { id: ticketId } });
  if (!t) return { ok: false, status: 404, error: 'Ticket not found' };

  const now = new Date();
  if (ticketExpiresAtFromRow(t) <= now) {
    return { ok: false, status: 410, error: 'Ticket expired' };
  }
  if (t.admittedAt) {
    return {
      ok: false,
      status: 409,
      error: 'Already admitted',
      admitted_at: t.admittedAt,
    };
  }

  const door = await buildTicketDoorContext(tx, t);
  const perm = await assertAdmitPermission(tx, staffUserId, staffRole, t, door);
  if (!perm.ok) return { ok: false, status: 403, error: perm.reason };

  const ev = await resolveEventForDoorPin(tx, t);
  const pinRes = await verifyDoorPinIfRequired(ev, plainPin);
  if (!pinRes.ok) return { ok: false, status: 403, error: pinRes.reason };

  const eventIdForAttendance = t.eventId || ev?.id || null;

  await tx.ticket.update({
    where: { id: t.id },
    data: {
      admittedAt: now,
      admittedByUserId: staffUserId,
    },
  });

  if (eventIdForAttendance && t.userId) {
    await tx.eventAttendance.upsert({
      where: {
        eventId_userId: { eventId: eventIdForAttendance, userId: t.userId },
      },
      create: {
        eventId: eventIdForAttendance,
        userId: t.userId,
        confirmed: true,
        checkedIn: true,
      },
      update: { checkedIn: true, confirmed: true },
    });
  }

  return {
    ok: true,
    status: 200,
    admitted_at: now,
    event_id: eventIdForAttendance,
  };
}
