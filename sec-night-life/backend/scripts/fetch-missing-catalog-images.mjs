/**
 * Downloads bottle images for catalog drinks missing local product photos.
 * Uses Wikimedia Commons search; writes data/clubAlcoholProductImagesExtra.mjs
 *
 * Run: node scripts/fetch-missing-catalog-images.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const SEED_PATH = join(__dirname, '../data/menuCatalog.seed.json');
const OUT_DIR = join(ROOT, 'public/menu-catalog/products');
const EXTRA_URLS_PATH = join(__dirname, '../data/clubAlcoholProductImagesExtra.mjs');
const PRODUCTS_DIR = OUT_DIR;

const USER_AGENT = 'SECNightLife/1.0 (https://github.com/onyx-web-systems; menu-catalog-images)';

/** Direct Wikimedia file page titles (File:...) when search is unreliable */
const WIKIMEDIA_FILE_OVERRIDES = {
  'drinks-cognac-brandy-courvoisier-vsop': 'Courvoisier VSOP bottle.jpg',
  'drinks-cognac-brandy-martell-vs': 'Martell VS bottle.jpg',
  'drinks-cognac-brandy-martell-vsop': 'Martell VSOP bottle.jpg',
  'drinks-cognac-brandy-klipdrift-export': 'Klipdrift Export Brandy.jpg',
  'drinks-cognac-brandy-kwv-5-year-brandy': 'KWV Brandy 5 Years Old.jpg',
  'drinks-cognac-brandy-metaxa-7-star': 'Metaxa 7 Star bottle.jpg',
  'drinks-vodka-absolut-citron': 'Absolut Citron bottle.jpg',
  'drinks-vodka-smirnoff-1818': 'Smirnoff Red Label vodka bottle.jpg',
  'drinks-vodka-ketel-one': 'Ketel One Vodka bottle.jpg',
  'drinks-vodka-beluga-noble': 'Beluga Noble Vodka bottle.jpg',
  'drinks-vodka-russian-standard': 'Russian Standard vodka bottle.jpg',
  'drinks-vodka-tito-s-handmade-vodka': 'Titos Vodka bottle.jpg',
  'drinks-whiskey-bourbon-chivas-regal-12': 'Chivas Regal 12 Year bottle.jpg',
  'drinks-whiskey-bourbon-chivas-regal-18': 'Chivas Regal 18 Year bottle.jpg',
  'drinks-whiskey-bourbon-bushmills': 'Bushmills Irish Whiskey bottle.jpg',
  'drinks-whiskey-bourbon-maker-s-mark': 'Makers Mark bourbon bottle.jpg',
  'drinks-whiskey-bourbon-bulleit-bourbon': 'Bulleit Bourbon bottle.jpg',
  'drinks-whiskey-bourbon-crown-royal': 'Crown Royal bottle.jpg',
  'drinks-whiskey-bourbon-ballantine-s-finest': 'Ballantines Finest bottle.jpg',
  'drinks-tequila-patron-silver': 'Patron Silver tequila bottle.jpg',
  'drinks-tequila-don-julio-blanco': 'Don Julio Blanco tequila bottle.jpg',
  'drinks-tequila-jose-cuervo-gold': 'Jose Cuervo Especial Gold bottle.jpg',
  'drinks-tequila-1800-silver': '1800 Silver tequila bottle.jpg',
  'drinks-tequila-casamigos-blanco': 'Casamigos Blanco tequila bottle.jpg',
  'drinks-gin-gordon-s-london-dry': 'Gordons Gin bottle.jpg',
  'drinks-gin-beefeater': 'Beefeater London Dry Gin bottle.jpg',
  'drinks-gin-tanqueray-no-ten': 'Tanqueray No Ten gin bottle.jpg',
  'drinks-champagne-mcc-graham-beck-brut': 'Graham Beck Brut bottle.jpg',
  'drinks-champagne-mcc-pongracz-brut': 'Pongracz Cap Classique bottle.jpg',
  'drinks-champagne-mcc-nederburg-brut': 'Nederburg Brut bottle.jpg',
  'drinks-champagne-mcc-laurent-perrier-brut': 'Laurent Perrier Brut bottle.jpg',
  'drinks-liqueurs-shooters-baileys-original': 'Baileys Original Irish Cream bottle.jpg',
  'drinks-liqueurs-shooters-amarula-cream': 'Amarula cream liqueur bottle.jpg',
  'drinks-liqueurs-shooters-sambuca': 'Sambuca bottle.jpg',
  'drinks-liqueurs-shooters-malibu': 'Malibu rum bottle.jpg',
  'drinks-liqueurs-shooters-cointreau': 'Cointreau bottle.jpg',
  'drinks-liqueurs-shooters-kahlua': 'Kahlua coffee liqueur bottle.jpg',
  'drinks-liqueurs-shooters-aperol': 'Aperol bottle.jpg',
  'drinks-liqueurs-shooters-campari': 'Campari bottle.jpg',
  'drinks-beers-ciders-castle-lager': 'Castle Lager bottle.jpg',
  'drinks-beers-ciders-stella-artois': 'Stella Artois bottle.jpg',
  'drinks-beers-ciders-budweiser': 'Budweiser bottle.jpg',
  'drinks-beers-ciders-guinness': 'Guinness Draught bottle.jpg',
  'drinks-beers-ciders-windhoek-lager': 'Windhoek Lager bottle.jpg',
  'drinks-rum-bacardi-carta-blanca': 'Bacardi Superior rum bottle.jpg',
  'drinks-rum-captain-morgan-spiced': 'Captain Morgan Original Spiced Rum bottle.jpg',
  'drinks-rum-havana-club-3': 'Havana Club 3 anos bottle.jpg',
  'drinks-rum-appleton-estate': 'Appleton Estate Signature bottle.jpg',
  'drinks-wine-sparkling-nederburg-cabernet-sauvignon': 'Nederburg Cabernet Sauvignon bottle.jpg',
  'drinks-wine-sparkling-two-oceans-sauvignon-blanc': 'Two Oceans Sauvignon Blanc bottle.jpg',
  // Mixers & soft drinks
  'other-still-water': 'Bottled water.jpg',
  'other-sparkling-water': 'Sparkling water bottle.jpg',
  'other-coca-cola': 'Coca-Cola bottle.jpg',
  'other-coca-cola-zero': 'Coca-Cola Zero bottle.jpg',
  'other-fanta-orange': 'Fanta Orange bottle.jpg',
  'other-sprite': 'Sprite bottle.jpg',
  'other-pepsi': 'Pepsi bottle.jpg',
  'other-ginger-beer': 'Ginger beer bottle.jpg',
  'other-red-bull': 'Red Bull can.jpg',
  'other-monster-energy': 'Monster Energy drink can.jpg',
  'other-tonic-water': 'Schweppes Tonic Water bottle.jpg',
  'other-soda-water': 'Soda water bottle.jpg',
  'other-cranberry-juice': 'Cranberry juice bottle.jpg',
  'other-orange-juice': 'Orange juice bottle.jpg',
  'other-pineapple-juice': 'Pineapple juice bottle.jpg',
  'other-lemonade': 'Lemonade bottle.jpg',
};

/** Copy image from another catalog id when products are visually similar */
const COPY_FROM_SIBLING = {
  'drinks-vodka-ciroc-apple': 'drinks-vodka-ciroc-original',
  'drinks-vodka-ciroc-red-berry': 'drinks-vodka-ciroc-original',
  'drinks-whiskey-bourbon-jameson-black-barrel': 'drinks-whiskey-bourbon-jameson-irish-whiskey',
  'drinks-whiskey-bourbon-johnnie-walker-red-label': 'drinks-whiskey-bourbon-johnnie-walker-black-label',
  'drinks-whiskey-bourbon-johnnie-walker-gold-label': 'drinks-whiskey-bourbon-johnnie-walker-black-label',
  'drinks-whiskey-bourbon-jack-daniel-s-honey': 'drinks-whiskey-bourbon-jack-daniel-s-old-no-7',
  'drinks-whiskey-bourbon-the-macallan-12': 'drinks-whiskey-bourbon-the-macallan-18-year-old',
  'drinks-whiskey-bourbon-glenlivet-12': 'drinks-whiskey-bourbon-glenfiddich-12-year-old',
  'drinks-tequila-don-julio-anejo': 'drinks-tequila-don-julio-reposado',
  'drinks-tequila-1800-reposado': 'drinks-tequila-1800-silver',
  'drinks-tequila-olmeca-altos': 'drinks-tequila-cazadores-reposado',
  'drinks-tequila-sierra-tequila': 'drinks-tequila-jose-cuervo-gold',
  'drinks-tequila-el-jimador': 'drinks-tequila-cazadores-reposado',
  'drinks-gin-inverroche-verdant': 'drinks-gin-inverroche-classic',
  'drinks-gin-six-dogs-blue-gin': 'drinks-gin-inverroche-classic',
  'drinks-gin-musgrave-gin': 'drinks-gin-inverroche-classic',
  'drinks-gin-whitley-neill': 'drinks-gin-bombay-sapphire',
  'drinks-champagne-mcc-prosecco': 'drinks-champagne-mcc-bottega-prosecco',
  'drinks-beers-ciders-savanna-light': 'drinks-beers-ciders-savanna-dry',
  'drinks-beers-ciders-strongbow': 'drinks-beers-ciders-savanna-dry',
  'drinks-beers-ciders-bernini': 'drinks-beers-ciders-savanna-dry',
  'drinks-beers-ciders-sol': 'drinks-beers-ciders-corona-extra',
  'drinks-rum-bacardi-oakheart': 'drinks-rum-bacardi-carta-blanca',
  'drinks-rum-malibu-rum': 'drinks-liqueurs-shooters-malibu',
  'drinks-liqueurs-shooters-goldschlager': 'drinks-liqueurs-shooters-jagermeister',
  'drinks-liqueurs-shooters-tequila-rose': 'drinks-liqueurs-shooters-baileys-original',
  'drinks-liqueurs-shooters-sour-apple-pucker': 'drinks-liqueurs-shooters-jagermeister',
  'drinks-liqueurs-shooters-butterscotch-sours': 'drinks-liqueurs-shooters-baileys-original',
  'drinks-whiskey-bourbon-southern-comfort': 'drinks-whiskey-bourbon-jack-daniel-s-old-no-7',
  'drinks-whiskey-bourbon-fireball': 'drinks-whiskey-bourbon-jack-daniel-s-old-no-7',
  'other-coca-cola-zero': 'other-coca-cola',
  'other-pepsi': 'other-coca-cola',
  'other-pineapple-juice': 'other-orange-juice',
  'other-lemonade': 'other-sprite',
  'other-soda-water': 'other-sparkling-water',
  'other-appletiser': 'other-sparkling-water',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hasLocalImage(id) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    if (existsSync(join(PRODUCTS_DIR, `${id}.${ext}`))) return true;
  }
  return false;
}

function findLocalImagePath(id) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const p = join(PRODUCTS_DIR, `${id}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

function extFromUrl(url) {
  const m = url.match(/\.(jpe?g|png|webp)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function scoreResult(title, brand, name) {
  const t = title.toLowerCase();
  let score = 0;
  if (t.includes('bottle')) score += 5;
  if (t.includes('front')) score += 4;
  if (t.includes('product')) score += 2;
  if (t.includes('bottom') || t.includes('back')) score -= 4;
  if (t.includes('logo') && !t.includes('bottle')) score -= 6;
  if (t.includes('glass') && !name.toLowerCase().includes('glass')) score -= 3;
  const brandTok = (brand || name.split(' ')[0]).toLowerCase();
  if (brandTok && t.includes(brandTok.replace(/[^a-z]/g, ''))) score += 6;
  if (name.toLowerCase().split(' ').some((w) => w.length > 3 && t.includes(w))) score += 2;
  return score;
}

async function wikimediaFetchJson(params) {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  return res.json();
}

async function resolveByFileTitle(fileTitle) {
  const title = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`;
  const data = await wikimediaFetchJson({
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '600',
  });
  const pages = data.query?.pages || {};
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl && !info?.url) return null;
  return info.thumburl || info.url;
}

async function searchWikimedia(brand, name, subCategory, topCategory = 'Drinks') {
  const kind = topCategory === 'Other' ? 'can bottle drink' : 'liquor bottle';
  const queries = [
    `${brand || name} ${kind}`,
    `${name} bottle`,
    `${brand || name} ${subCategory?.split(' ')[0] || (topCategory === 'Other' ? 'soft drink' : 'liquor')} bottle`,
  ].filter(Boolean);

  let best = null;
  let bestScore = -999;

  for (const q of queries) {
    const data = await wikimediaFetchJson({
      action: 'query',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: q,
      gsrlimit: '8',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '600',
    });
    const pages = data.query?.pages || {};
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;
      const s = scoreResult(page.title, brand, name);
      if (s > bestScore) {
        bestScore = s;
        best = info.thumburl;
      }
    }
    if (bestScore >= 8) break;
    await sleep(300);
  }
  return best;
}

async function downloadToProduct(id, imageUrl) {
  const ext = extFromUrl(imageUrl);
  const outPath = join(OUT_DIR, `${id}.${ext}`);
  if (existsSync(outPath)) return { ok: true, skipped: true };
  const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) return { ok: false, error: 'too small' };
  writeFileSync(outPath, buf);
  return { ok: true, path: outPath, ext };
}

function copySiblingImage(targetId, sourceId) {
  const src = findLocalImagePath(sourceId);
  if (!src) return false;
  const ext = extname(src).slice(1);
  const dest = join(OUT_DIR, `${targetId}.${ext}`);
  if (existsSync(dest)) return true;
  copyFileSync(src, dest);
  return true;
}

mkdirSync(OUT_DIR, { recursive: true });

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
const missing = seed.items.filter(
  (i) => ['Drinks', 'Other'].includes(i.topCategory) && !hasLocalImage(i.id),
);

console.log(`Fetching images for ${missing.length} catalog items...`);

let existingExtra = {};
try {
  const mod = await import('../data/clubAlcoholProductImagesExtra.mjs');
  existingExtra = mod.EXTRA_PRODUCT_IMAGE_URLS || {};
} catch {
  /* first run */
}

const extraUrls = { ...existingExtra };
let ok = 0;
let fail = 0;

for (const item of missing) {
  const { id, name, brand, subCategory, topCategory } = item;

  if (COPY_FROM_SIBLING[id]) {
    const srcId = COPY_FROM_SIBLING[id];
    if (copySiblingImage(id, srcId)) {
      console.log(`copy ${id} <- ${srcId}`);
      ok += 1;
      continue;
    }
  }

  let imageUrl = null;
  const overrideFile = WIKIMEDIA_FILE_OVERRIDES[id];
  if (overrideFile) {
    try {
      imageUrl = await resolveByFileTitle(overrideFile);
    } catch (e) {
      console.warn(`override fail ${id}:`, e.message);
    }
    await sleep(250);
  }

  if (!imageUrl) {
    try {
      imageUrl = await searchWikimedia(brand, name, subCategory, topCategory);
    } catch (e) {
      console.warn(`search fail ${id}:`, e.message);
    }
    await sleep(400);
  }

  if (!imageUrl) {
    console.warn(`no image: ${id} (${name})`);
    fail += 1;
    continue;
  }

  try {
    const result = await downloadToProduct(id, imageUrl);
    if (result.ok) {
      extraUrls[id] = imageUrl;
      console.log(`${result.skipped ? 'skip' : 'ok'} ${id}`);
      ok += 1;
    } else {
      console.warn(`dl fail ${id}:`, result.error);
      fail += 1;
    }
  } catch (e) {
    console.warn(`dl err ${id}:`, e.message);
    fail += 1;
  }
  await sleep(200);
}

// Second pass: sibling copies for items that failed but sibling now exists
for (const item of missing) {
  if (hasLocalImage(item.id)) continue;
  const srcId = COPY_FROM_SIBLING[item.id];
  if (srcId && copySiblingImage(item.id, srcId)) {
    console.log(`copy (retry) ${item.id} <- ${srcId}`);
    ok += 1;
    fail = Math.max(0, fail - 1);
  }
}

writeFileSync(
  EXTRA_URLS_PATH,
  `/** Auto-generated Wikimedia URLs for extra catalog products */\nexport const EXTRA_PRODUCT_IMAGE_URLS = ${JSON.stringify(extraUrls, null, 2)};\n`,
);

console.log(`\nDone: ${ok} resolved, ${fail} still missing`);
