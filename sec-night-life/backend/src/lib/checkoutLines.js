/**
 * Standard Paystack / payment metadata line items for table checkout.
 */
import { splitPlatformGross } from './platformSplit.js';

export function buildTableCheckoutMetadata({
  userId,
  venueTableId,
  hostedTableId,
  eventId,
  settlementMode,
  lines,
}) {
  const amountTotalZar = lines.reduce((sum, l) => sum + Number(l.amount_zar || 0), 0);
  const gross = Math.round(amountTotalZar * 100) / 100;
  const { secAmount, recipientAmount } = splitPlatformGross(gross);
  return {
    type: 'TABLE_CHECKOUT',
    user_id: userId,
    venue_table_id: venueTableId || undefined,
    hosted_table_id: hostedTableId || undefined,
    event_id: eventId || undefined,
    settlement_mode: settlementMode || 'PREPAY_MENU',
    lines,
    amount_total_zar: gross,
    /** Informational — SEC share embedded in amount_total_zar (not charged on top). */
    platform_fee_zar: secAmount,
    venue_share_zar: recipientAmount,
  };
}

export function sumCheckoutLines(lines) {
  return Math.round(lines.reduce((s, l) => s + Number(l.amount_zar || 0), 0) * 100) / 100;
}

export function line(code, label, amountZar) {
  return { code, label, amount_zar: Math.round(Number(amountZar) * 100) / 100 };
}

/**
 * Reconstruct chargeable lines from legacy metadata.
 * platform_fee_zar is NEVER added — it is derived from the gross total.
 */
export function linesFromLegacyMetadata(metadata) {
  const type = metadata?.type;
  const lines = [];
  const bookingMode = metadata.booking_mode || metadata.bookingMode;

  if (type === 'VENUE_TABLE_JOIN' || type === 'TABLE_CHECKOUT') {
    const hostFee = Number(metadata.host_table_fee_zar || 0);
    const joinFee = Number(metadata.booking_fee_zar || 0);
    const customFee = Number(metadata.custom_table_booking_fee_zar || 0);
    const entrance = Number(metadata.entrance_zar || 0);
    const minSpend = Number(metadata.minimum_spend_zar || metadata.min_spend_zar || 0);
    const menu = Number(metadata.menu_zar || metadata.menu_total_zar || 0);

    if (customFee > 0) lines.push(line('custom_table_booking_fee', 'Custom table booking fee', customFee));
    if (bookingMode === 'host' || bookingMode === 'custom_host') {
      if (hostFee > 0) lines.push(line('host_table_fee', 'Host booking fee', hostFee));
    } else if (joinFee > 0) {
      lines.push(line('booking_fee', 'Join booking fee', joinFee));
    }
    if (entrance > 0) lines.push(line('entrance', 'Entrance fee', entrance));
    if (minSpend > 0) lines.push(line('minimum_spend', 'Minimum spend', minSpend));
    if (menu > 0) lines.push(line('menu', 'Menu', menu));

    if (lines.length === 0 && metadata.amount_total_zar) {
      lines.push(line('total', 'Total', metadata.amount_total_zar));
    }
    return lines;
  }

  if (type === 'HOSTED_TABLE_JOIN') {
    const entrance = Number(metadata.entrance_zar || 0);
    const join = Number(metadata.joining_fee_zar || metadata.join_fee_zar || metadata.join_zar || 0);
    if (entrance > 0) lines.push(line('entrance', 'Entrance fee', entrance));
    if (join > 0) lines.push(line('joining_fee', 'Joining fee', join));
    return lines;
  }

  if (type === 'TABLE_HOST_FEE') {
    const entrance = Number(metadata.entrance_zar || 0);
    const host = Number(metadata.host_fee_zar || 0);
    const menu = Number(metadata.menu_zar || 0);
    if (entrance > 0) lines.push(line('entrance', 'Entrance fee', entrance));
    if (host > 0) lines.push(line('host_fee', 'Host table fee', host));
    if (menu > 0) lines.push(line('menu', 'Menu', menu));
    return lines;
  }

  if (type === 'HOSTED_TABLE_MENU') {
    const menu = Number(metadata.menu_zar || 0);
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
