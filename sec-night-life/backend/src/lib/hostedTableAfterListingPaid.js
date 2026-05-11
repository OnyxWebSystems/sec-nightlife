import { prisma } from './prisma.js';

/**
 * After host listing payment succeeds: create group chat + host as GOING and set spotsRemaining.
 * Safe to call if group/members already exist (no-op for those parts).
 */
export async function ensureHostedTableLiveAfterListingPayment(hostedTableId) {
  await prisma.$transaction(async (tx) => {
    const ht = await tx.hostedTable.findUnique({
      where: { id: String(hostedTableId) },
      include: {
        groupChat: { select: { id: true } },
        members: { select: { id: true, userId: true, status: true } },
      },
    });
    if (!ht) return;

    if (!ht.groupChat) {
      await tx.hostedTableGroupChat.create({
        data: {
          hostedTableId: ht.id,
          name: ht.tableName,
          members: { create: [{ userId: ht.hostUserId }] },
        },
      });
    } else {
      await tx.hostedTableGroupChatMember.upsert({
        where: {
          hostedTableGroupChatId_userId: { hostedTableGroupChatId: ht.groupChat.id, userId: ht.hostUserId },
        },
        create: { hostedTableGroupChatId: ht.groupChat.id, userId: ht.hostUserId },
        update: {},
      });
    }

    const hostGoing = ht.members.some((m) => m.userId === ht.hostUserId && m.status === 'GOING');
    if (!hostGoing) {
      await tx.hostedTableMember.create({
        data: { hostedTableId: ht.id, userId: ht.hostUserId, status: 'GOING' },
      });
    }

    const nextSpots = Math.max(0, Number(ht.guestQuantity) - 1);
    await tx.hostedTable.update({
      where: { id: ht.id },
      data: { spotsRemaining: nextSpots },
    });
  });
}
