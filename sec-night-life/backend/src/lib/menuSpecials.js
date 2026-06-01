import { prisma } from './prisma.js';

export const SPECIAL_OFFER_EXP_PREFIX = '__SEC_SPECIAL_OFFER_EXP__:';

/** @returns {{ startsAt: Date | null, endsAt: Date } | null} */
export function parseLegacySpecialSubCategory(rawSubCategory) {
  if (!rawSubCategory || typeof rawSubCategory !== 'string') return null;
  const val = rawSubCategory.trim();
  if (!val.startsWith(SPECIAL_OFFER_EXP_PREFIX)) return null;
  const rest = val.slice(SPECIAL_OFFER_EXP_PREFIX.length).trim();
  if (!rest) return null;
  const parts = rest.split('|');
  if (parts.length === 2) {
    const startsAt = new Date(parts[0]);
    const endsAt = new Date(parts[1]);
    if (!Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime())) {
      return { startsAt, endsAt };
    }
    return null;
  }
  const endsAt = new Date(rest);
  if (Number.isNaN(endsAt.getTime())) return null;
  return { startsAt: null, endsAt };
}

export function resolveMenuSpecialState(row, now = Date.now()) {
  let startsAt = row.specialStartsAt ? new Date(row.specialStartsAt) : null;
  let endsAt = row.specialEndsAt ? new Date(row.specialEndsAt) : null;
  let specialPrice = row.specialPrice != null ? Number(row.specialPrice) : null;
  let originalPrice = row.originalPrice != null ? Number(row.originalPrice) : null;

  if ((!startsAt || !endsAt) && row.subCategory) {
    const legacy = parseLegacySpecialSubCategory(row.subCategory);
    if (legacy) {
      startsAt = legacy.startsAt || startsAt;
      endsAt = legacy.endsAt || endsAt;
      if (specialPrice == null) specialPrice = Number(row.price);
      if (originalPrice == null) originalPrice = Number(row.price);
    }
  }

  const basePrice = originalPrice != null && Number.isFinite(originalPrice) ? originalPrice : Number(row.price);
  const hasWindow =
    endsAt &&
    !Number.isNaN(endsAt.getTime()) &&
    specialPrice != null &&
    Number.isFinite(specialPrice) &&
    specialPrice > 0;

  if (!hasWindow) {
    return {
      basePrice: Number(row.price),
      displayPrice: Number(row.price),
      originalPrice: null,
      startsAt: null,
      endsAt: null,
      isExpired: false,
      notStarted: false,
      inSpecialWindow: false,
    };
  }

  const isExpired = endsAt.getTime() <= now;
  const notStarted = startsAt ? startsAt.getTime() > now : false;
  const inSpecialWindow = !isExpired && !notStarted;
  const displayPrice = inSpecialWindow ? specialPrice : basePrice;

  return {
    basePrice,
    displayPrice,
    originalPrice: inSpecialWindow ? basePrice : null,
    startsAt,
    endsAt,
    isExpired,
    notStarted,
    inSpecialWindow,
  };
}

/** SEC catalog paths must never be shown as venue product photos. */
export function isVenueOwnedImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t || t.startsWith('/menu-catalog/')) return false;
  return t.startsWith('https://') || t.startsWith('http://');
}

export function formatVenueMenuItemForClient(row) {
  const imageUrl = isVenueOwnedImageUrl(row.imageUrl) ? row.imageUrl : null;
  const special = resolveMenuSpecialState(row);
  const subCategoryRaw = row.subCategory;
  const sub_category =
    subCategoryRaw && String(subCategoryRaw).trim().startsWith(SPECIAL_OFFER_EXP_PREFIX)
      ? null
      : subCategoryRaw;

  return {
    id: row.id,
    venue_id: row.venueId,
    catalog_item_id: row.catalogItemId,
    name: row.name,
    category: row.category,
    sub_category,
    price: special.displayPrice,
    original_price: special.originalPrice,
    base_price: special.basePrice,
    image_url: imageUrl,
    is_available: row.isAvailable && !!imageUrl && !special.isExpired && !special.notStarted,
    sort_order: row.sortOrder,
    needs_photo: !imageUrl,
    special_offer_starts_at: special.startsAt ? special.startsAt.toISOString() : null,
    special_offer_expires_at: special.endsAt ? special.endsAt.toISOString() : null,
    is_expired: special.isExpired,
    is_special_offer: special.inSpecialWindow,
  };
}

/** Clear expired specials and restore normal prices. */
export async function clearExpiredMenuSpecials() {
  const now = new Date();
  const expired = await prisma.venueMenuItem.findMany({
    where: {
      OR: [
        { specialEndsAt: { lt: now } },
        {
          subCategory: { startsWith: SPECIAL_OFFER_EXP_PREFIX },
        },
      ],
    },
    select: {
      id: true,
      price: true,
      originalPrice: true,
      specialEndsAt: true,
      subCategory: true,
    },
  });

  let cleared = 0;
  for (const row of expired) {
    const legacy = parseLegacySpecialSubCategory(row.subCategory);
    const end = row.specialEndsAt || legacy?.endsAt;
    if (end && end.getTime() > now.getTime()) continue;

    const restorePrice =
      row.originalPrice != null && Number.isFinite(row.originalPrice)
        ? row.originalPrice
        : row.price;

    let restoredSub = undefined;
    if (row.subCategory?.startsWith(SPECIAL_OFFER_EXP_PREFIX)) {
      const full = await prisma.venueMenuItem.findUnique({
        where: { id: row.id },
        select: { catalogItemId: true },
      });
      if (full?.catalogItemId) {
        const cat = await prisma.menuCatalogItem.findUnique({
          where: { id: full.catalogItemId },
          select: { subCategory: true },
        });
        restoredSub = cat?.subCategory ?? null;
      } else {
        restoredSub = null;
      }
    }

    await prisma.venueMenuItem.update({
      where: { id: row.id },
      data: {
        price: restorePrice,
        originalPrice: null,
        specialPrice: null,
        specialStartsAt: null,
        specialEndsAt: null,
        ...(restoredSub !== undefined ? { subCategory: restoredSub } : {}),
      },
    });
    cleared += 1;
  }
  return { cleared };
}
