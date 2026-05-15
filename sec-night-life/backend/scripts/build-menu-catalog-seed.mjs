/**
 * Generates data/menuCatalog.seed.json from club alcohol catalog + food/hubbly/other.
 * Run: node scripts/build-menu-catalog-seed.mjs
 */
import { writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CLUB_DRINKS, CLUB_HUBBLY } from '../data/clubAlcoholCatalog.mjs';
import { PRODUCT_IMAGE_URLS } from '../data/clubAlcoholProductImages.mjs';

let EXTRA_PRODUCT_IMAGE_URLS = {};
try {
  const extra = await import('../data/clubAlcoholProductImagesExtra.mjs');
  EXTRA_PRODUCT_IMAGE_URLS = extra.EXTRA_PRODUCT_IMAGE_URLS || {};
} catch {
  /* optional */
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTS_DIR = join(__dirname, '../../public/menu-catalog/products');

const DRINK_IMAGES = {
  'Cognac & Brandy': '/menu-catalog/drinks-cognac.svg',
  'Vodka': '/menu-catalog/drinks-vodka.svg',
  'Whiskey & Bourbon': '/menu-catalog/drinks-whiskey.svg',
  'Tequila': '/menu-catalog/drinks-tequila.svg',
  'Gin': '/menu-catalog/drinks-gin.svg',
  'Champagne & MCC': '/menu-catalog/drinks-champagne.svg',
  'Liqueurs & Shooters': '/menu-catalog/drinks-liqueur.svg',
  'Beers & Ciders': '/menu-catalog/drinks-beer.svg',
  'Rum': '/menu-catalog/drinks-rum.svg',
  'Wine & Sparkling': '/menu-catalog/drinks-wine.svg',
};

function slug(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveImageUrl(id, subCategory, topCategory = 'Drinks') {
  const exts = ['jpg', 'jpeg', 'png', 'webp'];
  for (const ext of exts) {
    const rel = `/menu-catalog/products/${id}.${ext}`;
    if (existsSync(join(PRODUCTS_DIR, `${id}.${ext}`))) return rel;
  }
  if (PRODUCT_IMAGE_URLS[id] || EXTRA_PRODUCT_IMAGE_URLS[id]) {
    return `/menu-catalog/products/${id}.jpg`;
  }
  if (topCategory === 'Drinks') return DRINK_IMAGES[subCategory] || '/menu-catalog/drinks-vodka.svg';
  if (topCategory === 'Hubbly') return '/menu-catalog/hubbly.svg';
  if (topCategory === 'Food') return '/menu-catalog/food.svg';
  return '/menu-catalog/other.svg';
}

function drinkFromClub({ id: idOverride, sub, name, price, brand, aliases = [] }) {
  const id = idOverride || `drinks-${slug(sub)}-${slug(name)}`;
  const searchText = [name, brand, sub, 'drinks', ...aliases].filter(Boolean).join(' ').toLowerCase();
  return {
    id,
    name,
    topCategory: 'Drinks',
    subCategory: sub,
    defaultPriceZar: price,
    imageUrl: resolveImageUrl(id, sub),
    brand: brand || null,
    searchText,
    sortOrder: 0,
    isActive: true,
  };
}

function hubblyFromClub({ id: idOverride, name, price, aliases = [] }) {
  const id = idOverride || `hubbly-${slug(name)}`;
  const sub = name.toLowerCase().includes('flavour') ? 'Flavours' : null;
  return {
    id,
    name,
    topCategory: 'Hubbly',
    subCategory: sub,
    defaultPriceZar: price,
    imageUrl: resolveImageUrl(id, null, 'Hubbly'),
    brand: null,
    searchText: [name, 'hubbly', 'shisha', sub, ...aliases].filter(Boolean).join(' ').toLowerCase(),
    sortOrder: 0,
    isActive: true,
  };
}

function simple(top, name, price, imageUrl, sub = null, aliases = []) {
  const id = `${slug(top)}-${slug(name)}`;
  return {
    id,
    name,
    topCategory: top,
    subCategory: sub,
    defaultPriceZar: price,
    imageUrl,
    brand: null,
    searchText: [name, top, sub, ...aliases].filter(Boolean).join(' ').toLowerCase(),
    sortOrder: 0,
    isActive: true,
  };
}

function mixer(name, price, brand = null, aliases = [], idOverride = null) {
  const id = idOverride || `other-${slug(name)}`;
  return {
    id,
    name,
    topCategory: 'Other',
    subCategory: 'Mixers & Soft Drinks',
    defaultPriceZar: price,
    imageUrl: resolveImageUrl(id, null, 'Other'),
    brand,
    searchText: [name, brand, 'mixer', 'soft drink', 'other', ...aliases].filter(Boolean).join(' ').toLowerCase(),
    sortOrder: 0,
    isActive: true,
  };
}

const items = [
  ...CLUB_DRINKS.map(drinkFromClub),
  ...CLUB_HUBBLY.map(hubblyFromClub),
  // Food
  simple('Food', 'Chicken Wings', 95, '/menu-catalog/food.svg'),
  simple('Food', 'Beef Burger', 120, '/menu-catalog/food.svg'),
  simple('Food', 'Cheese Burger', 110, '/menu-catalog/food.svg'),
  simple('Food', 'Sharing Platter', 350, '/menu-catalog/food.svg'),
  simple('Food', 'Nachos', 85, '/menu-catalog/food.svg'),
  simple('Food', 'Sliders (3)', 95, '/menu-catalog/food.svg'),
  simple('Food', 'Calamari', 110, '/menu-catalog/food.svg'),
  simple('Food', 'Chips', 45, '/menu-catalog/food.svg'),
  simple('Food', 'Pizza Margherita', 95, '/menu-catalog/food.svg'),
  simple('Food', 'Steak & Chips', 185, '/menu-catalog/food.svg'),
  // Mixers & soft drinks (typical club bar prices ZAR)
  mixer('Still Water', 25, null, ['water', 'bottled water']),
  mixer('Sparkling Water', 30, null, ['mineral water']),
  mixer('Coca-Cola', 30, 'Coca-Cola', ['coke', 'cola']),
  mixer('Coca-Cola Zero', 30, 'Coca-Cola', ['coke zero', 'diet coke']),
  mixer('Fanta Orange', 30, 'Fanta', ['fanta']),
  mixer('Sprite', 30, 'Sprite', ['lemonade']),
  mixer('Pepsi', 30, 'Pepsi'),
  mixer('Ginger Beer', 30, 'Stoney', ['stoney', 'ginger ale']),
  mixer('Appletiser', 35, 'Appletiser', ['sparkling juice']),
  mixer('Red Bull', 45, 'Red Bull', ['energy drink']),
  mixer('Monster Energy', 45, 'Monster', ['energy drink']),
  mixer('Tonic Water', 28, 'Schweppes', ['tonic']),
  mixer('Soda Water', 25, null, ['club soda', 'sparkling water']),
  mixer('Cranberry Juice', 35, null, ['juice', 'mixer']),
  mixer('Orange Juice', 35, null, ['juice', 'mixer']),
  mixer('Pineapple Juice', 35, null, ['juice', 'mixer']),
  mixer('Lemonade', 28, null, ['mixer']),
];

const outPath = join(__dirname, '../data/menuCatalog.seed.json');
writeFileSync(outPath, JSON.stringify({ items }, null, 2));
const withProductImages = items.filter((i) => String(i.imageUrl).includes('/menu-catalog/products/')).length;
console.log(`Wrote ${items.length} items (${withProductImages} with product photos) to ${outPath}`);
