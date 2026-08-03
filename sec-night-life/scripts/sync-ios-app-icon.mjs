/**
 * Copy the SEC store icon into the iOS AppIcon asset catalog.
 * Runs as part of `npm run build:mobile` so Archives never ship the Capacitor default.
 *
 * Source: ../launch-resources/app-store/icon-1024.png
 * Dest:   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 */
import { createRequire } from 'module';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const KIT_ICON = join(ROOT, '../launch-resources/app-store/icon-1024.png');
const BRAND_FALLBACK = join(ROOT, '../launch-resources/brand/logos/sec-logo.png');
const DEST = join(
  ROOT,
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
);

async function getSharp() {
  try {
    const require = createRequire(join(ROOT, 'package.json'));
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
  const source = existsSync(KIT_ICON) ? KIT_ICON : BRAND_FALLBACK;
  if (!existsSync(source)) {
    console.error('sync-ios-app-icon: no SEC icon found at', KIT_ICON);
    process.exit(1);
  }

  mkdirSync(dirname(DEST), { recursive: true });

  const sharp = await getSharp();
  if (sharp) {
    await sharp(source)
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .png()
      .toFile(DEST);
  } else {
    copyFileSync(source, DEST);
    console.warn('sync-ios-app-icon: sharp unavailable — copied source as-is');
  }

  console.log('sync-ios-app-icon: wrote', DEST);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
