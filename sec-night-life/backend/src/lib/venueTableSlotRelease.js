/**
 * Reset a venue table slot so it can be booked again (manual release or host refund).
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function releaseVenueTableSlot(tx, tableId, { bumpSession = true } = {}) {
  const table = await tx.venueTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      hostedTableId: true,
      tableSessionNumber: true,
    },
  });
  if (!table) return { released: false, reason: 'table_not_found' };

  const nextSessionNumber = bumpSession ? (Number(table.tableSessionNumber) || 1) + 1 : Number(table.tableSessionNumber) || 1;

  if (table.hostedTableId) {
    await tx.hostedTableMember.updateMany({
      where: {
        hostedTableId: table.hostedTableId,
        status: { in: ['GOING', 'PENDING', 'WAITLISTED'] },
      },
      data: { status: 'CANCELLED' },
    });
    await tx.hostedTable.update({
      where: { id: table.hostedTableId },
      data: { status: 'CLOSED' },
    });
  }

  await tx.venueTableMember.updateMany({
    where: {
      venueTableId: table.id,
      status: { in: ['CONFIRMED', 'APPROVED', 'PENDING_PAYMENT', 'PENDING_VENUE_REVIEW'] },
    },
    data: { status: 'LEFT' },
  });

  await tx.venueTable.update({
    where: { id: table.id },
    data: {
      currentOccupancy: 0,
      status: 'AVAILABLE',
      amountContributed: 0,
      hostUserId: null,
      hostedTableId: null,
      isActive: true,
      tableSessionNumber: nextSessionNumber,
    },
  });

  return { released: true, tableId: table.id, sessionNumber: nextSessionNumber };
}

/**
 * Host refund: free the venue slot for a new host while guests keep their hosted table session.
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function releaseVenueTableSlotForHostRefund(tx, tableId, { hostUserId, bumpSession = true } = {}) {
  const table = await tx.venueTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      hostedTableId: true,
      hostUserId: true,
      tableSessionNumber: true,
      guestCapacity: true,
    },
  });
  if (!table) return { released: false, reason: 'table_not_found' };

  const nextSessionNumber = bumpSession ? (Number(table.tableSessionNumber) || 1) + 1 : Number(table.tableSessionNumber) || 1;
  const hostedTableId = table.hostedTableId;

  if (hostedTableId && hostUserId) {
    const hostMember = await tx.hostedTableMember.findUnique({
      where: { hostedTableId_userId: { hostedTableId, userId: hostUserId } },
    });
    if (hostMember) {
      const hostMenuSpend = Number(hostMember.menuSpendPaid || 0);
      await tx.hostedTableMember.update({
        where: { id: hostMember.id },
        data: {
          status: 'CANCELLED',
          selectedMenuItems: null,
          menuSpendPaid: 0,
        },
      });
      if (hostMenuSpend > 0) {
        await tx.hostedTable.update({
          where: { id: hostedTableId },
          data: { menuSpendTotal: { decrement: hostMenuSpend } },
        });
      }
    }
    const goingGuests = await tx.hostedTableMember.count({
      where: { hostedTableId, status: 'GOING', userId: { not: hostUserId } },
    });
    if (goingGuests > 0) {
      await tx.hostedTable.update({
        where: { id: hostedTableId },
        data: { status: 'ACTIVE' },
      });
    } else {
      await tx.hostedTable.update({
        where: { id: hostedTableId },
        data: { status: 'CLOSED' },
      });
    }
  }

  await tx.venueTableMember.updateMany({
    where: {
      venueTableId: table.id,
      userId: hostUserId || undefined,
      memberRole: 'HOST',
    },
    data: { status: 'REFUNDED' },
  });

  const guestOccupancy = hostedTableId
    ? await tx.hostedTableMember.count({
        where: { hostedTableId, status: 'GOING' },
      })
    : 0;

  await tx.venueTable.update({
    where: { id: table.id },
    data: {
      hostUserId: null,
      hostedTableId: null,
      currentOccupancy: guestOccupancy,
      status: guestOccupancy > 0 ? 'PARTIALLY_FILLED' : 'AVAILABLE',
      tableSessionNumber: nextSessionNumber,
      isActive: true,
    },
  });

  return { released: true, tableId: table.id, sessionNumber: nextSessionNumber, guestsRetained: guestOccupancy };
}

export function computeCanReleaseTable(table, hostedTable) {
  if (!table) return false;
  if (table.currentOccupancy > 0) return true;
  if (table.status !== 'AVAILABLE') return true;
  if (table.hostUserId) return true;
  if (table.hostedTableId) return true;
  if (hostedTable && hostedTable.status !== 'CLOSED') return true;
  return false;
}
