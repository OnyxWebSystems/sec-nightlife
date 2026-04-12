import { prisma } from './prisma.js';

function extractUserIdsFromMembers(members) {
  const list = Array.isArray(members) ? members : [];
  const ids = list
    .map((m) => {
      if (!m) return null;
      if (typeof m === 'string') return m;
      if (typeof m === 'object') return m.user_id || m.userId || null;
      return null;
    })
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * @param {string} reviewerId
 * @param {string} subjectUserId
 * @param {string | null} [eventId] — if set, eligibility requires this event to be in the shared past set
 * @returns {Promise<{ eligible: boolean, sharedEvents: { id: string, name: string, date: Date }[] }>}
 */
export async function checkUserReviewEligibility(reviewerId, subjectUserId, eventId = null) {
  if (reviewerId === subjectUserId) {
    return { eligible: false, sharedEvents: [] };
  }

  const now = new Date();

  const [reviewerAtt, subjectAtt] = await Promise.all([
    prisma.eventAttendance.findMany({ where: { userId: reviewerId }, select: { eventId: true } }),
    prisma.eventAttendance.findMany({ where: { userId: subjectUserId }, select: { eventId: true } }),
  ]);

  const reviewerSet = new Set(reviewerAtt.map((a) => a.eventId));
  const sharedFromAttendance = subjectAtt.filter((a) => reviewerSet.has(a.eventId)).map((a) => a.eventId);

  const attendanceEvents =
    sharedFromAttendance.length === 0
      ? []
      : await prisma.event.findMany({
          where: {
            id: { in: sharedFromAttendance },
            date: { lt: now },
            deletedAt: null,
          },
          select: { id: true, title: true, date: true },
        });

  const tableRows = await prisma.table.findMany({
    where: {
      deletedAt: null,
      event: { date: { lt: now }, deletedAt: null },
    },
    select: {
      hostUserId: true,
      members: true,
      eventId: true,
      event: { select: { id: true, title: true, date: true } },
    },
  });

  const fromTables = [];
  for (const t of tableRows) {
    const memberIds = extractUserIdsFromMembers(t.members);
    const host = t.hostUserId;
    const interacts =
      (host === reviewerId && memberIds.includes(subjectUserId)) ||
      (host === subjectUserId && memberIds.includes(reviewerId));
    if (interacts && t.event) {
      fromTables.push({ id: t.event.id, title: t.event.title, date: t.event.date });
    }
  }

  const byId = new Map();
  for (const e of [...attendanceEvents, ...fromTables]) {
    byId.set(e.id, e);
  }

  const sharedEvents = [...byId.values()].sort((a, b) => b.date.getTime() - a.date.getTime());

  let eligible = sharedEvents.length > 0;
  if (eligible && eventId) {
    eligible = sharedEvents.some((e) => e.id === eventId);
  }

  return {
    eligible,
    sharedEvents: sharedEvents.map((e) => ({ id: e.id, name: e.title, date: e.date })),
  };
}
