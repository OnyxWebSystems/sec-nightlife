/**
 * Downloads product images from clubAlcoholProductImages.mjs into public/menu-catalog/products/
 * Run: node scripts/download-menu-catalog-images.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { PRODUCT_IMAGE_URLS } from '../data/clubAlcoholProductImages.mjs';

let EXTRA_PRODUCT_IMAGE_URLS = {};
try {
  const extra = await import('../data/clubAlcoholProductImagesExtra.mjs');
  EXTRA_PRODUCT_IMAGE_URLS = extra.EXTRA_PRODUCT_IMAGE_URLS || {};
} catch {
  /* optional */
}

const ALL_IMAGE_URLS = { ...PRODUCT_IMAGE_URLS, ...EXTRA_PRODUCT_IMAGE_URLS };

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../../public/menu-catalog/products');

function extFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const ext = extname(path).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext.slice(1);
  } catch {
    /* ignore */
  }
  return 'jpg';
}

async function downloadOne(id, url) {
  const ext = extFromUrl(url);
  const outPath = join(OUT_DIR, `${id}.${ext}`);
  if (existsSync(outPath)) {
    console.log(`skip ${id} (exists)`);
    return true;
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    console.warn(`fail ${id}: HTTP ${res.status}`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  console.log(`ok ${id}.${ext} (${buf.length} bytes)`);
  return true;
}

mkdirSync(OUT_DIR, { recursive: true });

const entries = Object.entries(ALL_IMAGE_URLS);
let ok = 0;
let fail = 0;

for (const [id, url] of entries) {
  try {
    if (await downloadOne(id, url)) ok += 1;
    else fail += 1;
  } catch (err) {
    console.warn(`fail ${id}:`, err.message);
    fail += 1;
  }
}

console.log(`Done: ${ok} ok, ${fail} failed of ${entries.length}`);
