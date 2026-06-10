import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { getTemplateLabel, MESSAGABLE_VENUE_MEMBER_STATUSES } from '../lib/venueTableMessageTemplates.js';

const router = Router();

async function ownedVenueIds(userId) {
  const rows = await prisma.venue.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

router.get('/unread-count', authenticateToken, async (req, res, next) => {
  try {
    const venueIds = await ownedVenueIds(req.userId);
    if (!venueIds.length) return res.json({ count: 0 });

    const [jobUnread, tableThreadUnread] = await Promise.all([
      prisma.jobMessage.count({
        where: {
          readAt: null,
          senderUserId: { not: req.userId },
          application: {
            OR: [
              { status: 'SHORTLISTED', jobPosting: { venueId: { in: venueIds } } },
              { status: 'HIRED', jobPosting: { venueId: { in: venueIds }, positionRole: 'PROMOTER' } },
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
    ]);

    res.json({ count: jobUnread + tableThreadUnread });
  } catch (e) {
    next(e);
  }
});

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const venueIds = await ownedVenueIds(req.userId);
    if (!venueIds.length) return res.json({ items: [] });

    const filter = typeof req.query.type === 'string' ? req.query.type : 'jobs';
    const items = [];

    if (filter === 'jobs') {
      const apps = await prisma.jobApplication.findMany({
        where: {
          jobPosting: { venueId: { in: venueIds } },
          status: { in: ['PENDING', 'SHORTLISTED'] },
        },
        include: {
          jobPosting: { select: { id: true, title: true, jobType: true } },
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
          updatedAt: last?.sentAt || app.updatedAt,
          unread: Boolean(last && !last.readAt && last.senderUserId !== req.userId),
        });
      }
    }

    if (filter === 'promoters') {
      const apps = await prisma.jobApplication.findMany({
        where: {
          jobPosting: { venueId: { in: venueIds }, positionRole: 'PROMOTER' },
          status: 'HIRED',
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
          subtitle: app.applicant.userProfile?.username || app.applicant.fullName || 'Promoter',
          applicantUserId: app.applicant.id,
          venueId: app.jobPosting.venueId,
          body: last?.body || null,
          referenceId: app.jobPostingId,
          applicationId: app.id,
          jobType: app.jobPosting.jobType,
          updatedAt: last?.sentAt || app.updatedAt,
          unread: Boolean(last && !last.readAt && last.senderUserId !== req.userId),
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
                include: { venue: { select: { name: true } }, event: { select: { title: true } } },
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
    const venueIds = await ownedVenueIds(req.userId);
    if (!venueIds.length) return res.status(403).json({ error: 'Forbidden' });

    const application = await prisma.jobApplication.findFirst({
      where: {
        id: req.params.threadId,
        jobPosting: { venueId: { in: venueIds } },
      },
      select: { id: true },
    });
    if (!application) return res.status(404).json({ error: 'Thread not found' });

    await prisma.jobMessage.deleteMany({ where: { applicationId: application.id } });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

export default router;
