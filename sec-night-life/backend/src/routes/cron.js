import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

const router = Router();

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; local/scripts may use `x-cron-secret`. */
function isCronAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const x = req.headers['x-cron-secret'];
  if (x === expected) return true;
  const auth = req.headers.authorization || req.headers.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7) === expected;
  }
  return false;
}

/** Calendar day + optional HH:mm (SAST +02:00) — aligns with venue events in ZA. */
function eventStartDateTime(event) {
  const d = event.date instanceof Date ? event.date : new Date(event.date);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const t =
    event.startTime && /^\d{2}:\d{2}$/.test(String(event.startTime)) ? String(event.startTime) : '18:00';
  return new Date(`${y}-${mo}-${da}T${t}:00+02:00`);
}

router.get('/expire-promotions', async (req, res, next) => {
  try {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const expiredPromotions = await prisma.promotion.updateMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        endAt: { lt: now },
      },
      data: { status: 'ENDED' },
    });

    const expiredBoosts = await prisma.promotion.updateMany({
      where: {
        deletedAt: null,
        boosted: true,
        boostExpiresAt: { lt: now },
      },
      data: { boosted: false },
    });

    res.json({
      expired: expiredPromotions.count,
      boostsExpired: expiredBoosts.count,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/complete-parties', async (req, res, next) => {
  try {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date();
    const r = await prisma.houseParty.updateMany({
      where: { status: 'PUBLISHED', endTime: { lt: now } },
      data: { status: 'COMPLETED' },
    });
    res.json({ completed: r.count });
  } catch (err) {
    next(err);
  }
});

router.get('/expire-table-boosts', async (req, res, next) => {
  try {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date();
    const r = await prisma.hostedTable.updateMany({
      where: { boosted: true, boostExpiresAt: { lt: now } },
      data: { boosted: false },
    });
    res.json({ expired: r.count });
  } catch (err) {
    next(err);
  }
});

/** T-3h reminders for users who saved venue events as interested (deduped per user+event). */
router.get('/event-interest-reminders', async (req, res, next) => {
  try {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date();
    const winStart = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);
    const winEnd = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);

    const published = await prisma.event.findMany({
      where: {
        status: 'published',
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        date: true,
        startTime: true,
        city: true,
      },
    });

    const inWindow = published.filter((e) => {
      const start = eventStartDateTime(e);
      return start >= winStart && start <= winEnd;
    });

    let notified = 0;
    const baseUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

    for (const event of inWindow) {
      const profiles = await prisma.userProfile.findMany({
        where: {
          interestedEvents: { has: event.id },
        },
        select: { userId: true },
      });
      if (profiles.length === 0) continue;

      for (const { userId } of profiles) {
        const existing = await prisma.eventInterestReminderSent.findUnique({
          where: {
            userId_eventId: { userId, eventId: event.id },
          },
        });
        if (existing) continue;

        const eventUrl = `${baseUrl}/EventDetails?id=${encodeURIComponent(event.id)}`;
        const reminderBody = `${event.title} starts in about 3 hours — host a table or join one while spots last.`;

        try {
          await prisma.$transaction([
            prisma.inAppNotification.create({
              data: {
                userId,
                type: 'EVENT_INTEREST_REMINDER',
                title: 'Event starting soon',
                body: reminderBody,
                referenceId: event.id,
                referenceType: 'EVENT',
              },
            }),
            prisma.eventInterestReminderSent.create({
              data: { userId, eventId: event.id },
            }),
          ]);
        } catch (e) {
          if (e?.code === 'P2002') continue;
          logger.warn('event-interest-reminder tx failed', { userId, eventId: event.id, err: e?.message });
          continue;
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, deletedAt: true },
        });
        if (user?.email && !user.deletedAt) {
          try {
            await sendEmail({
              to: user.email,
              subject: `Reminder: ${event.title} starts soon`,
              text:
                `Hi — your saved event "${event.title}" (${event.city || 'Event'}) starts in about 3 hours.\n\n` +
                `Host a table or join one before the night kicks off.\n\n` +
                `Open in the app: ${eventUrl}\n`,
              html:
                `<p>Your saved event <strong>${event.title}</strong> starts in about 3 hours.</p>` +
                `<p>Host a table or join one while there is still space.</p>` +
                `<p><a href="${eventUrl}">View event and tables</a></p>`,
            });
          } catch (mailErr) {
            logger.warn('event-interest-reminder email failed', { userId, eventId: event.id, err: mailErr?.message });
          }
        }
        notified += 1;
      }
    }

    res.json({ eventsInWindow: inWindow.length, notificationsSent: notified });
  } catch (err) {
    next(err);
  }
});

export default router;
