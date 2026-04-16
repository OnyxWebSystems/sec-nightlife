import { prisma } from './prisma.js';

const POLICY = {
  minAcceptedJobs: 20,
  minRatings: 3,
  minUniqueRaters: 2,
  staleDays: 120,
  scoreWeights: { quality: 45, execution: 30, consistency: 15, compliance: 10 },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function confidenceAdjustedRating(avg, count) {
  if (!count) return 0;
  return (avg * count + 3 * 5) / (count + 5);
}

async function promoterActivityMap(userIds) {
  const map = new Map();
  for (const id of userIds) map.set(id, { acceptedJobs: 0, completedJobs: 0, lastActivityAt: null });
  if (!userIds.length) return map;

  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    select: { applicants: true, updatedAt: true },
  });
  for (const job of jobs) {
    const applicants = Array.isArray(job.applicants) ? job.applicants : [];
    for (const app of applicants) {
      const uid = app?.user_account_id;
      if (!uid || !map.has(uid)) continue;
      const item = map.get(uid);
      if ((app.status || '').toLowerCase() === 'accepted') item.acceptedJobs += 1;
      if (app.work_completed_at) item.completedJobs += 1;
      const d = new Date(app.work_completed_at || job.updatedAt);
      if (!item.lastActivityAt || d > item.lastActivityAt) item.lastActivityAt = d;
    }
  }
  return map;
}

export async function getPromotersLeaderboard({ page = 1, limit = 50 } = {}) {
  const take = Math.max(1, Math.min(Number(limit) || 50, 100));
  const pageNo = Math.max(1, Number(page) || 1);
  const skip = (pageNo - 1) * take;

  const users = await prisma.user.findMany({
    where: { deletedAt: null, suspendedAt: null },
    select: {
      id: true,
      username: true,
      userProfile: {
        select: {
          isVerifiedPromoter: true,
          avatarUrl: true,
          serviceRatingAvg: true,
          serviceRatingCount: true,
          leaderboardHidden: true,
          leaderboardHiddenReason: true,
          leaderboardHiddenUntil: true,
        },
      },
    },
  });
  const userIds = users.map((u) => u.id);
  const staleCutoff = new Date(Date.now() - POLICY.staleDays * 24 * 60 * 60 * 1000);

  const [activity, legalAcceptances, ratingsByUser, reportsByUser, blocksByUser] = await Promise.all([
    promoterActivityMap(userIds),
    prisma.legalDocumentAcceptance.findMany({
      where: { userId: { in: userIds }, documentType: 'PROMOTER_CODE_OF_CONDUCT' },
      orderBy: { acceptedAt: 'desc' },
      select: { userId: true, version: true, acceptedAt: true },
    }),
    prisma.serviceRating.groupBy({
      by: ['rateeUserId'],
      where: { rateeUserId: { in: userIds } },
      _avg: { score: true },
      _count: { _all: true, raterUserId: true },
    }),
    prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'user', targetId: { in: userIds }, status: { in: ['action_taken', 'resolved'] } },
      _count: { _all: true },
    }),
    prisma.block.groupBy({
      by: ['blockedId'],
      where: { blockedId: { in: userIds } },
      _count: { _all: true },
    }),
  ]);

  const acceptanceMap = new Map();
  for (const row of legalAcceptances) if (!acceptanceMap.has(row.userId)) acceptanceMap.set(row.userId, row);
  const ratingMap = new Map(ratingsByUser.map((r) => [r.rateeUserId, r]));
  const reportMap = new Map(reportsByUser.map((r) => [r.targetId, r._count._all]));
  const blockMap = new Map(blocksByUser.map((r) => [r.blockedId, r._count._all]));

  const ranked = users
    .map((u) => {
      const p = u.userProfile;
      const a = activity.get(u.id) || { acceptedJobs: 0, completedJobs: 0, lastActivityAt: null };
      const r = ratingMap.get(u.id);
      const avg = Number(r?._avg?.score ?? p?.serviceRatingAvg ?? 0);
      const ratingCount = Number(r?._count?._all ?? p?.serviceRatingCount ?? 0);
      const uniqueRaters = Number(r?._count?.raterUserId ?? 0);
      const reports = reportMap.get(u.id) || 0;
      const blocks = blockMap.get(u.id) || 0;
      const legal = acceptanceMap.get(u.id);

      const hidden = !!p?.leaderboardHidden &&
        (!p?.leaderboardHiddenUntil || new Date(p.leaderboardHiddenUntil) > new Date());
      const compliancePenalty = reports >= 3;
      const eligible = !!p?.isVerifiedPromoter &&
        a.acceptedJobs >= POLICY.minAcceptedJobs &&
        ratingCount >= POLICY.minRatings &&
        uniqueRaters >= POLICY.minUniqueRaters &&
        !!legal &&
        !!a.lastActivityAt &&
        a.lastActivityAt >= staleCutoff &&
        !hidden &&
        !compliancePenalty;

      const quality = clamp((confidenceAdjustedRating(avg, ratingCount) / 5) * 100, 0, 100);
      const execution = clamp((a.acceptedJobs ? a.completedJobs / a.acceptedJobs : 0) * 100, 0, 100);
      const daysSince = a.lastActivityAt ? (Date.now() - a.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24) : 365;
      const consistency = clamp(100 - daysSince, 0, 100);
      const compliance = clamp(100 - reports * 18 - blocks * 8, 0, 100);
      const score = (
        quality * POLICY.scoreWeights.quality +
        execution * POLICY.scoreWeights.execution +
        consistency * POLICY.scoreWeights.consistency +
        compliance * POLICY.scoreWeights.compliance
      ) / 100;

      return {
        promoterId: u.id,
        username: u.username,
        avatarUrl: p?.avatarUrl || null,
        ratingAvg: Number(avg.toFixed(2)),
        ratingCount,
        uniqueRaters,
        acceptedJobs: a.acceptedJobs,
        completedJobs: a.completedJobs,
        lastActivityAt: a.lastActivityAt,
        score: Number(score.toFixed(2)),
        scoreBreakdown: {
          quality: Number(quality.toFixed(2)),
          execution: Number(execution.toFixed(2)),
          consistency: Number(consistency.toFixed(2)),
          compliance: Number(compliance.toFixed(2)),
        },
        eligibility: {
          isVerifiedPromoter: !!p?.isVerifiedPromoter,
          hasMinimumAcceptedJobs: a.acceptedJobs >= POLICY.minAcceptedJobs,
          hasRatings: ratingCount >= POLICY.minRatings,
          hasUniqueRaters: uniqueRaters >= POLICY.minUniqueRaters,
          hasAcceptedCodeOfConduct: !!legal,
          isActive: !!a.lastActivityAt && a.lastActivityAt >= staleCutoff,
          hasCompliancePenalty: compliancePenalty,
          hiddenByModeration: hidden,
        },
        badges: {
          verified: !!p?.isVerifiedPromoter,
          compliant: !compliancePenalty && compliance >= 70,
          rising: consistency >= 70 && quality >= 60,
        },
      };
    })
    .filter((x) => x.eligibility.isVerifiedPromoter)
    .filter((x) => x.eligibility.hasMinimumAcceptedJobs)
    .filter((x) => x.eligibility.hasRatings)
    .filter((x) => x.eligibility.hasUniqueRaters)
    .filter((x) => x.eligibility.hasAcceptedCodeOfConduct)
    .filter((x) => x.eligibility.isActive)
    .filter((x) => !x.eligibility.hasCompliancePenalty)
    .filter((x) => !x.eligibility.hiddenByModeration)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.scoreBreakdown.quality !== a.scoreBreakdown.quality) return b.scoreBreakdown.quality - a.scoreBreakdown.quality;
      if (b.completedJobs !== a.completedJobs) return b.completedJobs - a.completedJobs;
      return new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime();
    })
    .map((x, i) => ({ ...x, rank: i + 1 }));

  return {
    policy: POLICY,
    page: pageNo,
    limit: take,
    total: ranked.length,
    data: ranked.slice(skip, skip + take),
  };
}

