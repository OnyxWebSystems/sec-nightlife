import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  clearExpiredMenuSpecials,
  formatVenueMenuItemForClient,
  parseLegacySpecialSubCategory,
  SPECIAL_OFFER_EXP_PREFIX,
} from '../lib/menuSpecials.js';
import venueMenuItemRoutes from './venueMenuItemRoutes.js';

const router = Router();

export { SPECIAL_OFFER_EXP_PREFIX, parseLegacySpecialSubCategory as parseSpecialOfferWindow };

router.use('/venues/:venueId', venueMenuItemRoutes);

/** Public menu for event/table flows (venue must exist). */
router.get('/venues/:venueId/menu-items/public', async (req, res, next) => {
  try {
    const venue = await prisma.venue.findFirst({
      where: { id: req.params.venueId, deletedAt: null },
      select: { id: true },
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    const { fetchGuestVenueMenuItems } = await import('../lib/menuHelpers.js');
    res.json(await fetchGuestVenueMenuItems(venue.id));
  } catch (e) {
    next(e);
  }
});

export { clearExpiredMenuSpecials, formatVenueMenuItemForClient };
export default router;
