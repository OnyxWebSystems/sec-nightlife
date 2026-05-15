import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

function formatCatalogItem(row) {
  return {
    id: row.id,
    name: row.name,
    top_category: row.topCategory,
    sub_category: row.subCategory,
    default_price_zar: row.defaultPriceZar,
    image_url: row.imageUrl,
    brand: row.brand,
    sort_order: row.sortOrder,
  };
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const topCategory = String(req.query.topCategory || req.query.top_category || '').trim();
    const subCategory = String(req.query.subCategory || req.query.sub_category || '').trim();
    const limit = Math.min(350, Math.max(1, parseInt(String(req.query.limit || '60'), 10) || 60));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    const where = { isActive: true };
    if (topCategory) where.topCategory = topCategory;
    if (subCategory) where.subCategory = subCategory;
    if (q) {
      where.OR = [
        { searchText: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.menuCatalogItem.findMany({
        where,
        orderBy: [{ subCategory: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.menuCatalogItem.count({ where }),
    ]);

    res.json({
      items: rows.map(formatCatalogItem),
      total,
      limit,
      offset,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/subcategories', authenticateToken, async (req, res, next) => {
  try {
    const topCategory = String(req.query.topCategory || 'Drinks').trim();
    const groups = await prisma.menuCatalogItem.groupBy({
      by: ['subCategory'],
      where: { isActive: true, topCategory, subCategory: { not: null } },
      _count: { id: true },
    });
    const subcategories = groups
      .filter((g) => g.subCategory)
      .map((g) => ({ name: g.subCategory, count: g._count.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ top_category: topCategory, subcategories });
  } catch (e) {
    next(e);
  }
});

export default router;
