import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { isStaff } from '../lib/access.js';
import { dedupeInAppRows, filterDuplicateLegacyRows } from '../lib/notificationMerge.js';
import { buildNotificationVenueWhere } from '../lib/notificationVenueScope.js';

const router = Router();

/** Shown on Messages (badge/sound), not the Notifications screen */
const EXCLUDED_IN_APP_TYPES = ['DIRECT_MESSAGE', 'GROUP_MESSAGE'];

function extractQueryParamFromPath(path, key) {
  if (!path || typeof path !== 'string') return null;
  try {
    const parsed = new URL(path, 'https://sec.local');
    return parsed.searchParams.get(key);
  } catch {
    const m = path.match(new RegExp(`[?&]${key}=([^&]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  }
}

function resolveLegacyReferenceId(type, path) {
  if (!path) return null;
  const t = String(type || '').toUpperCase();
  if (t === 'TABLE_APPROVED' || t === 'TABLE_DECLINED' || t === 'TABLE_INVITE' || t === 'TABLE_REQUEST') {
    const tableId = extractQueryParamFromPath(path, 'id');
    if (tableId && !tableId.includes('/')) return tableId;
  }
  if (t === 'TABLE_DECLINED' || t === 'TABLE_MESSAGE') {
    const threadId = extractQueryParamFromPath(path, 'venueTableThread');
    if (threadId) return threadId;
  }
  if (path.startsWith('/') && !path.includes('?')) return path;
  return null;
}

function mapLegacy(n) {
  const path = n.actionUrl?.trim() || null;
  const isRoute = path && path.startsWith('/');
  const referenceId = resolveLegacyReferenceId(n.type, path);
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? '',
    referenceId,
    referenceType: referenceId ? (isRoute ? 'VENUE_TABLE' : 'LEGACY') : isRoute ? 'ROUTE' : path ? 'LEGACY' : null,
    actionUrl: path,
    read: n.isRead,
    createdAt: n.createdAt,
    _source: 'legacy',
  };
}

function mapInApp(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    referenceId: n.referenceId,
    referenceType: n.referenceType,
    read: n.read,
    createdAt: n.createdAt,
    _source: 'in_app',
  };
}

router.get('/unread-count', authenticateToken, async (req, res, next) => {
  try {
    const type = req.query.type ? String(req.query.type) : null;
    const venueScope = await buildNotificationVenueWhere(req.userId, req.query);
    if (!venueScope.ok) return res.status(venueScope.status).json({ error: venueScope.error });

    const inAppWhere = {
      userId: req.userId,
      read: false,
      ...(type ? { type } : { NOT: { type: { in: EXCLUDED_IN_APP_TYPES } } }),
      ...(venueScope.where || {}),
    };
    const legacyWhere = {
      userId: req.userId,
      isRead: false,
      ...(type ? { type } : { NOT: { type: { in: EXCLUDED_IN_APP_TYPES } } }),
      ...(venueScope.where || {}),
    };
    const [inAppCount, legacyCount] = await Promise.all([
      prisma.inAppNotification.count({ where: inAppWhere }),
      prisma.notification.count({ where: legacyWhere }),
    ]);
    res.json({ count: inAppCount + legacyCount });
  } catch (err) {
    next(err);
  }
});

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const take = page * limit;

    const venueScope = await buildNotificationVenueWhere(req.userId, req.query);
    if (!venueScope.ok) return res.status(venueScope.status).json({ error: venueScope.error });

    const baseWhere = {
      userId: req.userId,
      ...(venueScope.where || {}),
    };

    const [inAppRows, legacyRows] = await Promise.all([
      prisma.inAppNotification.findMany({
        where: {
          ...baseWhere,
          NOT: { type: { in: EXCLUDED_IN_APP_TYPES } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.notification.findMany({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const uniqueInApp = dedupeInAppRows(inAppRows);
    const filteredLegacy = filterDuplicateLegacyRows(legacyRows, uniqueInApp);
    const merged = [
      ...uniqueInApp.map(mapInApp),
      ...filteredLegacy.map(mapLegacy),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const slice = merged.slice((page - 1) * limit, page * limit);
    res.json(slice.map(({ _source, ...rest }) => rest));
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const where = { userId: req.userId };
    if (req.query.is_read !== undefined) where.isRead = req.query.is_read === 'true';
    const notifications = await prisma.notification.findMany({ where });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      user_id: z.string().uuid(),
      type: z.string(),
      title: z.string(),
      body: z.string().optional(),
      message: z.string().optional(),
      action_url: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    if (d.user_id !== req.userId && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const n = await prisma.notification.create({
      data: {
        userId: d.user_id,
        type: d.type,
        title: d.title,
        body: d.body ?? d.message,
        actionUrl: d.action_url,
      },
    });
    res.status(201).json({ id: n.id });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', authenticateToken, async (req, res, next) => {
  try {
    const type = req.body?.type ? String(req.body.type) : null;
    const venueScope = await buildNotificationVenueWhere(req.userId, { ...req.query, ...req.body });
    if (!venueScope.ok) return res.status(venueScope.status).json({ error: venueScope.error });

    const baseWhere = {
      userId: req.userId,
      ...(venueScope.where || {}),
    };

    let updated = 0;
    if (type) {
      const r = await prisma.inAppNotification.updateMany({
        where: { ...baseWhere, type, read: false },
        data: { read: true },
      });
      updated += r.count;
    } else {
      const [a, b] = await Promise.all([
        prisma.inAppNotification.updateMany({
          where: { ...baseWhere, read: false },
          data: { read: true },
        }),
        prisma.notification.updateMany({
          where: { ...baseWhere, isRead: false },
          data: { isRead: true },
        }),
      ]);
      updated = a.count + b.count;
    }
    res.json({ updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/:notificationId/read', authenticateToken, async (req, res, next) => {
  try {
    const id = req.params.notificationId;

    const existingInApp = await prisma.inAppNotification.findFirst({
      where: { id, userId: req.userId },
    });

    let inApp;
    if (existingInApp?.type === 'IDENTITY_VERIFICATION_REMINDER') {
      inApp = await prisma.inAppNotification.updateMany({
        where: {
          userId: req.userId,
          type: 'IDENTITY_VERIFICATION_REMINDER',
          read: false,
          title: existingInApp.title,
          ...(existingInApp.referenceId != null
            ? { referenceId: existingInApp.referenceId }
            : { referenceId: null }),
        },
        data: { read: true },
      });
    } else if (existingInApp) {
      inApp = await prisma.inAppNotification.updateMany({
        where: { id, userId: req.userId },
        data: { read: true },
      });
    } else {
      inApp = { count: 0 };
    }

    const legacy = await prisma.notification.updateMany({
      where: { id, userId: req.userId },
      data: { isRead: true },
    });
    if (inApp.count === 0 && legacy.count === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const rowInApp = await prisma.inAppNotification.findFirst({ where: { id, userId: req.userId } });
    if (rowInApp) return res.json(rowInApp);
    const row = await prisma.notification.findFirst({ where: { id, userId: req.userId } });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.patch('/:notificationId/unread', authenticateToken, async (req, res, next) => {
  try {
    const id = req.params.notificationId;

    const [inApp, legacy] = await Promise.all([
      prisma.inAppNotification.updateMany({
        where: { id, userId: req.userId },
        data: { read: false },
      }),
      prisma.notification.updateMany({
        where: { id, userId: req.userId },
        data: { isRead: false },
      }),
    ]);
    if (inApp.count === 0 && legacy.count === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    const rowInApp = await prisma.inAppNotification.findFirst({ where: { id, userId: req.userId } });
    if (rowInApp) return res.json(rowInApp);
    const row = await prisma.notification.findFirst({ where: { id, userId: req.userId } });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const [legacy, inApp] = await Promise.all([
      prisma.notification.deleteMany({
        where: { id: req.params.id, userId: req.userId },
      }),
      prisma.inAppNotification.deleteMany({
        where: { id: req.params.id, userId: req.userId },
      }),
    ]);
    if (legacy.count === 0 && inApp.count === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
