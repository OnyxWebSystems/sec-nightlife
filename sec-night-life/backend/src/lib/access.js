/**
 * Access control and venue isolation helpers.
 * Prevents IDOR and enforces strict venue scoping for VENUE role.
 */
import { prisma } from './prisma.js';

const STAFF_ROLES = ['ADMIN', 'MODERATOR'];

export function isStaff(role) {
  return role && STAFF_ROLES.includes(role);
}

export async function getVenueIdsForUser(userId, userRole) {
  if (!userId || !userRole) return [];
  if (isStaff(userRole)) return null; // null = can access all
  if (userRole !== 'VENUE') return [];
  const venues = await prisma.venue.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    select: { id: true }
  });
  return venues.map((v) => v.id);
}

/**
 * Asserts user owns the venue. Throws/returns 403 if not.
 * Staff (ADMIN/MODERATOR) bypass.
 */
export async function assertVenueOwnership(venueId, userId, userRole) {
  if (isStaff(userRole)) return;
  if (!venueId || !userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null }
  });
  if (!venue || venue.ownerUserId !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

/**
 * For VENUE role: enforce that venue_id is one they own.
 * Returns true if allowed, false otherwise.
 */
export async function canAccessVenue(venueId, userId, userRole) {
  if (!venueId) return true;
  if (isStaff(userRole)) return true;
  if (userRole !== 'VENUE') return true; // USER/FREELANCER can query any venue (public data)
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, ownerUserId: userId, deletedAt: null }
  });
  return !!venue;
}

/**
 * Add venue filter for VENUE role to where clause.
 * Mutates where. Returns modified where.
 */
export async function applyVenueIsolation(where, userId, userRole, explicitVenueId = null) {
  if (!userId || !userRole) return where;
  if (isStaff(userRole)) return where;
  if (userRole !== 'VENUE') return where;
  const venueIds = await getVenueIdsForUser(userId, userRole);
  if (venueIds.length === 0) {
    where.id = 'none';
    return where;
  }
  if (explicitVenueId && !venueIds.includes(explicitVenueId)) {
    where.id = 'none';
    return where;
  }
  where.venueId = explicitVenueId ? explicitVenueId : { in: venueIds };
  return where;
}

/**
 * For events/tables/jobs: apply venue isolation.
 * explicitVenueId: if provided and user is VENUE, must own it; else filter to own venues only.
 */
export async function applyEventVenueIsolation(where, userId, userRole, explicitVenueId = null) {
  return applyVenueIsolation(where, userId, userRole, explicitVenueId);
}
export async function applyTableVenueIsolation(where, userId, userRole, explicitVenueId = null) {
  return applyVenueIsolation(where, userId, userRole, explicitVenueId);
}
export async function applyJobVenueIsolation(where, userId, userRole, explicitVenueId = null) {
  return applyVenueIsolation(where, userId, userRole, explicitVenueId);
}

/**
 * Verify user can access a table (host, member, or venue owner).
 */
export async function canAccessTable(tableId, userId, userRole) {
  if (!userId) return false;
  if (isStaff(userRole)) return true;
  const table = await prisma.table.findFirst({
    where: { id: tableId, deletedAt: null },
    include: { venue: true }
  });
  if (!table) return false;
  if (table.hostUserId === userId) return true;
  if (table.venue?.ownerUserId === userId) return true;
  const members = Array.isArray(table.members) ? table.members : [];
  const memberIds = members.map((m) => (typeof m === 'object' && m && m.user_id ? m.user_id : m)).filter(Boolean);
  if (memberIds.includes(userId)) return true;
  return false;
}
