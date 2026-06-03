import { splitPlatformGross } from './platformSplit.js';
import { line, sumCheckoutLines } from './checkoutLines.js';

/**
 * Validate ticket tier + optional menu and compute checkout totals (ZAR).
 */
export async function computeTicketCheckout(prisma, {
  eventId,
  ticketTierName,
  quantity,
  selectedMenuItems = [],
}) {
  const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true,
      eventFormat: true,
      ticketTiers: true,
      allowsTicketMenuAddons: true,
      venueId: true,
    },
  });
  if (!event) return { ok: false, error: 'Event not found' };

  const tiers = Array.isArray(event.ticketTiers) ? event.ticketTiers : [];
  const tier = tiers.find((t) => t.name === ticketTierName);
  if (!tier) return { ok: false, error: 'Ticket tier not found' };

  const available = Number(tier.quantity) - (Number(tier.sold) || 0);
  if (available < qty) return { ok: false, error: 'Not enough tickets available' };

  const ticketSubtotal = Math.round(Number(tier.price) * qty * 100) / 100;
  const menuLines = [];
  let menuTotal = 0;

  const menuPayload = Array.isArray(selectedMenuItems) ? selectedMenuItems : [];
  if (menuPayload.length > 0) {
    if (!event.allowsTicketMenuAddons) {
      return { ok: false, error: 'Menu add-ons are not available for this event' };
    }
    const ids = menuPayload.map((m) => m.menuItemId).filter(Boolean);
    const rows = await prisma.venueMenuItem.findMany({
      where: { venueId: event.venueId, id: { in: ids }, isAvailable: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const sel of menuPayload) {
      const id = sel.menuItemId;
      const row = byId.get(id);
      if (!row) return { ok: false, error: 'Invalid menu item' };
      const itemQty = Math.max(0, parseInt(String(sel.quantity), 10) || 0);
      if (itemQty <= 0) continue;
      const lineZar = Math.round(Number(row.price) * itemQty * 100) / 100;
      menuTotal += lineZar;
      menuLines.push({
        menuItemId: id,
        quantity: itemQty,
        unitPrice: Number(row.price),
        name: row.name,
      });
    }
    menuTotal = Math.round(menuTotal * 100) / 100;
  }

  const lines = [line('tickets', `${ticketTierName} ×${qty}`, ticketSubtotal)];
  if (menuTotal > 0) {
    lines.push(line('menu', 'Menu add-ons', menuTotal));
  }
  const total = Math.round((ticketSubtotal + menuTotal) * 100) / 100;
  const { secAmount, recipientAmount } = splitPlatformGross(total);

  return {
    ok: true,
    event,
    tier,
    ticketSubtotal,
    menuTotal,
    total,
    menuLines,
    lines,
    secAmount,
    recipientAmount,
  };
}

export function buildTicketPaymentMetadata(base, computed) {
  const gross = computed.total;
  return {
    ...base,
    type: 'ticket',
    ticket_subtotal_zar: computed.ticketSubtotal,
    menu_zar: computed.menuTotal,
    menu_total_zar: computed.menuTotal,
    selected_menu_items: computed.menuLines,
    lines: computed.lines,
    amount_total_zar: gross,
    platform_fee_zar: computed.secAmount,
    venue_share_zar: computed.recipientAmount,
  };
}

export async function expectedTicketTotalFromMetadata(prisma, metadata) {
  if (metadata?.amount_total_zar != null) {
    const fromLines = Array.isArray(metadata?.lines) ? sumCheckoutLines(metadata.lines) : 0;
    const declared = Number(metadata.amount_total_zar);
    if (fromLines > 0 && Math.abs(fromLines - declared) < 0.02) return declared;
    if (fromLines > 0) return fromLines;
    return declared;
  }
  const eventId = metadata?.event_id;
  const tier = metadata?.ticket_tier_name;
  if (!eventId || !tier) return 0;
  let menuItems = metadata?.selected_menu_items;
  if (typeof menuItems === 'string') {
    try {
      menuItems = JSON.parse(menuItems);
    } catch {
      menuItems = [];
    }
  }
  const result = await computeTicketCheckout(prisma, {
    eventId,
    ticketTierName: tier,
    quantity: metadata?.quantity || 1,
    selectedMenuItems: menuItems || [],
  });
  return result.ok ? result.total : 0;
}
