import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { createInAppNotification } from './inAppNotifications.js';

export async function addUserToHostedTableGroupChat(hostedTableId, userId) {
  try {
    const gc = await prisma.hostedTableGroupChat.findUnique({
      where: { hostedTableId },
      select: {
        id: true,
        hostedTable: { select: { tableName: true } },
      },
    });
    if (!gc) return null;

    const existingMember = await prisma.hostedTableGroupChatMember.findUnique({
      where: {
        hostedTableGroupChatId_userId: { hostedTableGroupChatId: gc.id, userId },
      },
    });

    await prisma.hostedTableGroupChatMember.upsert({
      where: {
        hostedTableGroupChatId_userId: { hostedTableGroupChatId: gc.id, userId },
      },
      create: { hostedTableGroupChatId: gc.id, userId },
      update: {},
    });

    if (!existingMember) {
      const tableName = gc.hostedTable?.tableName || 'a table';
      await createInAppNotification({
        userId,
        type: 'JOIN_REQUEST_ACCEPTED',
        title: "You're in the table group chat",
        body: `You've been added to the group for "${tableName}".`,
        referenceId: gc.id,
        referenceType: 'HOSTED_TABLE_GROUP_CHAT',
      });
    }

    return gc.id;
  } catch (e) {
    logger.warn('addUserToHostedTableGroupChat failed', {
      hostedTableId,
      userId,
      message: e?.message,
    });
    return null;
  }
}

export async function removeUserFromHostedTableGroupChat(hostedTableId, userId) {
  const gc = await prisma.hostedTableGroupChat.findUnique({
    where: { hostedTableId },
    select: { id: true },
  });
  if (!gc) return null;
  await prisma.hostedTableGroupChatMember.deleteMany({
    where: { hostedTableGroupChatId: gc.id, userId: String(userId) },
  });
  return gc.id;
}
