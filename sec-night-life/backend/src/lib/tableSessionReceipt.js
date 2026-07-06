import { prisma } from './prisma.js';
import { formatYmdSast, windowEndInstant } from './dayBookingWindows.js';
import { flattenPaymentMetadata, basePaymentReference } from './paymentMetadata.js';
import { resolveVenueMenuSelections } from './menuHelpers.js';
import { resolveVenueContextForHostedTable } from './venueTableHostAfterPayment.js';
import { resolveDailySessionNumber } from './dailyTableSession.js';

const userSelect = {
  id: true,
  fullName: true,
  username: true,
  userProfile: { select: { username: true } },
};

export function memberBelongsToTodaySast(member, venueTable, now = new Date()) {
  const todayYmd = formatYmdSast(now);
  if (member?.bookingDate) return formatYmdSast(member.bookingDate) === todayYmd;
  if (member?.paidAt) return formatYmdSast(member.paidAt) === todayYmd;
  if (member?.joinedAt) return formatYmdSast(member.joinedAt) === todayYmd;
  if (venueTable?.tableSessionDate) return formatYmdSast(venueTable.tableSessionDate) === todayYmd;
  return false;
}

export function inferMemberSessionNumber(member, venueTable) {
  if (member?.tableSessionNumber != null) return Number(member.tableSessionNumber) || 1;
  return resolveDailySessionNumber(venueTable);
}

export function mapUserBrief(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.userProfile?.username || u.username || u.fullName || 'User',
    fullName: u.fullName,
  };
}

async function resolveMenuLines(selectedMenuItems, venueId) {
  if (!Array.isArray(selectedMenuItems) || !selectedMenuItems.length || !venueId) return [];
  const resolved = await resolveVenueMenuSelections(selectedMenuItems, venueId);
  return (resolved.items || []).map((item) => ({
    name: item.name || 'Item',
    quantity: Number(item.quantity) || 1,
    lineTotal: (Number(item.price) || 0) * (Number(item.quantity) || 1),
  }));
}

async function loadPaymentBreakdown(paystackReference, venueId) {
  if (!paystackReference || String(paystackReference).startsWith('free_')) {
    return { joinFeeZar: 0, menuZar: 0, entranceZar: 0, lineTotalZar: 0, menuItems: [], settlementMode: null };
  }
  const ref = basePaymentReference(String(paystackReference));
  const pay = await prisma.payment.findFirst({
    where: { reference: ref },
    select: { amount: true, metadata: true },
  });
  const meta = flattenPaymentMetadata(pay?.metadata);
  const joinFeeZar = Number(meta.join_zar ?? meta.joinZar ?? 0) || 0;
  const menuZar = Number(meta.menu_zar ?? meta.menuZar ?? 0) || 0;
  const entranceZar = Number(meta.entrance_zar ?? meta.entranceZar ?? 0) || 0;
  const lineTotalZar = Number(pay?.amount ?? 0) || joinFeeZar + menuZar + entranceZar;
  const rawMenu = meta.selected_menu_items ?? meta.selectedMenuItems;
  const menuItems = await resolveMenuLines(Array.isArray(rawMenu) ? rawMenu : null, venueId);
  return {
    joinFeeZar,
    menuZar,
    entranceZar,
    lineTotalZar,
    menuItems,
    settlementMode: meta.settlement_mode ?? meta.settlementMode ?? null,
  };
}

function buildSessionWindow({ hostVtMember, hostedTable, venueTable }) {
  const bookingDate = hostVtMember?.bookingDate || hostedTable?.eventDate || venueTable?.serviceDate || null;
  const windowStartTime =
    hostVtMember?.windowStartTime || hostedTable?.eventTime || venueTable?.startTime || null;
  const windowEndTime = hostVtMember?.windowEndTime || venueTable?.endTime || null;
  let windowEndsAt = hostedTable?.windowEndsAt || null;
  if (!windowEndsAt && bookingDate && windowStartTime && windowEndTime) {
    windowEndsAt = windowEndInstant(bookingDate, windowStartTime, windowEndTime);
  }
  return {
    bookingDate: bookingDate ? formatYmdSast(bookingDate) : null,
    windowStartTime: windowStartTime ? String(windowStartTime) : null,
    windowEndTime: windowEndTime ? String(windowEndTime) : null,
    windowEndsAt: windowEndsAt instanceof Date ? windowEndsAt.toISOString() : windowEndsAt,
  };
}

async function enrichParticipant(entry, paystackReference, venueId, fallbackAmount = 0) {
  const pb = await loadPaymentBreakdown(paystackReference, venueId);
  const menuItems = pb.menuItems.length > 0 ? pb.menuItems : entry.menuItems || [];
  const amountPaid =
    pb.lineTotalZar > 0 ? pb.lineTotalZar : Number(fallbackAmount || entry.amountPaid || 0);
  return {
    ...entry,
    joinFeeZar: pb.joinFeeZar,
    menuZar: pb.menuZar > 0 ? pb.menuZar : Math.max(0, amountPaid - pb.joinFeeZar - pb.entranceZar),
    entranceZar: pb.entranceZar,
    amountPaid,
    menuItems,
    settlementMode: entry.settlementMode || pb.settlementMode,
    paystackReference: paystackReference || null,
  };
}

function bookingDisplayTotalZar(row) {
  if (row.amountTotal != null && Number(row.amountTotal) > 0) return Number(row.amountTotal);
  const parts = [row.componentZar, row.entranceZar, row.menuTotalZar].filter((v) => v != null);
  if (parts.length) return parts.reduce((s, v) => s + (Number(v) || 0), 0);
  return 0;
}

export async function buildTableSessionReceipt({
  hostedTableId = null,
  venueTableId = null,
  sessionNumber = 1,
}) {
  let resolvedHostedId = hostedTableId || null;
  let vt = null;

  if (venueTableId) {
    vt = await prisma.venueTable.findUnique({
      where: { id: venueTableId },
      include: {
        venue: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
    });
    if (!vt) return null;
    if (!resolvedHostedId && vt.hostedTableId) resolvedHostedId = vt.hostedTableId;
  }

  let ht = null;
  if (resolvedHostedId) {
    ht = await prisma.hostedTable.findUnique({
      where: { id: resolvedHostedId },
      include: {
        event: { select: { id: true, title: true, venueId: true, date: true, endsAt: true } },
        members: { include: { user: { select: userSelect } } },
      },
    });
  }

  const { venueId, linkedVenueTable } = ht
    ? await resolveVenueContextForHostedTable(prisma, ht)
    : { venueId: vt?.venueId || null, linkedVenueTable: vt };

  if (!venueId) return null;
  if (!vt && linkedVenueTable) vt = linkedVenueTable;

  const venueTableIdResolved = vt?.id || venueTableId || null;
  const tableName = ht?.tableName || vt?.tableName || 'Table';
  const venueSlotName =
    vt?.tableName && ht?.tableName && vt.tableName !== ht.tableName ? vt.tableName : vt?.tableName || null;
  const eventTitle = ht?.event?.title || vt?.event?.title || null;
  const eventId = ht?.eventId || vt?.eventId || null;

  let status = 'ENDED';
  let canManageLive = false;
  if (ht) {
    status = ht.status === 'ACTIVE' || ht.status === 'FULL' ? 'ACTIVE' : 'ENDED';
    canManageLive = status === 'ACTIVE';
  } else if (vt) {
    const currentSession = resolveDailySessionNumber(vt);
    status = sessionNumber < currentSession ? 'RESET' : vt.currentOccupancy > 0 || vt.hostUserId ? 'ACTIVE' : 'ENDED';
  }

  let hostOut = null;
  const members = [];
  const transactions = [];
  const seenUserIds = new Set();
  let hostVtMember = null;

  const ledgerRows = ht
    ? await prisma.eventVenueTableBooking.findMany({
        where: { hostedTableId: ht.id },
        include: { user: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
      })
    : vt?.eventId
      ? await prisma.eventVenueTableBooking.findMany({
          where: { venueTableId: vt.id, tableSessionNumber: sessionNumber },
          include: { user: { select: userSelect } },
          orderBy: { createdAt: 'desc' },
        })
      : [];

  for (const row of ledgerRows) {
    const lineTotal = bookingDisplayTotalZar(row);
    const menuItems = await resolveMenuLines(row.selectedMenuItems, venueId);
    transactions.push({
      id: row.id,
      role: row.role,
      user: mapUserBrief(row.user),
      lineTotalZar: lineTotal,
      joinFeeZar: row.role === 'GUEST' ? Number(row.componentZar || 0) : 0,
      menuZar: Number(row.menuTotalZar || 0),
      entranceZar: Number(row.entranceZar || 0),
      createdAt: row.createdAt,
      settlementMode: row.settlementMode,
      menuItems,
      hostingTierName: row.hostingTierName,
      paystackReference: row.paystackReference,
    });
    seenUserIds.add(row.userId);
    if (row.role === 'HOST' && !hostOut) {
      hostOut = {
        role: 'HOST',
        user: mapUserBrief(row.user),
        amountPaid: lineTotal,
        menuItems,
        settlementMode: row.settlementMode,
        paidAt: row.createdAt,
        joinFeeZar: 0,
        menuZar: Number(row.menuTotalZar || lineTotal),
        entranceZar: Number(row.entranceZar || 0),
      };
    } else if (row.role === 'GUEST') {
      members.push({
        role: 'GUEST',
        user: mapUserBrief(row.user),
        amountPaid: lineTotal,
        settlementMode: row.settlementMode,
        menuItems,
        paidAt: row.createdAt,
        joinFeeZar: Number(row.componentZar || 0),
        menuZar: Number(row.menuTotalZar || 0),
        entranceZar: Number(row.entranceZar || 0),
      });
    }
  }

  if (venueTableIdResolved) {
    const vtMembers = await prisma.venueTableMember.findMany({
      where: {
        venueTableId: venueTableIdResolved,
        paystackReference: { not: null },
        status: { in: ['CONFIRMED', 'LEFT'] },
      },
      include: { user: { select: userSelect } },
      orderBy: { paidAt: 'desc' },
    });

    for (const m of vtMembers) {
      const memberSession = inferMemberSessionNumber(m, vt);
      if (memberSession !== sessionNumber) continue;
      if (m.memberRole === 'HOST') hostVtMember = m;

      const menuItems = await resolveMenuLines(m.selectedMenuItems, venueId);
      const entry = await enrichParticipant(
        {
          role: m.memberRole === 'HOST' ? 'HOST' : 'GUEST',
          user: mapUserBrief(m.user),
          amountPaid: Number(m.amountPaid || 0),
          settlementMode: m.settlementMode,
          menuItems,
          paidAt: m.paidAt || m.joinedAt,
          memberStatus: m.status,
        },
        m.paystackReference,
        venueId,
        m.amountPaid,
      );

      if (m.memberRole === 'HOST') {
        if (!hostOut) hostOut = entry;
      } else if (!seenUserIds.has(m.userId)) {
        members.push(entry);
        seenUserIds.add(m.userId);
      }

      if (!transactions.some((t) => t.user?.id === m.userId)) {
        transactions.push({
          id: `vtm-${m.id}`,
          role: m.memberRole === 'HOST' ? 'HOST' : 'GUEST',
          user: mapUserBrief(m.user),
          lineTotalZar: entry.amountPaid,
          joinFeeZar: entry.joinFeeZar,
          menuZar: entry.menuZar,
          entranceZar: entry.entranceZar,
          createdAt: m.paidAt || m.joinedAt,
          settlementMode: entry.settlementMode,
          menuItems: entry.menuItems,
          paystackReference: m.paystackReference,
        });
      }
    }
  }

  if (ht) {
    for (const m of ht.members.filter((x) => x.status === 'GOING' || x.status === 'CANCELLED')) {
      if (m.userId === ht.hostUserId) {
        if (!hostOut) {
          hostOut = await enrichParticipant(
            {
              role: 'HOST',
              user: mapUserBrief(m.user),
              amountPaid: Number(m.menuSpendPaid || m.joinFeePaid || 0),
              menuItems: await resolveMenuLines(m.selectedMenuItems, venueId),
              paidAt: m.joinedAt,
            },
            m.paystackReference,
            venueId,
          );
        }
        continue;
      }
      if (seenUserIds.has(m.userId)) continue;
      const entry = await enrichParticipant(
        {
          role: 'GUEST',
          user: mapUserBrief(m.user),
          amountPaid: Number(m.menuSpendPaid || m.joinFeePaid || 0),
          settlementMode: null,
          menuItems: await resolveMenuLines(m.selectedMenuItems, venueId),
          paidAt: m.joinedAt,
          memberStatus: m.status,
        },
        m.paystackReference,
        venueId,
        Number(m.menuSpendPaid || m.joinFeePaid || 0),
      );
      members.push(entry);
      seenUserIds.add(m.userId);
      transactions.push({
        id: `htm-${m.id}`,
        role: 'GUEST',
        user: mapUserBrief(m.user),
        lineTotalZar: entry.amountPaid,
        joinFeeZar: entry.joinFeeZar || Number(m.joinFeePaid || 0),
        menuZar: entry.menuZar || Number(m.menuSpendPaid || 0),
        entranceZar: entry.entranceZar,
        createdAt: m.joinedAt,
        settlementMode: entry.settlementMode,
        menuItems: entry.menuItems,
        paystackReference: m.paystackReference,
      });
    }
  }

  const sessionWindow = buildSessionWindow({
    hostVtMember,
    hostedTable: ht,
    venueTable: vt,
  });

  const totalPaidZar =
    Math.round(transactions.reduce((s, t) => s + Number(t.lineTotalZar || 0), 0) * 100) / 100;

  return {
    venueId,
    tableName,
    venueSlotName,
    eventTitle,
    eventId,
    sessionNumber,
    sessionWindow,
    status,
    host: hostOut,
    members,
    transactions: transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    totalPaidZar,
    canManageLive: canManageLive && Boolean(ht?.id),
    hostedTableId: ht?.id || null,
    venueTableId: venueTableIdResolved,
  };
}
