import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

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

    const [tablePending, jobUnread] = await Promise.all([
      prisma.venueTableMember.count({
        where: {
          status: 'PENDING_VENUE_REVIEW',
          venueTable: { venueId: { in: venueIds } },
        },
      }),
      prisma.jobMessage.count({
        where: {
          readAt: null,
          senderUserId: { not: req.userId },
          application: {
            status: { in: ['PENDING', 'SHORTLISTED', 'HIRED'] },
            jobPosting: { venueId: { in: venueIds } },
          },
        },
      }),
    ]);

    res.json({ count: tablePending + jobUnread });
  } catch (e) {
    next(e);
  }
});

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const venueIds = await ownedVenueIds(req.userId);
    if (!venueIds.length) return res.json({ items: [] });

    const filter = typeof req.query.type === 'string' ? req.query.type : 'all';

    const items = [];

    if (filter === 'all' || filter === 'tables') {
      const members = await prisma.venueTableMember.findMany({
        where: {
          venueTable: { venueId: { in: venueIds } },
          status: { in: ['PENDING_VENUE_REVIEW', 'APPROVED', 'PENDING_PAYMENT'] },
        },
        include: {
          user: { select: { id: true, fullName: true, userProfile: { select: { username: true, avatarUrl: true } } } },
          venueTable: {
            include: {
              event: { select: { id: true, title: true } },
              venue: { select: { name: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        take: 50,
      });
      for (const m of members) {
        items.push({
          type: 'table_request',
          id: m.id,
          status: m.status,
          title: m.venueTable.tableName,
          subtitle: m.user.userProfile?.username || m.user.fullName || 'Guest',
          body: m.userSpecs?.notes || null,
          referenceId: m.venueTableId,
          eventId: m.venueTable.eventId,
          updatedAt: m.joinedAt,
          unread: m.status === 'PENDING_VENUE_REVIEW',
        });
      }
    }

    if (filter === 'all' || filter === 'jobs') {
      const apps = await prisma.jobApplication.findMany({
        where: {
          jobPosting: { venueId: { in: venueIds } },
          status: { in: ['PENDING', 'SHORTLISTED', 'HIRED'] },
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

    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

export default router;
