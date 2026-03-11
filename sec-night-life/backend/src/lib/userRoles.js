/**
 * User roles (explicit account types: partygoer, host, business).
 * Ensures role records exist when users create tables, venues, or host events.
 */
import { prisma } from './prisma.js';

export async function ensureUserRole(userId, roleType) {
  if (!userId || !roleType) return;
  await prisma.accountRole.upsert({
    where: {
      userId_roleType: { userId, roleType: String(roleType) },
    },
    create: { userId, roleType: String(roleType) },
    update: {},
  });
}
