/**
 * Render crisp SEC app icons from the vector circular lockup.
 *
 * Outputs:
 *  - brand/logos/sec-app-icon-4096.png  (transparent)
 *  - app-store/icon-1024.png            (opaque black — App Store / Xcode)
 *  - play-store/icon-512.png            (opaque black)
 *
 * Usage (from sec-night-life/):
 *   node ../launch-resources/scripts/generate-app-icon.mjs
 */
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = join(__dirname, '..');
const require = createRequire(join(__dirname, '../../sec-night-life/package.json'));

const SVG_PATH = join(KIT_ROOT, 'brand/logos/sec-app-icon.svg');
const OUT_4096 = join(KIT_ROOT, 'brand/logos/sec-app-icon-4096.png');
const OUT_1024 = join(KIT_ROOT, 'app-store/icon-1024.png');
const OUT_512 = join(KIT_ROOT, 'play-store/icon-512.png');

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

async function main() {
  const sharp = await getSharp();
  if (!sharp) {
    console.error('generate-app-icon: sharp is required');
    process.exit(1);
  }
  if (!existsSync(SVG_PATH)) {
    console.error('generate-app-icon: missing', SVG_PATH);
    process.exit(1);
  }

  mkdirSync(dirname(OUT_4096), { recursive: true });
  mkdirSync(dirname(OUT_1024), { recursive: true });
  mkdirSync(dirname(OUT_512), { recursive: true });

  const svg = Buffer.from(readFileSync(SVG_PATH));

  // Transparent 4096 master (vector → high-DPI raster)
  await sharp(svg, { density: 600 })
    .resize(4096, 4096, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(OUT_4096);
  console.log('  ✓', OUT_4096);

  // Opaque App Store 1024 (Apple forbids transparency on App Icons)
  await sharp(svg, { density: 600 })
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png()
    .toFile(OUT_1024);
  console.log('  ✓', OUT_1024);

  await sharp(svg, { density: 600 })
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png()
    .toFile(OUT_512);
  console.log('  ✓', OUT_512);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
