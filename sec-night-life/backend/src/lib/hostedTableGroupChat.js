import { prisma } from './prisma.js';

export async function addUserToHostedTableGroupChat(hostedTableId, userId) {
  const gc = await prisma.hostedTableGroupChat.findUnique({
    where: { hostedTableId },
    select: { id: true },
  });
  if (!gc) return null;
  await prisma.hostedTableGroupChatMember.upsert({
    where: {
      hostedTableGroupChatId_userId: { hostedTableGroupChatId: gc.id, userId },
    },
    create: { hostedTableGroupChatId: gc.id, userId },
    update: {},
  });
  return gc.id;
}
