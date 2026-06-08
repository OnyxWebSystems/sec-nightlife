import { prisma } from './prisma.js';
import { logger } from './logger.js';

/**
 * Record or refresh a table participation row (fire-and-forget).
 * @param {object} opts
 * @param {string} opts.userId
 * @param {'HOST'|'JOINED'} opts.role
 * @param {string} opts.tableName
 * @param {string} [opts.eventTitle]
 * @param {string} [opts.eventId]
 * @param {string} [opts.tableId]
 * @param {string} [opts.hostedTableId]
 * @param {string} [opts.venueTableId]
 * @param {Date} [opts.occurredAt]
 */
export function recordTableHistory(opts) {
  const {
    userId,
    role,
    tableName,
    eventTitle = null,
    eventId = null,
    tableId = null,
    hostedTableId = null,
    venueTableId = null,
    occurredAt = new Date(),
  } = opts;

  if (!userId || !tableName || !role) return;

  (async () => {
    try {
      const where = {
        userId,
        role,
        hiddenAt: null,
        ...(tableId ? { tableId } : {}),
        ...(hostedTableId ? { hostedTableId } : {}),
        ...(venueTableId ? { venueTableId } : {}),
      };

      const existing = await prisma.userTableHistory.findFirst({
        where,
        orderBy: { occurredAt: 'desc' },
      });

      if (existing) {
        await prisma.userTableHistory.update({
          where: { id: existing.id },
          data: {
            tableName,
            eventTitle,
            eventId,
            occurredAt,
          },
        });
        return;
      }

      await prisma.userTableHistory.create({
        data: {
          userId,
          role,
          tableName,
          eventTitle,
          eventId,
          tableId,
          hostedTableId,
          venueTableId,
          occurredAt,
        },
      });
    } catch (e) {
      logger?.warn?.('table history record failed', { err: e?.message, userId, role });
    }
  })();
}

export function mapTableHistoryRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role === 'HOST' ? 'host' : 'joined',
    tableName: row.tableName,
    eventTitle: row.eventTitle,
    eventId: row.eventId,
    tableId: row.tableId,
    hostedTableId: row.hostedTableId,
    venueTableId: row.venueTableId,
    occurredAt: row.occurredAt,
  };
}
