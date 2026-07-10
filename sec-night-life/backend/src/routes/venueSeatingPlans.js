import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import {
  resolveBusinessVenueScope,
  staffCtxFromQuery,
  venueIdFromQuery,
  staffHasVenuePermission,
} from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { mapSeatingPlanForBusiness } from '../lib/seatingPlanHelpers.js';

const router = Router();

async function requireBookingsScope(req, res) {
  const staffCtx = staffCtxFromQuery(req.query);
  const venueIdFilter = venueIdFromQuery(req.query);
  const scope = await resolveBusinessVenueScope(req.userId, {
    staffCtx,
    venueIdFilter,
    permission: 'seating_plans',
  });
  if (!scope.ok) {
    res.status(scope.status || 403).json({ error: scope.error || 'Forbidden' });
    return null;
  }
  const venueId = venueIdFilter || scope.venueIds[0];
  if (!venueId || !scope.venueIds.includes(venueId)) {
    res.status(400).json({ error: 'venue_id is required' });
    return null;
  }
  if (!(await staffHasVenuePermission(req.userId, venueId, 'seating_plans'))) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return venueId;
}

const createSchema = z.object({
  venue_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  caption: z.string().max(500).optional().nullable(),
  image_url: z.string().url(),
  image_public_id: z.string().optional().nullable(),
  is_default: z.boolean().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  caption: z.string().max(500).optional().nullable(),
  image_url: z.string().url().optional(),
  image_public_id: z.string().optional().nullable(),
  is_default: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  venue_id: z.string().uuid(),
  plan_ids: z.array(z.string().uuid()).min(1),
});

router.get('/venue-seating-plans', authenticateToken, async (req, res, next) => {
  try {
    const venueId = await requireBookingsScope(req, res);
    if (!venueId) return;
    const rows = await prisma.venueSeatingPlan.findMany({
      where: { venueId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ items: rows.map(mapSeatingPlanForBusiness) });
  } catch (err) {
    next(err);
  }
});

router.post('/venue-seating-plans', authenticateToken, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    if (!(await staffHasVenuePermission(req.userId, d.venue_id, 'seating_plans'))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const count = await prisma.venueSeatingPlan.count({ where: { venueId: d.venue_id } });
    const makeDefault = d.is_default === true || count === 0;

    const plan = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.venueSeatingPlan.updateMany({
          where: { venueId: d.venue_id },
          data: { isDefault: false },
        });
      }
      return tx.venueSeatingPlan.create({
        data: {
          venueId: d.venue_id,
          name: d.name.trim(),
          caption: d.caption?.trim() || null,
          imageUrl: d.image_url,
          imagePublicId: d.image_public_id || null,
          sortOrder: count,
          isDefault: makeDefault,
        },
      });
    });

    res.status(201).json(mapSeatingPlanForBusiness(plan));
  } catch (err) {
    next(err);
  }
});

router.patch('/venue-seating-plans/:id', authenticateToken, async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const existing = await prisma.venueSeatingPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Plan not found' });
    if (!(await staffHasVenuePermission(req.userId, existing.venueId, 'seating_plans'))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const d = parsed.data;
    const updates = {};
    if (d.name != null) updates.name = d.name.trim();
    if (d.caption !== undefined) updates.caption = d.caption?.trim() || null;
    if (d.image_url != null) updates.imageUrl = d.image_url;
    if (d.image_public_id !== undefined) updates.imagePublicId = d.image_public_id || null;
    if (d.sort_order != null) updates.sortOrder = d.sort_order;

    const plan = await prisma.$transaction(async (tx) => {
      if (d.is_default === true) {
        await tx.venueSeatingPlan.updateMany({
          where: { venueId: existing.venueId },
          data: { isDefault: false },
        });
        updates.isDefault = true;
      } else if (d.is_default === false && existing.isDefault) {
        updates.isDefault = false;
      }
      return tx.venueSeatingPlan.update({ where: { id: existing.id }, data: updates });
    });

    if (d.is_default === false && existing.isDefault) {
      const nextDefault = await prisma.venueSeatingPlan.findFirst({
        where: { venueId: existing.venueId, id: { not: existing.id } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (nextDefault) {
        await prisma.venueSeatingPlan.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }

    res.json(mapSeatingPlanForBusiness(plan));
  } catch (err) {
    next(err);
  }
});

router.delete('/venue-seating-plans/:id', authenticateToken, async (req, res, next) => {
  try {
    const existing = await prisma.venueSeatingPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Plan not found' });
    if (!(await staffHasVenuePermission(req.userId, existing.venueId, 'seating_plans'))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const linkedEvents = await prisma.event.count({
      where: {
        seatingPlanId: existing.id,
        showSeatingPlan: true,
        deletedAt: null,
      },
    });
    if (linkedEvents > 0) {
      return res.status(400).json({
        error: 'This plan is linked to published events. Disable seating plans on those events first.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where: { seatingPlanId: existing.id },
        data: { seatingPlanId: null, showSeatingPlan: false },
      });
      await tx.venueSeatingPlan.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const nextDefault = await tx.venueSeatingPlan.findFirst({
          where: { venueId: existing.venueId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        if (nextDefault) {
          await tx.venueSeatingPlan.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
        }
      }
    });

    const remaining = await prisma.venueSeatingPlan.count({ where: { venueId: existing.venueId } });
    if (remaining === 0) {
      await prisma.venue.update({
        where: { id: existing.venueId },
        data: { showSeatingPlanForDayBookings: false },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/venue-seating-plans/reorder', authenticateToken, async (req, res, next) => {
  try {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { venue_id: venueId, plan_ids: planIds } = parsed.data;
    if (!(await staffHasVenuePermission(req.userId, venueId, 'seating_plans'))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const existing = await prisma.venueSeatingPlan.findMany({
      where: { venueId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));
    if (planIds.length !== existing.length || planIds.some((id) => !existingIds.has(id))) {
      return res.status(400).json({ error: 'plan_ids must include all plans for this venue' });
    }
    await prisma.$transaction(
      planIds.map((id, index) =>
        prisma.venueSeatingPlan.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
