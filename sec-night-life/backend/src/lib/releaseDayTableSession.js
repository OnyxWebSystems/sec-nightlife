import { prisma } from './prisma.js';
import { getActiveDaySessions } from './dayBookingWindows.js';

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
  }

  return { released: true, hostedTableId: hosted.id };
}

/** Find and release all expired day-booking sessions. */
export async function expireDayTableSessions({ now = new Date() } = {}) {
  const expiredWithEnd = await prisma.hostedTable.findMany({
    where: {
      venueTableId: { not: null },
      status: { in: ['ACTIVE', 'FULL'] },
      windowEndsAt: { lte: now },
    },
    select: { id: true },
  });

  const legacyCandidates = await prisma.hostedTable.findMany({
    where: {
      venueTableId: { not: null },
      status: { in: ['ACTIVE', 'FULL'] },
      windowEndsAt: null,
      eventId: null,
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

  const { computeLegacyWindowEndsAt } = await import('./dayBookingWindows.js');
  const legacyExpired = [];
  for (const ht of legacyCandidates) {
    const endsAt = computeLegacyWindowEndsAt(ht, ht.venueTable);
    if (endsAt && endsAt.getTime() <= now.getTime()) {
      legacyExpired.push({ id: ht.id });
    }
  }

  const staleViaVenueTable = await prisma.venueTable.findMany({
    where: {
      eventId: null,
      hostingTierKey: { startsWith: 'day:' },
      OR: [{ hostedTableId: { not: null } }, { hostUserId: { not: null } }],
    },
    include: {
      dayHostedSessions: {
        where: { status: { in: ['ACTIVE', 'FULL'] } },
      },
    },
  });

  const orphanIds = [];
  for (const vt of staleViaVenueTable) {
    if (vt.hostedTableId && !vt.dayHostedSessions.some((s) => s.id === vt.hostedTableId)) {
      orphanIds.push(vt.hostedTableId);
    }
    for (const s of vt.dayHostedSessions) {
      if (!s.windowEndsAt) {
        const endsAt = computeLegacyWindowEndsAt(s, vt);
        if (endsAt && endsAt.getTime() <= now.getTime()) {
          legacyExpired.push({ id: s.id });
        }
      }
    }
  }

  const allIds = [
    ...new Set([
      ...expiredWithEnd.map((r) => r.id),
      ...legacyExpired.map((r) => r.id),
      ...orphanIds,
    ]),
  ];

  let released = 0;
  for (const id of allIds) {
    await prisma.$transaction(async (tx) => {
      const result = await releaseDayTableSession(tx, { hostedTableId: id });
      if (result.released) released += 1;
    });
  }

  return { released, checked: allIds.length };
}
