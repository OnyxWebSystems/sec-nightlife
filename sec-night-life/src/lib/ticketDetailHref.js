import { createPageUrl } from '@/utils';
import { hostedListingDetailsPath } from '@/lib/hostedListingUrl';

/**
 * Profile / ticket history link to the correct table or event detail page.
 */
export function ticketDetailHrefFromTicket(ticket) {
  if (!ticket) return createPageUrl('Profile');
  const kind = ticket.kind;

  if (kind === 'EVENT_TICKET') {
    if (ticket.event_id) return createPageUrl(`EventDetails?id=${ticket.event_id}`);
  }
  if (kind === 'HOUSE_PARTY' && ticket.house_party_id) {
    return createPageUrl(`HouseParty?id=${ticket.house_party_id}`);
  }

  if (
    ticket.hosted_table_id &&
    (kind === 'HOSTED_TABLE_JOIN' || kind === 'TABLE_HOST_FEE' || kind === 'VENUE_TABLE_JOIN' || kind === 'EXTERNAL_HOSTED_LISTING')
  ) {
    return hostedListingDetailsPath({
      id: ticket.hosted_table_id,
      listingSurface: ticket.listing_surface || ticket.listingSurface,
      is_community_event: ticket.is_community_event,
    });
  }

  if (kind === 'VENUE_TABLE_JOIN' && ticket.venue_table_id) {
    return createPageUrl(`TableDetails?id=${ticket.venue_table_id}&source=venue`);
  }

  if (ticket.hosted_table_id) {
    return hostedListingDetailsPath({
      id: ticket.hosted_table_id,
      listingSurface: ticket.listing_surface || ticket.listingSurface,
      is_community_event: ticket.is_community_event,
    });
  }
  if (ticket.venue_table_id) {
    return createPageUrl(`TableDetails?id=${ticket.venue_table_id}&source=venue`);
  }
  if (ticket.event_id) return createPageUrl(`EventDetails?id=${ticket.event_id}`);
  if (ticket.table_id) return createPageUrl(`TableDetails?id=${ticket.table_id}`);
  return createPageUrl('Profile');
}

export function tableHistoryDetailHref(row) {
  if (!row) return null;
  if (row.hostedTableId) {
    return hostedListingDetailsPath({
      id: row.hostedTableId,
      listingSurface: row.listingSurface || row.listing_surface,
      is_community_event: row.is_community_event || row.isCommunityHosted,
    });
  }
  if (row.venueTableId) {
    return createPageUrl(`TableDetails?id=${row.venueTableId}&source=venue`);
  }
  if (row.tableId) return createPageUrl(`TableDetails?id=${row.tableId}`);
  if (row.eventId) return createPageUrl(`EventDetails?id=${row.eventId}`);
  return null;
}
