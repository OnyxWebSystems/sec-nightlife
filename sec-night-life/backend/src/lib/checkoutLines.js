/**
 * Standard Paystack / payment metadata line items for table checkout.
 */
export function buildTableCheckoutMetadata({
  userId,
  venueTableId,
  hostedTableId,
  eventId,
  settlementMode,
  lines,
}) {
  const amountTotalZar = lines.reduce((sum, l) => sum + Number(l.amount_zar || 0), 0);
  return {
    type: 'TABLE_CHECKOUT',
    user_id: userId,
    venue_table_id: venueTableId || undefined,
    hosted_table_id: hostedTableId || undefined,
    event_id: eventId || undefined,
    settlement_mode: settlementMode || 'PAY_ON_ARRIVAL',
    lines,
    amount_total_zar: Math.round(amountTotalZar * 100) / 100,
  };
}

export function sumCheckoutLines(lines) {
  return Math.round(lines.reduce((s, l) => s + Number(l.amount_zar || 0), 0) * 100) / 100;
}

export function line(code, label, amountZar) {
  return { code, label, amount_zar: Math.round(Number(amountZar) * 100) / 100 };
}

/** Legacy metadata types map into TABLE_CHECKOUT lines for verify. */
export function linesFromLegacyMetadata(metadata) {
  const type = metadata?.type;
  const lines = [];
  if (type === 'VENUE_TABLE_JOIN' || type === 'TABLE_CHECKOUT') {
    const booking = Number(metadata.booking_fee_zar || 0);
    const minSpend = Number(metadata.minimum_spend_zar || metadata.min_spend_zar || 0);
    const menu = Number(metadata.menu_zar || metadata.menu_total_zar || 0);
    const platform = Number(metadata.platform_fee_zar || 0);
    if (booking > 0) lines.push(line('booking_fee', 'Booking fee', booking));
    if (minSpend > 0) lines.push(line('minimum_spend', 'Minimum spend', minSpend));
    if (menu > 0) lines.push(line('menu', 'Menu', menu));
    if (platform > 0) lines.push(line('platform_fee', 'Service fee', platform));
    if (lines.length === 0 && metadata.amount_total_zar) {
      lines.push(line('total', 'Total', metadata.amount_total_zar));
    }
    return lines;
  }
  if (type === 'HOSTED_TABLE_JOIN') {
    const entrance = Number(metadata.entrance_zar || 0);
    const join = Number(metadata.joining_fee_zar || metadata.join_fee_zar || 0);
    if (entrance > 0) lines.push(line('entrance', 'Entrance', entrance));
    if (join > 0) lines.push(line('joining_fee', 'Joining fee', join));
    return lines;
  }
  if (type === 'TABLE_HOST_FEE') {
    const entrance = Number(metadata.entrance_zar || 0);
    const host = Number(metadata.host_fee_zar || 0);
    const menu = Number(metadata.menu_zar || 0);
    if (entrance > 0) lines.push(line('entrance', 'Entrance', entrance));
    if (host > 0) lines.push(line('host_fee', 'Host table fee', host));
    if (menu > 0) lines.push(line('menu', 'Menu', menu));
    return lines;
  }
  return lines;
}

export function expectedTotalFromMetadata(metadata) {
  const fromLines = metadata?.lines;
  if (Array.isArray(fromLines) && fromLines.length > 0) {
    return sumCheckoutLines(fromLines);
  }
  if (metadata?.amount_total_zar != null) return Number(metadata.amount_total_zar);
  return sumCheckoutLines(linesFromLegacyMetadata(metadata));
}
