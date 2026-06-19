import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  resolveAccessibleVenueIds,
  resolveBusinessVenueScope,
  staffCtxFromQuery,
  venueIdFromQuery,
} from '../lib/access.js';
import { getTemplateLabel, MESSAGABLE_VENUE_MEMBER_STATUSES } from '../lib/venueTableMessageTemplates.js';
import { ensurePromoterVenueThread } from '../lib/promoterVenueThread.js';

const router = Router();

async function resolveInboxVenueIds(userId, query) {
  const venueIdFilter = venueIdFromQuery(query);
  const staffCtx = staffCtxFromQuery(query);
  if (venueIdFilter || staffCtx) {
    const scope = await resolveBusinessVenueScope(userId, {
      venueIdFilter,
      staffCtx,
      permission: 'messages',
    });
    if (!scope.ok) return { ok: false, status: scope.status || 403, error: scope.error || 'Forbidden' };
    if (!scope.venueIds.length) return { ok: false, status: 404, error: 'Venue not found' };
    return { ok: true, venueIds: scope.venueIds };
  }
  const venueIds = await resolveAccessibleVenueIds(userId, { permission: 'messages' });
  return { ok: true, venueIds };
}

router.get('/unread-count', authenticateToken, async (req, res, next) => {
  try {
    const resolved = await resolveInboxVenueIds(req.userId, req.query);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const venueIds = resolved.venueIds;
    if (!venueIds.length) return res.json({ count: 0 });

    const [jobUnread, tableThreadUnread, promoterVenueUnread] = await Promise.all([
      prisma.jobMessage.count({
        where: {
          readAt: null,
          senderUserId: { not: req.userId },
          application: {
            OR: [
              { status: 'SHORTLISTED', jobPosting: { venueId: { in: venueIds } } },
            ],
          },
        },
      }),
      prisma.venueTableMessage.count({
        where: {
          readAt: null,
          senderUserId: { not: req.userId },
          thread: {
            deletedAt: null,
            member: {
              venueTable: { venueId: { in: venueIds } },
              status: { in: MESSAGABLE_VENUE_MEMBER_STATUSES },
            },
          },
        },
      }),
      prisma.promoterVenueMessage.count({
        where: {
          readAt: null,
          OR: [{ senderUserId: null }, { senderUserId: { not: req.userId } }],
          thread: { venueId: { in: venueIds }, venueHiddenAt: null },
        },
      }),
    ]);

    res.json({ count: jobUnread + tableThreadUnread + promoterVenueUnread });
  } catch (e) {
    next(e);
  }
});

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const resolved = await resolveInboxVenueIds(req.userId, req.query);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const venueIds = resolved.venueIds;
    if (!venueIds.length) return res.json({ items: [] });

    const filter = typeof req.query.type === 'string' ? req.query.type : 'jobs';
    const items = [];

    if (filter === 'jobs') {
      const apps = await prisma.jobApplication.findMany({
        where: {
          jobPosting: { venueId: { in: venueIds } },
          status: { in: ['PENDING', 'SHORTLISTED'] },
          venueHiddenAt: null,
        },
        include: {
          jobPosting: { select: { id: true, title: true, jobType: true, venueId: true } },
          applicant: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } },
          messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      for (const app of apps) {
        const last = app.messages[0];
        items.push({
          type: 'job',
          id: app.id,
          status: app.status,
          title: app.jobPosting.title,
          subtitle: app.applicant.userProfile?.username || app.applicant.fullName || 'Applicant',
          body: last?.body || null,
          referenceId: app.jobPostingId,
          applicationId: app.id,
          jobType: app.jobPosting.jobType,
          venueId: app.jobPosting.venueId,
          updatedAt: last?.sentAt || app.updatedAt,
          unread: Boolean(last && !last.readAt && last.senderUserId !== req.userId),
        });
      }
    }

    if (filter === 'promoters') {
      const hiredApps = await prisma.jobApplication.findMany({
        where: {
          jobPosting: { venueId: { in: venueIds }, positionRole: 'PROMOTER' },
          status: 'HIRED',
        },
        select: {
          id: true,
          applicantUserId: true,
          jobPosting: { select: { venueId: true, venue: { select: { name: true } } } },
        },
      });
      await Promise.all(
        hiredApps.map((app) =>
          ensurePromoterVenueThread({
            venueId: app.jobPosting.venueId,
            promoterUserId: app.applicantUserId,
            jobApplicationId: app.id,
          }),
        ),
      );

      const threads = await prisma.promoterVenueThread.findMany({
        where: { venueId: { in: venueIds }, venueHiddenAt: null },
        include: {
          venue: { select: { id: true, name: true } },
          promoter: {
            select: {
              id: true,
              fullName: true,
              userProfile: { select: { username: true, avatarUrl: true } },
            },
          },
          messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      for (const t of threads) {
        const last = t.messages[0];
        const unread = await prisma.promoterVenueMessage.count({
          where: {
            threadId: t.id,
            readAt: null,
            OR: [{ senderUserId: null }, { senderUserId: { not: req.userId } }],
          },
        });
        items.push({
          type: 'promoter_venue_thread',
          id: t.id,
          threadId: t.id,
          title: t.promoter.userProfile?.username || t.promoter.fullName || 'Promoter',
          subtitle: t.venue.name,
          applicantUserId: t.promoterUserId,
          venueId: t.venueId,
          body: last?.body || null,
          updatedAt: last?.sentAt || t.updatedAt,
          unread: unread > 0,
        });
      }
    }

    if (filter === 'tables') {
      const threads = await prisma.venueTableThread.findMany({
        where: {
          deletedAt: null,
          member: {
            venueTable: { venueId: { in: venueIds } },
            status: { in: MESSAGABLE_VENUE_MEMBER_STATUSES },
          },
        },
        include: {
          member: {
            include: {
              user: { select: { fullName: true, userProfile: { select: { username: true } } } },
              venueTable: {
                include: { venue: { select: { id: true, name: true } }, event: { select: { title: true } } },
              },
            },
          },
          messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });
      for (const t of threads) {
        const last = t.messages[0];
        items.push({
          type: 'venue_table_thread',
          id: t.member.id,
          threadId: t.id,
          status: t.member.status,
          title: t.member.venueTable.tableName,
          subtitle: `${t.member.venueTable.venue.name}${t.member.venueTable.event?.title ? ` · ${t.member.venueTable.event.title}` : ''} · ${t.member.user.userProfile?.username || t.member.user.fullName || 'Guest'}`,
          body: last ? (last.displayLabel || getTemplateLabel(last.templateKey)) : null,
          referenceId: t.member.venueTableId,
          venueId: t.member.venueTable.venue.id,
          updatedAt: last?.sentAt || t.updatedAt,
          unread: Boolean(last && !last.readAt && last.senderUserId !== req.userId),
        });
      }
    }

    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

router.delete('/threads/:threadId', authenticateToken, async (req, res, next) => {
  try {
    const resolved = await resolveInboxVenueIds(req.userId, req.query);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const venueIds = resolved.venueIds;
    if (!venueIds.length) return res.status(403).json({ error: 'Forbidden' });

    const application = await prisma.jobApplication.findFirst({
      where: {
        id: req.params.threadId,
        jobPosting: { venueId: { in: venueIds } },
      },
      select: { id: true },
    });
    if (!application) return res.status(404).json({ error: 'Thread not found' });

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: { venueHiddenAt: new Date() },
    });
    res.json({ deleted: true, hidden: true });
  } catch (e) {
    next(e);
  }
});

export default router;
