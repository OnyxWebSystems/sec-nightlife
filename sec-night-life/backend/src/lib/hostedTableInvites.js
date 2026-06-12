/**
 * Keep table_invites in sync when guests join outside the invite-respond flow.
 * @param {import('@prisma/client').Prisma.TransactionClient | typeof import('./prisma.js').prisma} tx
 */
export async function reconcileTableInvitesOnJoin(tx, hostedTableId, userId) {
  if (!hostedTableId || !userId) return;
  await tx.tableInvite.updateMany({
    where: {
      hostedTableId: String(hostedTableId),
      inviteeUserId: String(userId),
      status: 'PENDING',
    },
    data: { status: 'ACCEPTED', respondedAt: new Date() },
  });
}

/** Clear invite state when a guest leaves so stale pending badges do not reappear. */
export async function reconcileTableInvitesOnLeave(tx, hostedTableId, userId) {
  if (!hostedTableId || !userId) return;
  await tx.tableInvite.updateMany({
    where: {
      hostedTableId: String(hostedTableId),
      inviteeUserId: String(userId),
      status: { in: ['PENDING', 'ACCEPTED'] },
    },
    data: { status: 'DECLINED', respondedAt: new Date() },
  });
}

/** Count pending invites excluding invitees who are already GOING members. */
export async function countPendingTableInvites(db, { hostedTableIds, inviterUserId = null }) {
  if (!hostedTableIds?.length) return {};
  const pendingInvites = await db.tableInvite.findMany({
    where: {
      hostedTableId: { in: hostedTableIds },
      status: 'PENDING',
      ...(inviterUserId ? { inviterUserId } : {}),
    },
    select: { hostedTableId: true, inviteeUserId: true },
  });
  if (!pendingInvites.length) return {};

  const activeMembers = await db.hostedTableMember.findMany({
    where: {
      hostedTableId: { in: hostedTableIds },
      status: { in: ['GOING', 'PENDING'] },
    },
    select: { hostedTableId: true, userId: true },
  });
  const activeMemberSet = new Set(activeMembers.map((m) => `${m.hostedTableId}:${m.userId}`));

  const counts = {};
  for (const inv of pendingInvites) {
    if (activeMemberSet.has(`${inv.hostedTableId}:${inv.inviteeUserId}`)) continue;
    counts[inv.hostedTableId] = (counts[inv.hostedTableId] || 0) + 1;
  }
  return counts;
}

export async function countPendingTableInvitesForTable(db, hostedTableId) {
  const map = await countPendingTableInvites(db, { hostedTableIds: [hostedTableId] });
  return map[hostedTableId] ?? 0;
}

/** Guest slots left for new invites (host counts as one seat). */
export async function remainingInviteSlotsForTable(db, table) {
  if (!table?.id) return 0;
  const guestCapacity = Math.max(1, Number(table.guestQuantity) || 1);
  const maxGuestSlots = Math.max(0, guestCapacity - 1);
  let goingGuests = 0;
  if (Array.isArray(table.members)) {
    goingGuests = table.members.filter(
      (m) => m.status === 'GOING' && m.userId !== table.hostUserId,
    ).length;
  } else {
    goingGuests = await db.hostedTableMember.count({
      where: {
        hostedTableId: table.id,
        status: 'GOING',
        userId: { not: table.hostUserId },
      },
    });
  }
  const pendingInvites = await countPendingTableInvitesForTable(db, table.id);
  return Math.max(0, maxGuestSlots - goingGuests - pendingInvites);
}
