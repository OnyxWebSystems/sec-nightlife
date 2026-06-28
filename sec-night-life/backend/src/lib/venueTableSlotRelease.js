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

export function computeCanReleaseTable(table, hostedTable) {
  if (!table) return false;
  if (table.currentOccupancy > 0) return true;
  if (table.status !== 'AVAILABLE') return true;
  if (table.hostUserId) return true;
  if (table.hostedTableId) return true;
  if (hostedTable && hostedTable.status !== 'CLOSED') return true;
  return false;
}
