import {
  resolveBusinessVenueScope,
  staffCtxFromQuery,
  venueIdFromQuery,
} from './access.js';

/**
 * Optional venue filter for notification list/unread/read-all.
 * When venue_id or staff_ctx is provided, returns Prisma where fragment:
 *   { OR: [{ venueId: null }, { venueId: { in: scopedIds } }] }
 * Personal/global notifications (venueId null) remain visible alongside venue-specific ones.
 */
export async function buildNotificationVenueWhere(userId, query = {}) {
  const venueIdFilter = venueIdFromQuery(query);
  const staffCtx = staffCtxFromQuery(query);
  if (!venueIdFilter && !staffCtx) return { ok: true, where: null };

  const scope = await resolveBusinessVenueScope(userId, {
    venueIdFilter,
    staffCtx,
    permission: null,
  });
  if (!scope.ok) return { ok: false, status: scope.status || 403, error: scope.error || 'Forbidden' };
  if (!scope.venueIds.length) {
    return { ok: false, status: 404, error: 'Venue not found' };
  }

  return {
    ok: true,
    where: {
      OR: [{ venueId: null }, { venueId: { in: scope.venueIds } }],
    },
  };
}
