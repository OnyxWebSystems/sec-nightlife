import { line, sumCheckoutLines } from './checkoutLines.js';
import { splitPlatformGross } from './platformSplit.js';

/**
 * Build checkout lines for a venue table booking.
 * SEC takes 15% from the customer total (not added on top).
 * @param {object} table - VenueTable with optional event include
 * @param {object} opts
 * @param {number} opts.menuTotal - full selected menu total for min-spend checks
 * @param {string} opts.settlementMode
 * @param {string} opts.bookingMode - 'host' | 'join' | 'custom_host'
 */
export function computeVenueCheckout(
  table,
  {
    menuTotal = 0,
    settlementMode,
    menuItems = [],
    venue = null,
    bookingMode = 'join',
    overrideMinSpend = null,
  } = {},
) {
  const mode = settlementMode || table.minSpendSettlement || 'PREPAY_LUMP';
  const joinFee = Number(table.bookingFeeZar || 0);
  const hostFee = Number(table.hostTableFeeZar || venue?.hostTableFeeZar || 0);
  const minSpend = overrideMinSpend != null ? Number(overrideMinSpend) : Number(table.minimumSpend || 0);
  const lines = [];
  const isHost = bookingMode === 'host' || bookingMode === 'custom_host';
  const isCustomHost = bookingMode === 'custom_host';

  if (isCustomHost) {
    const customFee = Number(venue?.customTableBookingFeeZar || 0);
    if (customFee > 0) lines.push(line('custom_table_booking_fee', 'Custom table booking fee', customFee));
    if (hostFee > 0) lines.push(line('host_table_fee', 'Host booking fee', hostFee));
  } else if (isHost) {
    if (hostFee > 0) lines.push(line('host_table_fee', 'Host booking fee', hostFee));
  } else if (joinFee > 0) {
    lines.push(line('booking_fee', 'Join booking fee', joinFee));
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

  const menu = Number(menuTotal || 0);

  if (mode === 'PREPAY_LUMP' && minSpend > 0) {
    lines.push(line('minimum_spend', 'Minimum spend', minSpend));
  } else if (mode === 'PREPAY_MENU') {
    if (menu < minSpend) {
      return { error: `Select menu items worth at least R${minSpend.toFixed(0)} (currently R${menu.toFixed(0)}).` };
    }
    const spendLine = Math.max(minSpend, menu);
    if (spendLine > 0) lines.push(line('minimum_spend', 'Minimum spend', spendLine));
  } else if (mode === 'PAY_ON_ARRIVAL') {
    if (minSpend > 0) lines.push(line('minimum_spend', 'Minimum spend (pay on arrival)', minSpend));
    if (menu > 0) lines.push(line('menu', 'Menu pre-order', menu));
  }

  const chargeable = lines.filter((l) => Number(l.amount_zar) > 0);
  const subtotal = sumCheckoutLines(chargeable);
  const { secAmount: platformFee, recipientAmount: venueShare } = splitPlatformGross(subtotal);

  return {
    lines: chargeable,
    displayLines: chargeable,
    mode,
    bookingMode,
    subtotal,
    platformFee,
    venueShare,
    total: subtotal,
  };
}

/** Full selected menu total (all quantities × price). */
export function computeFullMenuTotal(menuItems, selectedMap) {
  let total = 0;
  for (const [id, qtyRaw] of Object.entries(selectedMap || {})) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const item = menuItems.find((m) => m.id === id);
    if (!item) continue;
    total += item.price * qty;
  }
  return total;
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
