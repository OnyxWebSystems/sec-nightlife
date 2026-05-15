import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const seedPath = join(__dirname, '../data/menuCatalog.seed.json');
  let items;
  try {
    const raw = JSON.parse(readFileSync(seedPath, 'utf8'));
    items = raw.items || raw;
  } catch {
    console.error('Missing seed file. Run: node scripts/build-menu-catalog-seed.mjs');
    process.exit(1);
  }

  let upserted = 0;
  for (const item of items) {
    await prisma.menuCatalogItem.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        name: item.name,
        topCategory: item.topCategory,
        subCategory: item.subCategory ?? null,
        defaultPriceZar: item.defaultPriceZar,
        imageUrl: item.imageUrl ?? null,
        searchText: item.searchText ?? item.name.toLowerCase(),
        brand: item.brand ?? null,
        sortOrder: item.sortOrder ?? 0,
        isActive: item.isActive !== false,
      },
      update: {
        name: item.name,
        topCategory: item.topCategory,
        subCategory: item.subCategory ?? null,
        defaultPriceZar: item.defaultPriceZar,
        imageUrl: item.imageUrl ?? null,
        searchText: item.searchText ?? item.name.toLowerCase(),
        brand: item.brand ?? null,
        sortOrder: item.sortOrder ?? 0,
        isActive: item.isActive !== false,
      },
    });
    upserted += 1;
  }
  console.log(`Menu catalog seeded: ${upserted} items`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
