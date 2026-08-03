/**
 * Build store / marketing icons from the founder circular SEC logo PNG.
 *
 * Source: brand/logos/sec-logo-founder.png
 * Outputs:
 *  - brand/logos/sec-app-icon-transparent-master.png (circle only, transparent)
 *  - brand/logos/sec-app-icon-4096.png (transparent, upscaled)
 *  - app-store/icon-1024.png (opaque black — App Store / Xcode)
 *  - play-store/icon-512.png (opaque black)
 *
 * Usage (from sec-night-life/):
 *   npm run icons:generate-app
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = join(__dirname, '..');
const FOUNDER = join(KIT_ROOT, 'brand/logos/sec-logo-founder.png');

const py = `
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math

kit = Path(r'''${KIT_ROOT.replace(/\\/g, '/')}''')
src = kit / 'brand/logos/sec-logo-founder.png'
im = Image.open(src).convert('RGBA')
w, h = im.size
cx, cy = w / 2, h / 2
px = im.load()

max_r = 0.0
for y in range(0, h, 2):
    for x in range(0, w, 2):
        r, g, b, a = px[x, y]
        if max(r, g, b) > 80:
            max_r = max(max_r, math.hypot(x - cx, y - cy))
r_outer = min(max_r + 3, min(cx, cy) - 1)

mask = Image.new('L', (w, h), 0)
draw = ImageDraw.Draw(mask)
pad = 1.5
draw.ellipse([cx - r_outer - pad, cy - r_outer - pad, cx + r_outer + pad, cy + r_outer + pad], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(radius=0.9))

out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
out.paste(im, (0, 0))
out.putalpha(mask)
pxo = out.load()
r_cut = r_outer + 1.2
for y in range(h):
    for x in range(w):
        if math.hypot(x - cx, y - cy) > r_cut:
            pxo[x, y] = (0, 0, 0, 0)

(out_path := kit / 'brand/logos/sec-app-icon-transparent-master.png').parent.mkdir(parents=True, exist_ok=True)
out.save(out_path, optimize=True)
print('  ✓', out_path)

up = out.resize((4096, 4096), Image.Resampling.LANCZOS)
up_path = kit / 'brand/logos/sec-app-icon-4096.png'
up.save(up_path, optimize=True)
print('  ✓', up_path)

circ = out.resize((1024, 1024), Image.Resampling.LANCZOS)
opaque = Image.new('RGB', (1024, 1024), (0, 0, 0))
opaque.paste(circ, (0, 0), circ)
app_path = kit / 'app-store/icon-1024.png'
app_path.parent.mkdir(parents=True, exist_ok=True)
opaque.save(app_path, optimize=True)
print('  ✓', app_path)

play_path = kit / 'play-store/icon-512.png'
play_path.parent.mkdir(parents=True, exist_ok=True)
opaque.resize((512, 512), Image.Resampling.LANCZOS).save(play_path, optimize=True)
print('  ✓', play_path)
`;

if (!existsSync(FOUNDER)) {
  console.error('generate-app-icon: missing founder logo at', FOUNDER);
  process.exit(1);
}

const result = spawnSync('python', ['-c', py], { encoding: 'utf-8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
