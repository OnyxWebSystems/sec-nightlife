import { prisma } from './prisma.js';
import { logger } from './logger.js';

/**
 * Fire-and-forget friend activity log — never throws to caller.
 */
export function logFriendActivity(payload) {
  (async () => {
    try {
      await prisma.friendActivity.create({ data: payload });
    } catch (e) {
      logger?.warn?.('friend activity log failed', { err: e?.message, payload });
    }
  })();
}
