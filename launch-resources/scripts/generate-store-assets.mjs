/**
 * Generate store icons, feature graphic, and resize mobile screenshots for App Store / Play Store.
 *
 * Usage (from sec-night-life/):
 *   npm run launch:generate-assets
 */
import { createRequire } from 'module';
import { mkdirSync, readdirSync, existsSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../sec-night-life/package.json'));

const KIT_ROOT = join(__dirname, '..');
const BRAND_LOGO = join(KIT_ROOT, 'brand/logos/sec-logo.png');
const BRAND_MARK = join(KIT_ROOT, 'brand/logos/sec-mark.svg');
const APP_ICON_SVG = join(KIT_ROOT, 'brand/logos/sec-app-icon.svg');

async function getSharp() {
  try {
    return require('sharp');
  } catch {
    try {
      return (await import('sharp')).default;
    } catch {
      return null;
    }
  }
}

/** Resize mobile captures into store screenshot folders. */
export async function syncStoreScreenshots(kitRoot = KIT_ROOT) {
  const sharp = await getSharp();
  const partyDir = join(kitRoot, 'screenshots/mobile/party-goer');
  const businessDir = join(kitRoot, 'screenshots/mobile/business-owner');
  const appStoreDir = join(kitRoot, 'app-store/screenshots');
  const playStoreDir = join(kitRoot, 'play-store/screenshots');
  mkdirSync(appStoreDir, { recursive: true });
  mkdirSync(playStoreDir, { recursive: true });

  const sources = [];
  for (const dir of [partyDir, businessDir]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.png')) sources.push(join(dir, f));
    }
  }

  if (!sources.length) {
    console.log('  (no mobile screenshots yet — run npm run launch:capture)');
    return;
  }

  for (const src of sources.sort()) {
    const base = src.split(/[/\\]/).pop();
    const appOut = join(appStoreDir, base);
    const playOut = join(playStoreDir, base);

    if (sharp) {
      // App Store 6.7" — 1290×2796; Play Store phone — 1080×1920
      await sharp(src)
        .resize(1290, 2796, { fit: 'cover', position: 'top' })
        .png()
        .toFile(appOut);
      await sharp(src)
        .resize(1080, 1920, { fit: 'cover', position: 'top' })
        .png()
        .toFile(playOut);
    } else {
      copyFileSync(src, appOut);
      copyFileSync(src, playOut);
    }
    console.log('  ✓ store export', base);
  }
}

async function generateIcons(sharp) {
  // Prefer vector circular lockup (crisp); fall back to raster brand PNG.
  if (existsSync(APP_ICON_SVG)) {
    const { spawnSync } = await import('child_process');
    const gen = join(__dirname, 'generate-app-icon.mjs');
    const result = spawnSync(process.execPath, [gen], { stdio: 'inherit' });
    if (result.status === 0) return;
    console.warn('  generate-app-icon failed — falling back to sec-logo.png');
  }

  const appIcon = join(KIT_ROOT, 'app-store/icon-1024.png');
  const playIcon = join(KIT_ROOT, 'play-store/icon-512.png');
  mkdirSync(dirname(appIcon), { recursive: true });
  mkdirSync(dirname(playIcon), { recursive: true });

  if (!sharp) {
    copyFileSync(BRAND_LOGO, appIcon);
    copyFileSync(BRAND_LOGO, playIcon);
    console.warn('  sharp not available — copied sec-logo.png as icons');
    return;
  }

  await sharp(BRAND_LOGO)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(appIcon);
  await sharp(BRAND_LOGO)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(playIcon);
  console.log('  ✓ app-store/icon-1024.png');
  console.log('  ✓ play-store/icon-512.png');
}

async function generateFeatureGraphic(sharp) {
  const out = join(KIT_ROOT, 'play-store/feature-graphic-1024x500.png');
  if (!sharp) {
    console.warn('  sharp not available — skip feature graphic');
    return;
  }

  const logo = await sharp(BRAND_LOGO).resize(280, 280, { fit: 'contain' }).png().toBuffer();

  const svg = `
<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0B0B0F"/>
      <stop offset="100%" style="stop-color:#1a1a22"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <text x="512" y="380" text-anchor="middle" fill="#F5F5F5" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="700">SEC Nightlife</text>
  <text x="512" y="430" text-anchor="middle" fill="#A8A8A8" font-family="Inter,Arial,sans-serif" font-size="18" letter-spacing="4">YOUR NIGHT. SIMPLIFIED.</text>
</svg>`;

  const bg = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(bg)
    .composite([{ input: logo, left: 372, top: 60 }])
    .png()
    .toFile(out);
  console.log('  ✓ play-store/feature-graphic-1024x500.png');
}

async function main() {
  console.log('\nGenerating store assets...');
  const sharp = await getSharp();
  await generateIcons(sharp);
  await generateFeatureGraphic(sharp);
  await syncStoreScreenshots();
  console.log('\n✓ Store assets generated.\n');
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');
if (isDirectRun || process.argv[1]?.endsWith('generate-store-assets.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
