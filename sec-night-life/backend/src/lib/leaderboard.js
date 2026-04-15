import { prisma } from './prisma.js';

const POLICY = {
  minAcceptedJobs: 20,
  minRatings: 5,
  minUniqueRaters: 3,
  staleDays: 120,
  scoreWeights: {
    quality: 45,
    execution: 30,
    consistency: 15,
    compliance: 10,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeScore(value, maxValue = 100) {
  if (!Number.isFinite(value) || maxValue <= 0) return 0;
  return clamp((value / maxValue) * 100, 0, 100);
}

function lowerBoundRating(avg, count) {
  if (!count || count <= 0) return 0;
  // Conservative confidence adjustment for low-volume ratings.
  return (avg * count + 3 * 5) / (count + 5);
}

export async function getPromoterPerformanceMap(promoterIds) {
  if (!promoterIds?.length) return new Map();
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
    },
    select: { id: true, applicants: true, updatedAt: true },
  });
  const map = new Map();
  for (const promoterId of promoterIds) {
    map.set(promoterId, {
      acceptedJobs: 0,
      completedJobs: 0,
      lastActivityAt: null,
    });
  }

  for (const job of jobs) {
    const applicants = Array.isArray(job.applicants) ? job.applicants : [];
    for (const app of applicants) {
      if (!app || typeof app !== 'object') continue;
      const promoterId = app.user_account_id;
      if (!map.has(promoterId)) continue;
      const metrics = map.get(promoterId);
      if ((app.status || '').toLowerCase() === 'accepted') {
        metrics.acceptedJobs += 1;
      }
      if (app.work_completed_at) {
        metrics.completedJobs += 1;
      }
      const candidateDate = app.work_completed_at || job.updatedAt;
      if (candidateDate) {
        const dateObj = new Date(candidateDate);
        if (!metrics.lastActivityAt || dateObj > metrics.lastActivityAt) {
          metrics.lastActivityAt = dateObj;
        }
      }
    }
  }
  return map;
}

async function getComplianceSignals(userIds) {
  const [reportRows, blockRows] = await Promise.all([
    prisma.report.groupBy({
      by: ['targetId'],
      where: {
        targetType: 'user',
        targetId: { in: userIds },
        status: { in: ['action_taken', 'resolved'] },
      },
      _count: { _all: true },
    }),
    prisma.block.groupBy({
      by: ['blockedId'],
      where: { blockedId: { in: userIds } },
      _count: { _all: true },
    }),
  ]);

  const reportsByUser = new Map(reportRows.map((row) => [row.targetId, row._count._all]));
  const blocksByUser = new Map(blockRows.map((row) => [row.blockedId, row._count._all]));
  return { reportsByUser, blocksByUser };
}

export async function getPromotersLeaderboard({ page = 1, limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const pageNumber = Math.max(Number(page) || 1, 1);

  const promoterUsers = await prisma.user.findMany({
    where: { deletedAt: null, suspendedAt: null },
    select: {
      id: true,
      username: true,
      suspendedAt: true,
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

  const promoterIds = promoterUsers.map((u) => u.id);
  const [performanceMap, compliance, ratingAgg, legalAcceptances] = await Promise.all([
    getPromoterPerformanceMap(promoterIds),
    getComplianceSignals(promoterIds),
    prisma.serviceRating.groupBy({
      by: ['rateeUserId'],
      where: { rateeUserId: { in: promoterIds } },
      _count: { _all: true, raterUserId: true },
      _avg: { score: true },
    }),
    prisma.legalDocumentAcceptance.findMany({
      where: {
        userId: { in: promoterIds },
        documentType: 'PROMOTER_CODE_OF_CONDUCT',
      },
      orderBy: { acceptedAt: 'desc' },
      select: { userId: true, version: true, acceptedAt: true },
    }),
  ]);

  const ratingsByUser = new Map(ratingAgg.map((row) => [row.rateeUserId, row]));
  const legalByUser = new Map();
  for (const acceptance of legalAcceptances) {
    if (!legalByUser.has(acceptance.userId)) legalByUser.set(acceptance.userId, acceptance);
  }
  const staleCutoff = new Date(Date.now() - POLICY.staleDays * 24 * 60 * 60 * 1000);

  const scored = promoterUsers
    .map((user) => {
      const profile = user.userProfile;
      const perf = performanceMap.get(user.id) || { acceptedJobs: 0, completedJobs: 0, lastActivityAt: null };
      const ratings = ratingsByUser.get(user.id);
      const uniqueRaters = ratings?._count?.raterUserId || 0;
      const ratingCount = ratings?._count?._all || profile?.serviceRatingCount || 0;
      const rawAvg = ratings?._avg?.score ?? profile?.serviceRatingAvg ?? 0;
      const safeAvg = Number.isFinite(rawAvg) ? rawAvg : 0;
      const legalAcceptance = legalByUser.get(user.id);
      const reportCount = compliance.reportsByUser.get(user.id) || 0;
      const blockCount = compliance.blocksByUser.get(user.id) || 0;
      const flaggedCompliance = reportCount >= 3;
      const hiddenByModeration = !!profile?.leaderboardHidden && (!profile?.leaderboardHiddenUntil || new Date(profile.leaderboardHiddenUntil) > new Date());

      const eligibility = {
        isVerifiedPromoter: !!profile?.isVerifiedPromoter,
        acceptedJobs: perf.acceptedJobs,
        hasMinimumAcceptedJobs: perf.acceptedJobs >= POLICY.minAcceptedJobs,
        hasRatings: ratingCount >= POLICY.minRatings,
        hasUniqueRaters: uniqueRaters >= POLICY.minUniqueRaters,
        hasAcceptedCodeOfConduct: !!legalAcceptance,
        isActive: !!perf.lastActivityAt && perf.lastActivityAt >= staleCutoff,
        hasCompliancePenalty: flaggedCompliance,
        hiddenByModeration,
      };

      const isEligible = eligibility.isVerifiedPromoter &&
        eligibility.hasMinimumAcceptedJobs &&
        eligibility.hasRatings &&
        eligibility.hasUniqueRaters &&
        eligibility.hasAcceptedCodeOfConduct &&
        eligibility.isActive &&
        !eligibility.hasCompliancePenalty;
      const finalEligible = isEligible && !eligibility.hiddenByModeration;

      const qualityScore = normalizeScore(lowerBoundRating(safeAvg, ratingCount), 5);
      const executionRatio = perf.acceptedJobs > 0 ? perf.completedJobs / perf.acceptedJobs : 0;
      const executionScore = normalizeScore(executionRatio, 1);
      const recencyDays = perf.lastActivityAt ? (Date.now() - perf.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24) : 999;
      const consistencyScore = clamp(100 - recencyDays, 0, 100);
      const complianceScore = clamp(100 - reportCount * 18 - blockCount * 8, 0, 100);

      const weightedScore = (
        qualityScore * POLICY.scoreWeights.quality +
        executionScore * POLICY.scoreWeights.execution +
        consistencyScore * POLICY.scoreWeights.consistency +
        complianceScore * POLICY.scoreWeights.compliance
      ) / 100;

      return {
        promoterId: user.id,
        username: user.username,
        avatarUrl: profile?.avatarUrl || null,
        ratingAvg: Number(safeAvg.toFixed(2)),
        ratingCount,
        uniqueRaters,
        acceptedJobs: perf.acceptedJobs,
        completedJobs: perf.completedJobs,
        lastActivityAt: perf.lastActivityAt,
        score: Number(weightedScore.toFixed(2)),
        scoreBreakdown: {
          quality: Number(qualityScore.toFixed(2)),
          execution: Number(executionScore.toFixed(2)),
          consistency: Number(consistencyScore.toFixed(2)),
          compliance: Number(complianceScore.toFixed(2)),
        },
        badges: {
          verified: !!profile?.isVerifiedPromoter,
          compliant: complianceScore >= 75 && !flaggedCompliance,
          rising: consistencyScore >= 70 && qualityScore >= 60,
        },
        eligibility,
        legalAcceptance: legalAcceptance
          ? { version: legalAcceptance.version, acceptedAt: legalAcceptance.acceptedAt }
          : null,
        moderation: {
          hidden: hiddenByModeration,
          reason: profile?.leaderboardHiddenReason || null,
          hiddenUntil: profile?.leaderboardHiddenUntil || null,
        },
        isEligible: finalEligible,
      };
    })
    .filter((row) => row.eligibility ? true : true);

  const eligibleRows = scored
    .filter((row) => {
      const e = row.eligibility;
      return e.isVerifiedPromoter &&
        e.hasMinimumAcceptedJobs &&
        e.hasRatings &&
        e.hasUniqueRaters &&
        e.hasAcceptedCodeOfConduct &&
        e.isActive &&
        !e.hasCompliancePenalty &&
        !e.hiddenByModeration;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.scoreBreakdown.quality !== a.scoreBreakdown.quality) return b.scoreBreakdown.quality - a.scoreBreakdown.quality;
      if (b.completedJobs !== a.completedJobs) return b.completedJobs - a.completedJobs;
      const aTime = a.lastActivityAt ? a.lastActivityAt.getTime() : 0;
      const bTime = b.lastActivityAt ? b.lastActivityAt.getTime() : 0;
      return bTime - aTime;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const total = eligibleRows.length;
  const offset = (pageNumber - 1) * take;
  const pageRows = eligibleRows.slice(offset, offset + take);

  return {
    policy: POLICY,
    page: pageNumber,
    limit: take,
    total,
    data: pageRows,
  };
}

export async function getPromoterLeaderboardStatus(userId) {
  const leaderboard = await getPromotersLeaderboard({ page: 1, limit: 500 });
  const rankedRow = leaderboard.data.find((row) => row.promoterId === userId);
  if (rankedRow) {
    return {
      featured: true,
      rank: rankedRow.rank,
      score: rankedRow.score,
      badges: rankedRow.badges,
      eligibility: rankedRow.eligibility,
      nextSteps: [],
    };
  }

  const users = await prisma.user.findMany({
    where: { id: userId, deletedAt: null, suspendedAt: null },
    select: { id: true },
  });
  if (users.length === 0) {
    return { featured: false, rank: null, score: 0, eligibility: null, nextSteps: ['Account unavailable'] };
  }

  const all = await getPromotersLeaderboard({ page: 1, limit: 1000 });
  const eligibleOrCandidate = all.data.find((row) => row.promoterId === userId);
  if (eligibleOrCandidate) {
    return {
      featured: false,
      rank: null,
      score: eligibleOrCandidate.score,
      badges: eligibleOrCandidate.badges,
      eligibility: eligibleOrCandidate.eligibility,
      nextSteps: [],
    };
  }

  return {
    featured: false,
    rank: null,
    score: 0,
    badges: { verified: false, compliant: false, rising: false },
    eligibility: null,
    nextSteps: [
      'Get verified as a promoter',
      'Complete at least 20 accepted promoter jobs',
      'Accept the latest promoter code of conduct',
      'Maintain consistent activity and quality ratings',
    ],
  };
}

