import { prisma } from './prisma.js';

export const PROMOTER_POINTS = {
  TICKET_PURCHASE: 10,
  TABLE_HOST: 25,
  TABLE_JOIN: 15,
};

const CONVERSION_WINDOW_DAYS = 90;

export function conversionScoreFromPoints(totalPoints) {
  if (!totalPoints || totalPoints <= 0) return 0;
  const capped = Math.min(totalPoints, 500);
  return Math.min(100, (Math.log10(capped + 1) / Math.log10(501)) * 100);
}

export async function validatePromoterAssignment(eventId, promoterUserId) {
  if (!eventId || !promoterUserId) return false;
  const row = await prisma.eventPromoterAssignment.findFirst({
    where: {
      eventId,
      promoterUserId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return !!row;
}

export function promoterUserIdFromMetadata(metadata) {
  const id = metadata?.promoter_user_id || metadata?.promoterUserId || metadata?.ref;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export async function recordPromoterConversion({
  eventId,
  promoterUserId,
  conversionType,
  buyerUserId,
  amountZar,
  paystackReference,
  quantity = 1,
}) {
  if (!eventId || !promoterUserId || !buyerUserId || !conversionType) return null;
  if (promoterUserId === buyerUserId) return null;

  if (paystackReference) {
    const existing = await prisma.promoterConversion.findFirst({
      where: { paystackReference, promoterUserId, conversionType },
      select: { id: true },
    });
    if (existing) return existing;
  }

  const isAssigned = await validatePromoterAssignment(eventId, promoterUserId);
  if (!isAssigned) return null;

  const unitPoints = PROMOTER_POINTS[conversionType] || 0;
  const qty = Math.max(1, Number(quantity) || 1);
  const pointsAwarded = unitPoints * qty;
  if (!pointsAwarded) return null;

  return prisma.promoterConversion.create({
    data: {
      eventId,
      promoterUserId,
      conversionType,
      buyerUserId,
      amountZar: amountZar != null ? Number(amountZar) : null,
      pointsAwarded,
      paystackReference: paystackReference || null,
    },
  });
}

export async function promoterConversionStats(promoterUserIds, { sinceDays = CONVERSION_WINDOW_DAYS } = {}) {
  const map = new Map();
  for (const id of promoterUserIds) {
    map.set(id, { conversionCount: 0, conversionPoints: 0 });
  }
  if (!promoterUserIds.length) return map;

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.promoterConversion.groupBy({
    by: ['promoterUserId'],
    where: {
      promoterUserId: { in: promoterUserIds },
      createdAt: { gte: since },
    },
    _count: { _all: true },
    _sum: { pointsAwarded: true },
  });

  for (const row of rows) {
    map.set(row.promoterUserId, {
      conversionCount: row._count._all,
      conversionPoints: Number(row._sum.pointsAwarded || 0),
    });
  }
  return map;
}

export async function notifyPromoterFollowers({ promoterUserId, title, body, actionUrl }) {
  const followers = await prisma.promoterFollow.findMany({
    where: { promoterId: promoterUserId },
    select: { userId: true },
  });
  if (!followers.length) return;
  await prisma.notification.createMany({
    data: followers.map((f) => ({
      userId: f.userId,
      type: 'PROMOTER_EVENT_ASSIGNED',
      title,
      body,
      actionUrl,
    })),
    skipDuplicates: true,
  });
}
