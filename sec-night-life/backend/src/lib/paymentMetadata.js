function isObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function flattenPaymentMetadata(value) {
  if (!isObjectRecord(value)) return {};
  const nested = isObjectRecord(value.metadata) ? value.metadata : {};
  return { ...nested, ...value };
}

export function basePaymentReference(ref) {
  const s = String(ref || '');
  const idx = s.indexOf(':');
  return idx >= 0 ? s.slice(0, idx) : s;
}

export function isTicketPaymentMeta(meta, paymentType = null) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const t = String(m.type || paymentType || '');
  if (t === 'ticket' || paymentType === 'ticket') return true;
  if (t.includes('TICKET')) return true;
  if (t === 'event') return true;
  const eventId = m.event_id ?? m.eventId;
  const tier = m.ticket_tier_name ?? m.ticketTierName;
  return Boolean(eventId && tier);
}

/** Host / custom-table checkout via venue inventory (creates a hosted table). */
export function isHostedTableVenuePayment(meta) {
  if (!isObjectRecord(meta)) return false;
  const bookingMode = meta.booking_mode || meta.bookingMode;
  if (bookingMode === 'host' || bookingMode === 'custom_host') return true;
  if (meta.hosted_table_id || meta.hostedTableId) return true;
  const memberRole = meta.member_role || meta.memberRole;
  return memberRole === 'HOST';
}

export function classifyVenuePaymentRevenue(mtype, pType, amount, counters, metadata = null) {
  const t = String(mtype || '');
  const amt = Number(amount) || 0;
  const meta = isObjectRecord(metadata) ? metadata : {};

  if (
    t === 'TABLE_HOST_FEE' ||
    t === 'HOSTED_TABLE_EXTERNAL_LISTING' ||
    t === 'HOSTED_TABLE_JOIN' ||
    t === 'HOSTED_TABLE_MENU' ||
    isHostedTableVenuePayment(meta)
  ) {
    counters.hostedTablePaymentZar += amt;
  } else if (t === 'TABLE_CHECKOUT' || t === 'VENUE_TABLE_JOIN' || t === 'table') {
    counters.venueTablePaymentZar += amt;
  } else if (isTicketPaymentMeta({ type: t }, pType)) {
    counters.ticketPaymentZar += amt;
  } else if (
    t === 'TABLE_BOOST' ||
    t === 'HOUSE_PARTY_ENTRANCE' ||
    t === 'HOUSE_PARTY_PUBLISH' ||
    t === 'HOUSE_PARTY_BOOST' ||
    t === 'promotion' ||
    t === 'BOOST'
  ) {
    counters.otherPaymentZar += amt;
  } else {
    counters.otherPaymentZar += amt;
  }
}
