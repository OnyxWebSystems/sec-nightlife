import { prisma } from './prisma.js';

export async function ensurePromoterVenueThread({ venueId, promoterUserId, jobApplicationId = null }) {
  const existing = await prisma.promoterVenueThread.findUnique({
    where: { venueId_promoterUserId: { venueId, promoterUserId } },
  });
  if (existing) {
    if (existing.promoterHiddenAt || existing.venueHiddenAt) {
      return prisma.promoterVenueThread.update({
        where: { id: existing.id },
        data: { promoterHiddenAt: null, venueHiddenAt: null, jobApplicationId: jobApplicationId || existing.jobApplicationId },
      });
    }
    return existing;
  }
  return prisma.promoterVenueThread.create({
    data: { venueId, promoterUserId, jobApplicationId },
  });
}

export async function postPromoterVenueMessage({
  threadId,
  body,
  senderUserId = null,
  kind = 'TEXT',
  eventId = null,
}) {
  const msg = await prisma.promoterVenueMessage.create({
    data: { threadId, body, senderUserId, kind, eventId },
  });
  await prisma.promoterVenueThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
  return msg;
}

export async function notifyPromoterEventAssignment({ venueId, promoterUserId, event, jobApplicationId = null }) {
  const thread = await ensurePromoterVenueThread({ venueId, promoterUserId, jobApplicationId });
  const appBase = (process.env.APP_URL || '').replace(/\/+$/, '');
  const eventPath = `/EventDetails?id=${encodeURIComponent(event.id)}`;
  const body =
    `You've been assigned to promote "${event.title}"` +
    (event.date ? ` on ${new Date(event.date).toLocaleDateString('en-ZA')}` : '') +
    `. Open your promotions tab to copy your promoter link.`;
  await postPromoterVenueMessage({
    threadId: thread.id,
    body,
    kind: 'ASSIGNMENT',
    eventId: event.id,
  });
  await prisma.notification.create({
    data: {
      userId: promoterUserId,
      type: 'PROMOTER_EVENT_ASSIGNED',
      title: 'New event to promote',
      body: `Assigned to "${event.title}" at your venue thread.`,
      actionUrl: `/Messages?promoterVenue=${thread.id}`,
    },
  }).catch(() => {});
  return { threadId: thread.id, eventUrl: appBase ? `${appBase}${eventPath}` : eventPath };
}

export async function welcomePromoterThread({ venueId, promoterUserId, venueName, jobApplicationId }) {
  const thread = await ensurePromoterVenueThread({ venueId, promoterUserId, jobApplicationId });
  const existing = await prisma.promoterVenueMessage.count({ where: { threadId: thread.id } });
  if (existing > 0) return thread;
  await postPromoterVenueMessage({
    threadId: thread.id,
    body: `Welcome! You're now a promoter for ${venueName}. Event assignments and messages from the venue will appear here.`,
    kind: 'SYSTEM',
  });
  return thread;
}

export function promoterVenueThreadPath(threadId) {
  return `/Messages?promoterVenue=${encodeURIComponent(threadId)}`;
}
