/**
 * Upload Paystack demo video to Cloudinary (public URL, no auth).
 * Usage: node upload-paystack-demo-cloudinary.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../sec-night-life/backend/package.json'));
const { v2: cloudinary } = require('cloudinary');

const VIDEO = join(__dirname, '../../sec-night-life/public/paystack-demo.mp4');
const VIDEO_FALLBACK = join(__dirname, '../paystack/Record-Paystack-Demo.mp4');
const ENV_PATH = join(__dirname, '../../sec-night-life/backend/.env');
const ENV_LOCAL = join(__dirname, '../../sec-night-life/backend/.env.local');

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnv(ENV_PATH);
loadEnv(ENV_LOCAL);

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('Missing Cloudinary env vars in backend/.env — use Vercel deploy instead.');
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

async function main() {
  const videoPath = existsSync(VIDEO) ? VIDEO : VIDEO_FALLBACK;
  if (!existsSync(videoPath)) {
    console.error('Video not found:', VIDEO, 'or', VIDEO_FALLBACK);
    process.exit(1);
  }
  console.log('Uploading to Cloudinary (public):', videoPath);
  const result = await cloudinary.uploader.upload(videoPath, {
    resource_type: 'video',
    folder: 'sec-paystack',
    public_id: 'payment-demo-ticket',
    overwrite: true,
    access_mode: 'public',
    type: 'upload',
  });
  const pageUrl = result.secure_url.replace('/upload/', '/upload/fl_attachment:false/');
  console.log('\n✓ Public video URL:\n', result.secure_url);
  console.log('\n✓ Share this link in your Paystack email:\n', result.secure_url);
  const out = join(__dirname, '../paystack/PUBLIC_VIDEO_URL.txt');
  require('fs').writeFileSync(
    out,
    `Cloudinary video URL (public, no login):\n${result.secure_url}\n\nPaystack demo page (after Vercel deploy):\nhttps://secnightlife.com/paystack-demo.html\n`,
    'utf8',
  );
  console.log('\nSaved to', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
