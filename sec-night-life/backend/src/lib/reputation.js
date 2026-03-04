/**
 * Reputation Engine — server-side only.
 * Score is NEVER accepted from the frontend.
 *
 * Score range: 0–100
 * Components:
 *   - Attendance consistency (positive)
 *   - Reports received (negative)
 *   - Blocks received (negative)
 *   - Event participation (positive)
 *   - Table participation (positive)
 */
import { prisma } from './prisma.js';

const WEIGHTS = {
  baseScore: 50,
  perAttendance: 2,
  perEventParticipation: 1.5,
  perTableParticipation: 1,
  perReportReceived: -5,
  perBlockReceived: -3,
  maxAttendanceBonus: 30,
  maxParticipationBonus: 20
};

/**
 * Compute and persist reputation score for a user.
 * @param {string} userId
 * @returns {Promise<number>} computed score
 */
export async function computeReputation(userId) {
  const [attendance, reportsReceived, blocksReceived, tableCount] = await Promise.all([
    prisma.eventAttendance.count({ where: { userId, confirmed: true } }),
    prisma.report.count({ where: { targetType: 'user', targetId: userId, status: 'resolved' } }),
    prisma.block.count({ where: { blockedId: userId } }),
    prisma.table.count({ where: { hostUserId: userId, deletedAt: null } })
  ]);

  const attendanceBonus = Math.min(attendance * WEIGHTS.perAttendance, WEIGHTS.maxAttendanceBonus);
  const participationBonus = Math.min(
    tableCount * WEIGHTS.perTableParticipation,
    WEIGHTS.maxParticipationBonus
  );
  const penaltyReports = reportsReceived * Math.abs(WEIGHTS.perReportReceived);
  const penaltyBlocks = blocksReceived * Math.abs(WEIGHTS.perBlockReceived);

  const raw = WEIGHTS.baseScore + attendanceBonus + participationBonus - penaltyReports - penaltyBlocks;
  const score = Math.max(0, Math.min(100, raw));

  await prisma.reputationScore.upsert({
    where: { userId },
    create: {
      userId,
      score,
      attendanceScore: attendanceBonus,
      reportsReceived,
      blocksReceived,
      eventParticipation: attendance,
      tableParticipation: tableCount,
      computedAt: new Date()
    },
    update: {
      score,
      attendanceScore: attendanceBonus,
      reportsReceived,
      blocksReceived,
      eventParticipation: attendance,
      tableParticipation: tableCount,
      computedAt: new Date()
    }
  });

  return score;
}

/**
 * Get cached reputation score for a user, computing if not present.
 */
export async function getReputation(userId) {
  const cached = await prisma.reputationScore.findUnique({ where: { userId } });
  if (cached) return cached;
  const score = await computeReputation(userId);
  return prisma.reputationScore.findUnique({ where: { userId } });
}
