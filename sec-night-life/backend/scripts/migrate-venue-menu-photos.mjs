/**
 * Clears SEC catalog image URLs from venue menu items and hides them until venues upload own photos.
 * Run: node scripts/migrate-venue-menu-photos.mjs
 */
import { prisma } from '../src/lib/prisma.js';

function isSecCatalogImage(url) {
  if (!url) return false;
  return String(url).includes('/menu-catalog/');
}

async function main() {
  const rows = await prisma.venueMenuItem.findMany({
    where: {
      OR: [
        { imageUrl: { contains: '/menu-catalog/' } },
        { imageUrl: { not: null }, isAvailable: true },
      ],
    },
    select: { id: true, imageUrl: true, isAvailable: true },
  });

  let updated = 0;
  for (const row of rows) {
    const clearImage = isSecCatalogImage(row.imageUrl);
    const notVenueHttp = row.imageUrl && !String(row.imageUrl).startsWith('http');
    if (!clearImage && !notVenueHttp) continue;

    await prisma.venueMenuItem.update({
      where: { id: row.id },
      data: {
        imageUrl: clearImage || notVenueHttp ? null : row.imageUrl,
        isAvailable: clearImage || notVenueHttp ? false : row.isAvailable,
      },
    });
    updated += 1;
  }

  console.log(`Migrated ${updated} venue menu item(s). Venues must upload their own photos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
