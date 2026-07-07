/**
 * System notice on venue table booking threads when a refund is approved.
 */

const REFUND_NOTICE_LABELS = {
  TABLE_HOST_WITH_GUESTS:
    'Refund approved — your host pass for this table has ended. Remaining guests keep their passes and join fees.',
  TABLE_HOST_SOLO: 'Refund approved — your host pass for this table has been cancelled.',
  TABLE_JOIN: 'Refund approved — your table join has been cancelled.',
};

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function appendVenueTableRefundNotice(
  tx,
  { venueTableMemberId, refundType, guestsRetained = false },
) {
  if (!venueTableMemberId) return;

  const member = await tx.venueTableMember.findUnique({
    where: { id: venueTableMemberId },
    select: {
      id: true,
      userId: true,
      venueTable: {
        select: {
          venue: { select: { ownerUserId: true } },
        },
      },
    },
  });
  if (!member?.venueTable?.venue?.ownerUserId) return;

  let label = null;
  if (refundType === 'TABLE_HOST') {
    label = guestsRetained
      ? REFUND_NOTICE_LABELS.TABLE_HOST_WITH_GUESTS
      : REFUND_NOTICE_LABELS.TABLE_HOST_SOLO;
  } else if (refundType === 'TABLE_JOIN') {
    label = REFUND_NOTICE_LABELS.TABLE_JOIN;
  }
  if (!label) return;

  const thread = await tx.venueTableThread.upsert({
    where: { venueTableMemberId },
    create: { venueTableMemberId },
    update: { deletedAt: null, updatedAt: new Date() },
  });

  await tx.venueTableMessage.create({
    data: {
      threadId: thread.id,
      senderUserId: member.venueTable.venue.ownerUserId,
      templateKey: 'refund_approved',
      displayLabel: label,
    },
  });

  await tx.venueTableThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });
}
