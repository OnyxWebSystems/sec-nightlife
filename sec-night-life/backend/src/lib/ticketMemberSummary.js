import { holderDisplayNameFromUser } from './ticketHelpers.js';

function formatZar(n) {
  const v = Number(n) || 0;
  return v > 0 ? `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}` : null;
}

function formatMenuLines(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.map((line) => {
    const qty = Number(line.quantity) || 1;
    const name = line.name || 'Item';
    return `${qty}× ${name}`;
  });
}

/**
 * Build multi-line table_specs_summary for a venue table member ticket.
 */
export async function buildVenueTableMemberTicketSummary(prisma, {
  member,
  table,
  venue,
  bookingMode,
  settlementMode,
  minSpendZar,
  menuItemsResolved = null,
}) {
  const lines = [];
  const isHost =
    member?.memberRole === 'HOST' ||
    bookingMode === 'host' ||
    bookingMode === 'custom_host';

  lines.push(isHost ? 'Table host' : 'Table guest');

  if (table?.tableName) {
    lines.push(table.tableName);
  }

  const specs = member?.userSpecs && typeof member.userSpecs === 'object' ? member.userSpecs : null;
  if (specs?.guestCount != null) {
    lines.push(`Guests: ${specs.guestCount}`);
  }
  if (specs?.preferredDate || specs?.preferredTime) {
    lines.push(`When: ${[specs.preferredDate, specs.preferredTime].filter(Boolean).join(' · ')}`);
  }
  if (specs?.minSpendMode === 'manual' && specs?.proposedMinimumSpend != null) {
    lines.push(`Requested min spend ${formatZar(specs.proposedMinimumSpend)} (manual)`);
  } else if (specs?.minSpendMode === 'menu') {
    lines.push('Minimum spend from menu selection');
  }

  if (!isHost) {
    let hostUser = null;
    if (table?.hostedTableId) {
      const ht = await prisma.hostedTable.findUnique({
        where: { id: table.hostedTableId },
        include: {
          host: {
            select: { fullName: true, username: true, userProfile: { select: { username: true } } },
          },
        },
      });
      hostUser = ht?.host;
    } else if (table?.hostUserId) {
      hostUser = await prisma.user.findUnique({
        where: { id: table.hostUserId },
        select: { fullName: true, username: true, userProfile: { select: { username: true } } },
      });
    }
    const hostLabel = holderDisplayNameFromUser(hostUser);
    if (hostLabel && hostLabel !== 'Guest') {
      lines.push(`Host: ${hostLabel}`);
    }
  }

  const minSpend = Number(minSpendZar ?? table?.minimumSpend ?? 0);
  if (settlementMode === 'PREPAY_LUMP' && minSpend > 0) {
    lines.push(`Min spend prepaid ${formatZar(minSpend)}`);
    lines.push('Order drinks and food on site — show this QR to staff.');
  }

  const menuLines = formatMenuLines(menuItemsResolved?.items || member?.selectedMenuItems);
  if (menuLines.length) {
    lines.push('Your order:');
    lines.push(...menuLines);
  } else if (settlementMode === 'PREPAY_MENU' && minSpend > 0 && !menuLines.length) {
    lines.push(`Minimum spend ${formatZar(minSpend)} (menu prepaid)`);
  }

  if (venue?.name) {
    lines.push(venue.name);
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Build summary for hosted table join ticket (no host menu lines).
 */
export function buildHostedTableJoinTicketSummary({ hostedTable, hostUser, entranceZar, joinZar, menuItems = [] }) {
  const lines = ['Table guest'];
  if (hostedTable?.tableName) lines.push(hostedTable.tableName);
  const hostLabel = holderDisplayNameFromUser(hostUser);
  if (hostLabel && hostLabel !== 'Guest') {
    lines.push(`Host: ${hostLabel}`);
  }
  const ent = formatZar(entranceZar);
  const join = formatZar(joinZar);
  if (ent) lines.push(`Entrance paid ${ent}`);
  if (join) lines.push(`Join fee paid ${join}`);
  const menuLines = formatMenuLines(menuItems);
  if (menuLines.length) {
    lines.push('Your order:');
    lines.push(...menuLines);
  }
  if (hostedTable?.venueName) lines.push(hostedTable.venueName);
  return lines.filter(Boolean).join('\n');
}

/**
 * Build summary for a hosted table host listing / host fee ticket.
 */
export function buildHostedTableHostTicketSummary({
  hostedTable,
  menuItems = [],
  minSpendPrepaidZar = 0,
  settlementMode = null,
}) {
  const lines = ['Table host'];
  if (hostedTable?.tableName) lines.push(hostedTable.tableName);
  const prepaid = Number(minSpendPrepaidZar) || 0;
  if (settlementMode === 'PREPAY_LUMP' && prepaid > 0) {
    lines.push(`Min spend prepaid ${formatZar(prepaid)}`);
    lines.push('Order on site — show this QR to staff.');
  }
  const menuLines = formatMenuLines(menuItems);
  if (menuLines.length) {
    lines.push('Your order:');
    lines.push(...menuLines);
  }
  if (hostedTable?.venueName) lines.push(hostedTable.venueName);
  return lines.filter(Boolean).join('\n');
}

/**
 * Build summary for a hosted table member menu order ticket.
 */
export function buildHostedTableMenuTicketSummary({
  hostedTable,
  hostUser,
  guestUser,
  menuItems,
}) {
  const lines = ['Table guest · Menu order'];
  const guestLabel = holderDisplayNameFromUser(guestUser);
  if (guestLabel && guestLabel !== 'Guest') {
    lines.push(`Guest: ${guestLabel}`);
  }
  const hostLabel = holderDisplayNameFromUser(hostUser);
  if (hostLabel && hostLabel !== 'Guest') {
    lines.push(`Host: ${hostLabel}`);
  }
  if (hostedTable?.tableName) lines.push(hostedTable.tableName);
  const menuLines = formatMenuLines(menuItems);
  if (menuLines.length) {
    lines.push('Your order:');
    lines.push(...menuLines);
  }
  if (hostedTable?.venueName) lines.push(hostedTable.venueName);
  return lines.filter(Boolean).join('\n');
}
