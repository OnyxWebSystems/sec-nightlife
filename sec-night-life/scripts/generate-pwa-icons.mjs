/**
 * Generate PWA icons from public/Logo/sec-email-logo-transparent.png
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public', 'Logo', 'sec-email-logo-transparent.png');
const iconsDir = path.join(root, 'public', 'icons');
const FILL_RATIO = 0.88;

async function main() {
  await mkdir(iconsDir, { recursive: true });

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('sharp not installed — run npm install sharp for proper icon generation');
    process.exit(1);
  }

  const meta = await sharp(src).metadata();
  const logoSize = Math.round(Math.min(meta.width || 132, meta.height || 132) * FILL_RATIO);
  const resizedLogo = await sharp(src)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const sizes = [
    { name: 'favicon-32.png', size: 32, dir: iconsDir },
    { name: 'favicon-48.png', size: 48, dir: iconsDir },
    { name: 'icon-192.png', size: 192, dir: iconsDir },
    { name: 'icon-512.png', size: 512, dir: iconsDir },
    { name: 'apple-touch-icon.png', size: 180, dir: path.join(root, 'public') },
  ];

  for (const { name, size, dir } of sizes) {
    const inset = Math.round((size - Math.round(size * FILL_RATIO)) / 2);
    const inner = Math.round(size * FILL_RATIO);
    const logoForSize = await sharp(resizedLogo)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: logoForSize, left: inset, top: inset }])
      .png()
      .toFile(path.join(dir, name));
    console.log(`Wrote ${name} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
