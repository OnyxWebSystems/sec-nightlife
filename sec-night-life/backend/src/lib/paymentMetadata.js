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

/** Suffix on payout ledger paymentReference: join / menu / entrance. */
export function ledgerPaymentComponent(ref) {
  const s = String(ref || '');
  const idx = s.indexOf(':');
  if (idx < 0) return null;
  const suffix = s.slice(idx + 1);
  if (suffix === 'join' || suffix === 'menu' || suffix === 'entrance') return suffix;
  return null;
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

const TABLE_PAYMENT_TYPES = new Set([
  'TABLE_CHECKOUT',
  'VENUE_TABLE_JOIN',
  'table',
  'HOSTED_TABLE_MENU',
  'HOSTED_TABLE_JOIN',
]);

/** Day booking payment (venue table with no linked event). */
export function isDayBookingPayment(meta) {
  if (!isObjectRecord(meta)) return false;
  if (meta.is_day_booking === true) return true;
  const eventId = meta.event_id ?? meta.eventId;
  if (eventId) return false;
  const t = String(meta.type || '');
  return TABLE_PAYMENT_TYPES.has(t);
}

/** Day-booking host checkout (venue slot, no event). */
export function isDayBookingHostPayment(meta) {
  if (!isObjectRecord(meta)) return false;
  const eventId = meta.event_id ?? meta.eventId;
  if (eventId) return false;
  const bookingMode = meta.booking_mode || meta.bookingMode;
  const memberRole = meta.member_role || meta.memberRole;
  const isHost =
    bookingMode === 'host' ||
    bookingMode === 'custom_host' ||
    memberRole === 'HOST';
  if (!isHost) return false;
  const t = String(meta.type || '');
  return t === 'TABLE_CHECKOUT' || t === 'VENUE_TABLE_JOIN' || t === 'table';
}

/** Hosted-table guest join at a day-booking or event table. */
export function isHostedTableGuestJoinPayment(meta) {
  if (!isObjectRecord(meta)) return false;
  if (String(meta.type || '') !== 'HOSTED_TABLE_JOIN') return false;
  if (isDayBookingHostPayment(meta)) return false;
  const bookingMode = meta.booking_mode || meta.bookingMode;
  const memberRole = meta.member_role || meta.memberRole;
  if (bookingMode === 'join' || memberRole === 'GUEST') return true;
  return true;
}

/** Day-booking guest join (no event). */
export function isDayBookingGuestPayment(meta) {
  if (!isDayBookingPayment(meta)) return false;
  if (isDayBookingHostPayment(meta)) return false;
  if (isHostedTableGuestJoinPayment(meta)) return true;
  const bookingMode = meta.booking_mode || meta.bookingMode;
  const memberRole = meta.member_role || meta.memberRole;
  if (bookingMode === 'join' || memberRole === 'GUEST') return true;
  const t = String(meta.type || '');
  return t === 'TABLE_CHECKOUT' || t === 'VENUE_TABLE_JOIN' || t === 'table';
}

/** Guest join fee on an unhosted venue slot (revenue to venue, not host). */
export function isVenueDirectDayBookingJoinPayment(meta) {
  if (!isDayBookingPayment(meta)) return false;
  if (String(meta.type || '') === 'HOSTED_TABLE_JOIN') return false;
  if (isDayBookingHostPayment(meta)) return false;
  const bookingMode = meta.booking_mode || meta.bookingMode;
  const memberRole = meta.member_role || meta.memberRole;
  if (bookingMode === 'host' || bookingMode === 'custom_host' || memberRole === 'HOST') return false;
  const t = String(meta.type || '');
  return t === 'TABLE_CHECKOUT' || t === 'VENUE_TABLE_JOIN' || t === 'table';
}

/** Join fee component paid directly to the venue on unhosted day-booking slots. */
export function venueDirectJoinFeeZar(meta) {
  if (!isObjectRecord(meta)) return 0;
  const fromField = Number(meta.booking_fee_zar ?? meta.bookingFeeZar ?? 0) || 0;
  if (fromField > 0) return fromField;
  const lines = Array.isArray(meta.lines) ? meta.lines : [];
  const line = lines.find((l) => l && l.code === 'booking_fee');
  return line ? Number(line.amount_zar || line.amountZar || 0) || 0 : 0;
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

export function createEmptyRevenueCounters() {
  return {
    ticketPaymentZar: 0,
    ticketPaymentNetZar: 0,
    hostedTablePaymentZar: 0,
    hostedTablePaymentNetZar: 0,
    dayBookingHostPaymentZar: 0,
    dayBookingHostPaymentNetZar: 0,
    dayBookingGuestPaymentZar: 0,
    dayBookingGuestPaymentNetZar: 0,
    dayBookingMenuPaymentZar: 0,
    dayBookingMenuPaymentNetZar: 0,
    dayBookingVenueJoinFeeVolumeZar: 0,
    dayBookingOtherPaymentZar: 0,
    dayBookingOtherPaymentNetZar: 0,
    venueTablePaymentZar: 0,
    venueTablePaymentNetZar: 0,
    otherPaymentZar: 0,
    otherPaymentNetZar: 0,
  };
}

/** @param {'all'|'events'|'day_bookings'} scope */
export function paymentMatchesRevenueScope(meta, scope) {
  if (scope === 'all') return true;
  const m = isObjectRecord(meta) ? meta : {};
  const isDay = isDayBookingPayment(m);
  const hasEvent = Boolean(m.event_id ?? m.eventId);

  if (scope === 'day_bookings') return isDay;
  if (scope === 'events') {
    if (isDay) return false;
    if (hasEvent) return true;
    if (isTicketPaymentMeta(m, m.type)) return true;
    if (isHostedTableVenuePayment(m)) return true;
    const t = String(m.type || '');
    return t === 'HOSTED_TABLE_JOIN' || t === 'TABLE_HOST_FEE' || t === 'HOSTED_TABLE_EXTERNAL_LISTING';
  }
  return true;
}

function bumpCounter(counters, grossKey, netKey, gross, net) {
  counters[grossKey] = (counters[grossKey] || 0) + (Number(gross) || 0);
  counters[netKey] = (counters[netKey] || 0) + (Number(net) || 0);
}

function isDayBookingMenuPayment(meta, mtype, ledgerRef) {
  const component = ledgerPaymentComponent(ledgerRef);
  if (component === 'menu') return isDayBookingPayment(meta);
  const t = String(mtype || meta?.type || '');
  return t === 'HOSTED_TABLE_MENU' && isDayBookingPayment(meta);
}

/**
 * Classify revenue into buckets with gross + net amounts.
 * @param {'all'|'events'|'day_bookings'} revenueScope
 * @param {string|null} [ledgerRef] - full payout ledger paymentReference (may include :menu suffix)
 */
export function classifyVenuePaymentRevenueScoped(
  mtype,
  pType,
  gross,
  net,
  counters,
  metadata = null,
  revenueScope = 'all',
  ledgerRef = null,
) {
  const meta = isObjectRecord(metadata) ? metadata : {};
  if (!paymentMatchesRevenueScope(meta, revenueScope)) return;

  const g = Number(gross) || 0;
  const n = net != null ? Number(net) || 0 : g;
  const t = String(mtype || '');

  if (revenueScope === 'day_bookings') {
    if (isDayBookingHostPayment(meta)) {
      bumpCounter(counters, 'dayBookingHostPaymentZar', 'dayBookingHostPaymentNetZar', g, n);
    } else if (isDayBookingMenuPayment(meta, t, ledgerRef)) {
      bumpCounter(counters, 'dayBookingMenuPaymentZar', 'dayBookingMenuPaymentNetZar', g, n);
    } else if (isDayBookingGuestPayment(meta)) {
      bumpCounter(counters, 'dayBookingGuestPaymentZar', 'dayBookingGuestPaymentNetZar', g, n);
    } else {
      bumpCounter(counters, 'dayBookingOtherPaymentZar', 'dayBookingOtherPaymentNetZar', g, n);
    }
    return;
  }

  if (isDayBookingHostPayment(meta)) {
    bumpCounter(counters, 'dayBookingHostPaymentZar', 'dayBookingHostPaymentNetZar', g, n);
  } else if (
    t === 'TABLE_HOST_FEE' ||
    t === 'HOSTED_TABLE_EXTERNAL_LISTING' ||
    t === 'HOSTED_TABLE_MENU' ||
    isHostedTableVenuePayment(meta)
  ) {
    bumpCounter(counters, 'hostedTablePaymentZar', 'hostedTablePaymentNetZar', g, n);
  } else if (
    t === 'HOSTED_TABLE_JOIN' ||
    t === 'TABLE_CHECKOUT' ||
    t === 'VENUE_TABLE_JOIN' ||
    t === 'table'
  ) {
    if (isDayBookingGuestPayment(meta)) {
      bumpCounter(counters, 'dayBookingGuestPaymentZar', 'dayBookingGuestPaymentNetZar', g, n);
    } else {
      bumpCounter(counters, 'venueTablePaymentZar', 'venueTablePaymentNetZar', g, n);
    }
  } else if (isTicketPaymentMeta({ type: t }, pType)) {
    bumpCounter(counters, 'ticketPaymentZar', 'ticketPaymentNetZar', g, n);
  } else if (
    t === 'TABLE_BOOST' ||
    t === 'HOUSE_PARTY_ENTRANCE' ||
    t === 'HOUSE_PARTY_PUBLISH' ||
    t === 'HOUSE_PARTY_BOOST' ||
    t === 'promotion' ||
    t === 'BOOST'
  ) {
    bumpCounter(counters, 'otherPaymentZar', 'otherPaymentNetZar', g, n);
  } else {
    bumpCounter(counters, 'otherPaymentZar', 'otherPaymentNetZar', g, n);
  }
}

/** @deprecated use classifyVenuePaymentRevenueScoped — gross-only wrapper */
export function classifyVenuePaymentRevenue(mtype, pType, amount, counters, metadata = null) {
  classifyVenuePaymentRevenueScoped(mtype, pType, amount, amount, counters, metadata, 'all');
}
