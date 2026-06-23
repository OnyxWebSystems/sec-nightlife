/**
 * Generate PWA icons from public/sec-logo.png (circular SEC mark)
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public', 'sec-logo.png');
const iconsDir = path.join(root, 'public', 'icons');

async function main() {
  await mkdir(iconsDir, { recursive: true });

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('sharp not installed — copying sec-logo.png to icon paths (run npm install sharp for proper resize)');
    await copyFile(src, path.join(iconsDir, 'icon-192.png'));
    await copyFile(src, path.join(iconsDir, 'icon-512.png'));
    await copyFile(src, path.join(root, 'public', 'apple-touch-icon.png'));
    return;
  }

  const sizes = [
    { name: 'icon-192.png', size: 192, dir: iconsDir },
    { name: 'icon-512.png', size: 512, dir: iconsDir },
    { name: 'apple-touch-icon.png', size: 180, dir: path.join(root, 'public') },
  ];

  for (const { name, size, dir } of sizes) {
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toFile(path.join(dir, name));
    console.log(`Wrote ${name} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
