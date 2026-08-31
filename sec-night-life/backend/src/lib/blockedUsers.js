import { prisma } from './prisma.js';

/**
 * User IDs the viewer has blocked or who have blocked the viewer
 * (friendship BLOCKED + legacy Block rows).
 * @param {string|null|undefined} viewerId
 * @returns {Promise<Set<string>>}
 */
export async function getBlockedUserIdsForViewer(viewerId) {
  const blocked = new Set();
  if (!viewerId) return blocked;

  const [friendships, legacy] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: 'BLOCKED',
        OR: [{ requesterId: viewerId }, { receiverId: viewerId }],
      },
      select: { requesterId: true, receiverId: true },
    }),
    prisma.block.findMany({
      where: {
        OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
      },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  for (const f of friendships) {
    blocked.add(f.requesterId === viewerId ? f.receiverId : f.requesterId);
  }
  for (const r of legacy) {
    if (r.blockerId === viewerId) blocked.add(r.blockedId);
    if (r.blockedId === viewerId) blocked.add(r.blockerId);
  }
  return blocked;
}
