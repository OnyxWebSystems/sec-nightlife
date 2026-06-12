/**
 * Access control and venue isolation helpers.
 * Prevents IDOR and enforces strict venue scoping for owners and assigned staff.
 */
import { prisma } from './prisma.js';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

export const VENUE_STAFF_PERMISSION_KEYS = [
  'dashboard',
  'analytics',
  'bookings',
  'promotions',
  'events',
  'menu',
  'jobs',
  'posts',
  'messages',
  'venue_page',
];

export function isStaff(role) {
  return role && STAFF_ROLES.includes(role);
}

/** Party-goer-style accounts that may join or pay for venue/hosted tables. */
export function canJoinTablesAsGuest(role) {
  if (!role) return false;
  if (['USER', 'VENUE', 'FREELANCER'].includes(role)) return true;
  return isStaff(role);
}

export function parseStaffPermissions(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export async function isVenueOwner(userId, venueId) {
  if (!userId || !venueId) return false;
  const venue = await prisma.venue.findFirst({
    where: { id: String(venueId), deletedAt: null, ownerUserId: userId },
    select: { id: true },
  });
  return !!venue;
}

export async function getStaffAssignmentsForUser(userId) {
  if (!userId) return [];
  return prisma.venueStaffAssignment.findMany({
    where: { userId, revokedAt: null },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          suburb: true,
          province: true,
          latitude: true,
          longitude: true,
          venueType: true,
          coverImageUrl: true,
          logoUrl: true,
          ownerUserId: true,
          isVerified: true,
          complianceStatus: true,
          rating: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Owner always passes. Staff pass only when they hold the specific permission key.
 */
export async function staffHasVenuePermission(userId, venueId, permission = null) {
  if (!userId || !venueId) return false;
  if (await isVenueOwner(userId, venueId)) return true;

  const row = await prisma.venueStaffAssignment.findFirst({
    where: { venueId: String(venueId), userId, revokedAt: null },
    select: { permissions: true },
  });
  if (!row) return false;

  const perms = parseStaffPermissions(row.permissions);
  if (!permission) return Object.values(perms).some(Boolean);
  if (perms[permission] === true) return true;
  if (permission === 'posts' && perms.promotions === true) return true;
  return false;
}

/** Venue IDs the user owns or may access with an optional permission key. */
export async function resolveAccessibleVenueIds(userId, { venueIdFilter = null, permission = null } = {}) {
  if (!userId) return [];

  const [ownedVenues, staffRows] = await Promise.all([
    prisma.venue.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      select: { id: true },
    }),
    prisma.venueStaffAssignment.findMany({
      where: { userId, revokedAt: null },
      select: { venueId: true, permissions: true },
    }),
  ]);

  const ids = new Set(ownedVenues.map((v) => v.id));
  for (const row of staffRows) {
    const perms = parseStaffPermissions(row.permissions);
    if (!permission) {
      if (Object.values(perms).some(Boolean)) ids.add(row.venueId);
      continue;
    }
    if (perms[permission] === true) {
      ids.add(row.venueId);
      continue;
    }
    if (permission === 'posts' && perms.promotions === true) ids.add(row.venueId);
  }

  const allIds = [...ids];
  if (venueIdFilter) {
    return allIds.includes(String(venueIdFilter)) ? [String(venueIdFilter)] : [];
  }
  return allIds;
}

export async function assertVenueBusinessAccess(userId, venueId, permission = null) {
  const ok = await staffHasVenuePermission(userId, venueId, permission);
  if (!ok) {
    throw Object.assign(new Error('Venue not found or access denied'), { status: 403 });
  }
}

export async function getVenueIdsForUser(userId, userRole) {
  if (!userId || !userRole) return [];
  if (isStaff(userRole)) return null;
  return resolveAccessibleVenueIds(userId);
}

/**
 * Asserts user owns the venue. Throws/returns 403 if not.
 * Staff (SUPER_ADMIN/ADMIN/MODERATOR) bypass.
 */
export async function assertVenueOwnership(venueId, userId, userRole) {
  if (isStaff(userRole)) return;
  if (!venueId || !userId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
  });
  if (!venue || venue.ownerUserId !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

/**
 * Owner or assigned venue staff (any permission) may access venue-scoped business data.
 */
export async function canAccessVenue(venueId, userId, userRole) {
  if (!venueId) return true;
  if (isStaff(userRole)) return true;
  if (!userId) return true;
  return staffHasVenuePermission(userId, venueId, null);
}

/**
 * Add venue filter for business users to where clause.
 */
export async function applyVenueIsolation(where, userId, userRole, explicitVenueId = null) {
  if (!userId || !userRole) return where;
  if (isStaff(userRole)) return where;

  const venueIds = await getVenueIdsForUser(userId, userRole);
  if (venueIds === null) return where;
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
 * Verify user can access a table (host, member, or venue owner/staff).
 */
export async function canAccessTable(tableId, userId, userRole) {
  if (!userId) return false;
  if (isStaff(userRole)) return true;
  const table = await prisma.table.findFirst({
    where: { id: tableId, deletedAt: null },
    include: { venue: true },
  });
  if (!table) return false;
  if (table.hostUserId === userId) return true;
  if (table.venue?.id && (await staffHasVenuePermission(userId, table.venue.id, 'bookings'))) {
    return true;
  }
  if (table.venue?.ownerUserId === userId) return true;
  const members = Array.isArray(table.members) ? table.members : [];
  const memberIds = members.map((m) => (typeof m === 'object' && m && m.user_id ? m.user_id : m)).filter(Boolean);
  if (memberIds.includes(userId)) return true;
  return false;
}
