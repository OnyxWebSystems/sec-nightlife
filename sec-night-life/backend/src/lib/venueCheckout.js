import { line, sumCheckoutLines } from './checkoutLines.js';

/**
 * Build checkout lines for a venue table booking.
 * @param {object} table - VenueTable with optional event include
 * @param {object} opts
 * @param {number} opts.menuTotal - chargeable menu (extras beyond included)
 * @param {string} opts.settlementMode
 * @param {Array} opts.menuItems - for included item labels
 */
export function computeVenueCheckout(
  table,
  { menuTotal = 0, settlementMode, menuItems = [], venue = null, isCustomHost = false, overrideMinSpend = null } = {},
) {
  const mode = settlementMode || table.minSpendSettlement || 'PREPAY_LUMP';
  const bookingFee = Number(table.bookingFeeZar || 0);
  const minSpend = overrideMinSpend != null ? Number(overrideMinSpend) : Number(table.minimumSpend || 0);
  const lines = [];

  if (isCustomHost) {
    const customFee = Number(venue?.customTableBookingFeeZar || 0);
    if (customFee > 0) lines.push(line('custom_table_booking_fee', 'Custom table booking fee', customFee));
    const hostFee = Number(table.hostTableFeeZar || venue?.hostTableFeeZar || 0);
    if (hostFee > 0) lines.push(line('host_table_fee', 'Host table fee', hostFee));
  } else if (bookingFee > 0) {
    lines.push(line('booking_fee', 'Booking fee', bookingFee));
  }

  const event = table.event;
  if (event?.hasEntranceFee && Number(event.entranceFeeAmount) > 0) {
    lines.push(line('entrance', 'Entrance', Number(event.entranceFeeAmount)));
  }

  const included = Array.isArray(table.includedItems) ? table.includedItems : [];
  const menuById = new Map((menuItems || []).map((m) => [m.id, m]));
  for (const inc of included) {
    const id = inc.menu_item_id || inc.menuItemId;
    const row = id ? menuById.get(id) : null;
    const qty = Math.max(1, Number(inc.quantity) || 1);
    const name = row?.name || 'Included item';
    lines.push(line(`included_${id}`, `${name} (included)`, 0));
  }

  if (mode === 'PREPAY_LUMP' && minSpend > 0) {
    lines.push(line('minimum_spend', 'Minimum spend', minSpend));
  } else if (mode === 'PREPAY_MENU') {
    const menu = Number(menuTotal || 0);
    if (menu > 0) lines.push(line('menu', 'Menu (extra)', menu));
    if (menu < minSpend) {
      return { error: `Select menu items worth at least R${minSpend.toFixed(0)} (currently R${menu.toFixed(0)}).` };
    }
  } else if (mode === 'PAY_ON_ARRIVAL') {
    if (minSpend > 0) lines.push(line('minimum_spend', 'Minimum spend (pay on arrival)', minSpend));
    const menu = Number(menuTotal || 0);
    if (menu > 0) lines.push(line('menu', 'Menu pre-order (extra)', menu));
  }

  const chargeable = lines.filter((l) => Number(l.amount_zar) > 0);
  const subtotal = sumCheckoutLines(chargeable);
  const platformFee = subtotal > 0 ? Number((subtotal * 0.15).toFixed(2)) : 0;
  if (platformFee > 0) lines.push(line('platform_fee', 'SEC service fee (15%)', platformFee));

  return {
    lines,
    mode,
    subtotal,
    platformFee,
    venueShare: Number((subtotal * 0.85).toFixed(2)),
    total: sumCheckoutLines(lines),
  };
}

/** Menu total excluding included bundle quantities. */
export function computeChargeableMenuTotal(menuItems, selectedMap, includedItems = []) {
  const includedQty = new Map();
  for (const inc of includedItems || []) {
    const id = inc.menu_item_id || inc.menuItemId;
    if (!id) continue;
    includedQty.set(id, (includedQty.get(id) || 0) + Math.max(1, Number(inc.quantity) || 1));
  }
  let total = 0;
  for (const [id, qtyRaw] of Object.entries(selectedMap || {})) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const item = menuItems.find((m) => m.id === id);
    if (!item) continue;
    const bundled = includedQty.get(id) || 0;
    const extra = Math.max(0, qty - bundled);
    total += item.price * extra;
  }
  return total;
}
