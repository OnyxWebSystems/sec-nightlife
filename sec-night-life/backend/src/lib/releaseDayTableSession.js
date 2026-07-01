import { prisma } from './prisma.js';
import {
  computeLegacyWindowEndsAt,
  isDaySessionStillActive,
  isHostedTableForToday,
} from './dayBookingWindows.js';

/**
 * Release a single day-booking host session without clearing other non-overlapping sessions on the same slot.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function releaseDayTableSession(tx, { hostedTableId }, { bumpSession = true } = {}) {
  const hosted = await tx.hostedTable.findUnique({
    where: { id: hostedTableId },
    select: {
      id: true,
      venueTableId: true,
      hostUserId: true,
      status: true,
    },
  });
  if (!hosted || hosted.status === 'CLOSED') {
    return { released: false, reason: 'session_not_found' };
  }

  await tx.hostedTableMember.updateMany({
    where: {
      hostedTableId: hosted.id,
      status: { in: ['GOING', 'PENDING', 'WAITLISTED'] },
    },
    data: { status: 'CANCELLED' },
  });

  await tx.hostedTable.update({
    where: { id: hosted.id },
    data: { status: 'CLOSED' },
  });

  if (hosted.venueTableId) {
    const venueTable = await tx.venueTable.findUnique({
      where: { id: hosted.venueTableId },
      select: {
        id: true,
        hostedTableId: true,
        hostUserId: true,
        tableSessionNumber: true,
        currentOccupancy: true,
      },
    });

    if (venueTable) {
      const nextSessionNumber = bumpSession
        ? (Number(venueTable.tableSessionNumber) || 1) + 1
        : Number(venueTable.tableSessionNumber) || 1;

      await tx.venueTableMember.updateMany({
        where: {
          venueTableId: venueTable.id,
          memberRole: 'HOST',
          status: { in: ['CONFIRMED', 'APPROVED', 'PENDING_PAYMENT'] },
          userId: hosted.hostUserId || undefined,
        },
        data: { status: 'LEFT' },
      });

      const stillActive = await tx.hostedTable.count({
        where: {
          venueTableId: venueTable.id,
          status: { in: ['ACTIVE', 'FULL'] },
          id: { not: hosted.id },
        },
      });

      const patch = {
        tableSessionNumber: nextSessionNumber,
      };

      if (venueTable.hostedTableId === hosted.id) {
        patch.hostedTableId = null;
        patch.hostUserId = null;
      }

      if (stillActive === 0) {
        patch.currentOccupancy = 0;
        patch.status = 'AVAILABLE';
        patch.amountContributed = 0;
        patch.hostedTableId = null;
        patch.hostUserId = null;
      } else if (venueTable.hostedTableId === hosted.id) {
        const remaining = await tx.hostedTable.findFirst({
          where: {
            venueTableId: venueTable.id,
            status: { in: ['ACTIVE', 'FULL'] },
          },
          orderBy: { createdAt: 'asc' },
        });
        if (remaining) {
          patch.hostedTableId = remaining.id;
          patch.hostUserId = remaining.hostUserId;
        }
      }

      await tx.venueTable.update({
        where: { id: venueTable.id },
        data: patch,
      });
    }
  } else {
    const linkedVenueTable = await tx.venueTable.findFirst({
      where: { hostedTableId: hosted.id },
      select: {
        id: true,
        hostedTableId: true,
        hostUserId: true,
        tableSessionNumber: true,
        currentOccupancy: true,
      },
    });
    if (linkedVenueTable) {
      const nextSessionNumber = bumpSession
        ? (Number(linkedVenueTable.tableSessionNumber) || 1) + 1
        : Number(linkedVenueTable.tableSessionNumber) || 1;
      await tx.venueTableMember.updateMany({
        where: {
          venueTableId: linkedVenueTable.id,
          memberRole: 'HOST',
          status: { in: ['CONFIRMED', 'APPROVED', 'PENDING_PAYMENT'] },
          userId: hosted.hostUserId || undefined,
        },
        data: { status: 'LEFT' },
      });
      await tx.venueTable.update({
        where: { id: linkedVenueTable.id },
        data: {
          hostedTableId: null,
          hostUserId: null,
          currentOccupancy: 0,
          status: 'AVAILABLE',
          amountContributed: 0,
          tableSessionNumber: nextSessionNumber,
        },
      });
    }
  }

  return { released: true, hostedTableId: hosted.id };
}

/** Find and release all expired day-booking sessions. */
export async function expireDayTableSessions({ now = new Date() } = {}) {
  const expiredWithEnd = await prisma.hostedTable.findMany({
    where: {
      eventId: null,
      status: { in: ['ACTIVE', 'FULL'] },
      windowEndsAt: { lte: now },
    },
    select: { id: true },
  });

  const allDayHosted = await prisma.hostedTable.findMany({
    where: {
      eventId: null,
      status: { in: ['ACTIVE', 'FULL'] },
    },
    include: {
      venueTable: {
        select: {
          id: true,
          serviceSchedule: true,
          startTime: true,
          endTime: true,
          hostingTierKey: true,
        },
      },
    },
  });

  const legacyExpired = [];
  for (const ht of allDayHosted) {
    if (!isHostedTableForToday(ht, now)) {
      legacyExpired.push({ id: ht.id });
      continue;
    }
    const venueTable =
      ht.venueTable ||
      (await prisma.venueTable.findFirst({
        where: { hostedTableId: ht.id },
        select: {
          id: true,
          serviceSchedule: true,
          startTime: true,
          endTime: true,
          hostingTierKey: true,
        },
      }));
    if (!isDaySessionStillActive(ht, venueTable, now)) {
      legacyExpired.push({ id: ht.id });
    }
  }

  const staleVenueTables = await prisma.venueTable.findMany({
    where: {
      eventId: null,
      hostingTierKey: { startsWith: 'day:' },
      OR: [{ hostedTableId: { not: null } }, { hostUserId: { not: null } }],
    },
    select: { id: true, hostedTableId: true },
  });

  const staleVenueTableIds = [];
  for (const vt of staleVenueTables) {
    if (!vt.hostedTableId) {
      staleVenueTableIds.push(vt.id);
      continue;
    }
    const ht = await prisma.hostedTable.findUnique({
      where: { id: vt.hostedTableId },
      include: {
        venueTable: {
          select: {
            id: true,
            serviceSchedule: true,
            startTime: true,
            endTime: true,
            hostingTierKey: true,
          },
        },
      },
    });
    if (!ht || ht.status === 'CLOSED' || !isDaySessionStillActive(ht, ht.venueTable || vt, now)) {
      staleVenueTableIds.push(vt.id);
      if (ht?.id) legacyExpired.push({ id: ht.id });
    }
  }

  const allIds = [
    ...new Set([
      ...expiredWithEnd.map((r) => r.id),
      ...legacyExpired.map((r) => r.id),
    ]),
  ];

  const releasedHostedIds = new Set();
  let released = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const id of allIds) {
        const result = await releaseDayTableSession(tx, { hostedTableId: id });
        if (result.released) {
          released += 1;
          releasedHostedIds.add(id);
        }
      }

      for (const tableId of staleVenueTableIds) {
        const vt = await tx.venueTable.findUnique({
          where: { id: tableId },
          select: { id: true, hostedTableId: true, hostUserId: true, tableSessionNumber: true },
        });
        if (!vt) continue;
        if (vt.hostedTableId && !releasedHostedIds.has(vt.hostedTableId)) {
          const result = await releaseDayTableSession(tx, { hostedTableId: vt.hostedTableId });
          if (result.released) {
            released += 1;
            releasedHostedIds.add(vt.hostedTableId);
          }
          continue;
        }
        if (vt.hostUserId || vt.hostedTableId) {
          await tx.venueTable.update({
            where: { id: vt.id },
            data: {
              hostedTableId: null,
              hostUserId: null,
              currentOccupancy: 0,
              status: 'AVAILABLE',
              amountContributed: 0,
              tableSessionNumber: (Number(vt.tableSessionNumber) || 1) + 1,
            },
          });
          released += 1;
        }
      }
    },
    { timeout: 120000 },
  );

  return { released, checked: allIds.length + staleVenueTableIds.length };
}
