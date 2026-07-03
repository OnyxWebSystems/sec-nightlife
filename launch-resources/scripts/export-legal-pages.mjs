/**
 * Export legal pages as full-page PNGs for store submission.
 *
 * Usage (from sec-night-life/):
 *   npm run launch:export-legal
 */
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTION_URL, VIEWPORT, DEVICE_SCALE_FACTOR, LEGAL_PAGES } from './capture-routes.mjs';
import { goto, waitForApp } from './capture-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../sec-night-life/package.json'));
const { chromium } = require('playwright');

const KIT_ROOT = join(__dirname, '..');
const BASE_URL = (process.env.BASE_URL || PRODUCTION_URL).replace(/\/+$/, '');
const LEGAL_DIR = join(KIT_ROOT, 'legal/documents');
const LEGAL_URLS_PATH = join(KIT_ROOT, 'legal/LEGAL_URLS.md');

async function main() {
  mkdirSync(LEGAL_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  const urls = [];

  try {
    for (const doc of LEGAL_PAGES) {
      const path = `/${doc.slug}`;
      const pngPath = join(LEGAL_DIR, `${doc.file}.png`);
      await goto(page, BASE_URL, path);
      await page.waitForSelector('main, article, h1', { timeout: 30000 }).catch(() => {});
      await waitForApp(page);
      await page.screenshot({ path: pngPath, fullPage: true, animations: 'disabled' });
      console.log('  ✓', doc.file + '.png');
      urls.push({ title: doc.title, path, url: `${BASE_URL}${path}` });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const md = `# SEC Nightlife — Legal Document URLs

Use these URLs in App Store Connect and Google Play Console.

**Production app:** ${BASE_URL}

> Update to \`https://secnightlife.com\` (or your custom domain) when DNS is connected.

## Required for store listings

| Document | URL |
|----------|-----|
| Privacy Policy | ${BASE_URL}/PrivacyPolicy |
| Terms of Service | ${BASE_URL}/TermsOfService |

## All legal documents (Settings → Support)

| Document | URL | Local export |
|----------|-----|--------------|
${urls.map((u) => `| ${u.title} | ${u.url} | documents/${LEGAL_PAGES.find((d) => d.title === u.title)?.file}.png |`).join('\n')}

## Support

- In-app: Settings → Help Center
- App: ${BASE_URL}/Settings
`;

  writeFileSync(LEGAL_URLS_PATH, md, 'utf8');
  console.log('\n✓ Legal export complete.');
  console.log('  Documents:', LEGAL_DIR);
  console.log('  URLs:', LEGAL_URLS_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
