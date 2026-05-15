/**
 * One-time: extract signed image URLs from user guide in agent transcript
 * and write data/clubAlcoholProductImages.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CLUB_DRINKS, CLUB_HUBBLY } from '../data/clubAlcoholCatalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPT = join(
  process.env.TRANSCRIPT_PATH ||
    'C:/Users/sihle/.cursor/projects/c-Onyx-Web-Systems-APP-Development-sec-night-life-redesigned/agent-transcripts/46add349-dd14-4cfd-a1e7-751f0ea6c56c/46add349-dd14-4cfd-a1e7-751f0ea6c56c.jsonl',
);

function slug(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function catalogIdForDrink(name, sub) {
  const row = CLUB_DRINKS.find((d) => d.name === name && d.sub === sub);
  if (row?.id) return row.id;
  return `drinks-${slug(sub)}-${slug(name)}`;
}

function catalogIdForHubbly(name) {
  const row = CLUB_HUBBLY.find((h) => h.name === name);
  if (row?.id) return row.id;
  return `hubbly-${slug(name)}`;
}

const NAME_TO_SUB = Object.fromEntries(CLUB_DRINKS.map((d) => [d.name, d.sub]));

const line = readFileSync(TRANSCRIPT, 'utf8')
  .split('\n')
  .find((l) => l.includes('Hennessy VS') && l.includes('manuscdn'));
if (!line) throw new Error('Guide transcript line not found');

const text = JSON.parse(line).message.content[0].text;
const re = /\| ([^|]+) \| R([0-9,]+)\+? \| !\[[^\]]*\]\((https:[^)]+)\) \|/g;
const guideByName = {};
let m;
while ((m = re.exec(text))) {
  guideByName[m[1].trim()] = m[3];
}

const HUBBLY_NAMES = {
  'Premium Shisha (Single Pipe)': 'hubbly-premium-shisha-single-pipe',
  'Deluxe Shisha (Double Pipe)': 'hubbly-deluxe-shisha-double-pipe',
};

/** Guide table names that differ from catalog names */
const DRINK_NAME_ALIASES = {
  'Cîroc (Original & Flavours)': 'Cîroc Original',
};

const PRODUCT_IMAGE_URLS = {};

for (const [guideName, url] of Object.entries(guideByName)) {
  if (HUBBLY_NAMES[guideName]) {
    PRODUCT_IMAGE_URLS[HUBBLY_NAMES[guideName]] = url;
    continue;
  }
  const name = DRINK_NAME_ALIASES[guideName] || guideName;
  const sub = NAME_TO_SUB[name];
  if (sub) {
    PRODUCT_IMAGE_URLS[catalogIdForDrink(name, sub)] = url;
  }
}

const out = `/**
 * Product image URLs (signed Manus CDN). Download locally via:
 * npm run db:download-menu-catalog-images
 */
export const PRODUCT_IMAGE_URLS = ${JSON.stringify(PRODUCT_IMAGE_URLS, null, 2)};
`;

const outPath = join(__dirname, '../data/clubAlcoholProductImages.mjs');
writeFileSync(outPath, out);
console.log(`Wrote ${Object.keys(PRODUCT_IMAGE_URLS).length} URLs to ${outPath}`);
