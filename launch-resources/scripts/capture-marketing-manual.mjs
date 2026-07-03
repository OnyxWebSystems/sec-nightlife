/**
 * Interactive marketing capture — production, real accounts, manual login.
 *
 * Usage (from sec-night-life/):
 *   npm run marketing:capture
 *
 * You will log in twice in the browser window:
 *   1. Business Owner → script captures business screens + recordings
 *   2. Party-Goer    → script captures party-goer screens + recordings
 *
 * Env:
 *   BASE_URL  — default https://secnightlife.com
 */
import { createRequire } from 'module';
import { mkdirSync, unlinkSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  PRODUCTION_URL,
  VIEWPORT,
  BUSINESS_SCREENSHOTS,
  PARTY_PUBLIC_SCREENSHOTS,
  PARTY_AUTH_SCREENSHOTS,
  BUSINESS_RECORDINGS,
  PARTY_RECORDINGS,
} from './capture-routes.mjs';
import {
  waitForManualLogin,
  waitForApp,
  goto,
  gotoAuthenticated,
  screenshot,
  captureBrandSplash,
  logout,
  ensureBusinessMode,
  ensurePartyGoerMode,
  resolveEventDetailsPath,
  resolveVenueProfilePath,
  recordOnSamePage,
  waitUntilAuthenticated,
  assertAuthenticatedScreen,
} from './capture-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../sec-night-life/package.json'));
const { chromium } = require('playwright');

const KIT_ROOT = join(__dirname, '..');
const BASE_URL = (process.env.BASE_URL || PRODUCTION_URL).replace(/\/+$/, '');
const SHOTS_PARTY = join(KIT_ROOT, 'screenshots/mobile/party-goer');
const SHOTS_BUSINESS = join(KIT_ROOT, 'screenshots/mobile/business-owner');
const REC_PARTY = join(KIT_ROOT, 'recordings/party-goer');
const REC_BUSINESS = join(KIT_ROOT, 'recordings/business-owner');
const CONTINUE_BUSINESS = join(__dirname, '.continue-business');
const CONTINUE_PARTY = join(__dirname, '.continue-party');

async function resolveScreenshotPath(page, route) {
  if (route.dynamicEvent) return resolveEventDetailsPath(page);
  if (route.dynamicVenue) return resolveVenueProfilePath(page);
  return route.path;
}

async function captureBusinessScreenshots(page) {
  console.log('\n── Business Owner screenshots ──');
  await ensureBusinessMode(page, BASE_URL);
  for (const route of BUSINESS_SCREENSHOTS) {
    const path = await resolveScreenshotPath(page, route);
    await goto(page, BASE_URL, path);
    await screenshot(page, KIT_ROOT, join(SHOTS_BUSINESS, route.file));
  }
}

async function capturePartyPublicScreenshots(page) {
  console.log('\n── Party-Goer screenshots (public) ──');
  for (const route of PARTY_PUBLIC_SCREENSHOTS) {
    if (route.brandSplash) {
      await captureBrandSplash(page, KIT_ROOT);
      await screenshot(page, KIT_ROOT, join(SHOTS_PARTY, route.file));
      continue;
    }
    await goto(page, BASE_URL, route.path);
    await screenshot(page, KIT_ROOT, join(SHOTS_PARTY, route.file));
  }
}

function filterByFlag(list, flagName) {
  const raw = process.argv.find((a) => a.startsWith(`--${flagName}=`));
  if (!raw) return list;
  const names = new Set(raw.slice(flagName.length + 3).split(',').map((s) => s.trim()).filter(Boolean));
  return list.filter((item) => names.has(item.file));
}

async function capturePartyAuthScreenshots(page) {
  console.log('\n── Party-Goer screenshots (authenticated) ──');
  await ensurePartyGoerMode(page, BASE_URL);
  const routes = filterByFlag(PARTY_AUTH_SCREENSHOTS, 'only-screenshots');
  for (const route of routes) {
    const path = await resolveScreenshotPath(page, route);
    await gotoAuthenticated(page, BASE_URL, path, route);
    if (route.waitForQr) {
      await page.waitForSelector('img[src^="data:image"]', { timeout: 20000 }).catch(() => {
        console.warn('  ⚠ No QR code visible on Tickets tab — capture may show empty state.');
      });
      await page.waitForTimeout(1200);
    }
    await screenshot(page, KIT_ROOT, join(SHOTS_PARTY, route.file), { requireAuth: true });
  }
}

async function captureBusinessRecordings(page) {
  console.log('\n── Business Owner recordings ──');
  for (const rec of BUSINESS_RECORDINGS) {
    await recordOnSamePage(page, KIT_ROOT, join(REC_BUSINESS, rec.file), async (recordPage) => {
      for (let i = 0; i < rec.steps.length; i++) {
        await goto(recordPage, BASE_URL, rec.steps[i]);
        await recordPage.waitForTimeout(i === 0 ? 1500 : 2000);
      }
    });
  }
}

async function capturePartyRecordings(page) {
  console.log('\n── Party-Goer recordings ──');
  await waitUntilAuthenticated(page, BASE_URL, 30000);
  const recordings = filterByFlag(PARTY_RECORDINGS, 'only-recordings');
  for (const rec of recordings) {
    await recordOnSamePage(page, KIT_ROOT, join(REC_PARTY, rec.file), async (recordPage) => {
      if (rec.dynamicEvent) {
        const eventPath = await resolveEventDetailsPath(recordPage);
        await gotoAuthenticated(recordPage, BASE_URL, '/Events', { file: 'events-recording' });
        await recordPage.waitForTimeout(1200);
        await gotoAuthenticated(recordPage, BASE_URL, eventPath, { file: 'event-details-recording' });
        if (rec.scroll) await recordPage.evaluate(() => window.scrollBy(0, 500));
        await recordPage.waitForTimeout(2000);
        return;
      }
      for (let i = 0; i < rec.steps.length; i++) {
        await gotoAuthenticated(recordPage, BASE_URL, rec.steps[i], { file: rec.file });
        await recordPage.waitForTimeout(i === 0 ? 1500 : 2000);
      }
    });
  }
}

function cleanStaleRecordings() {
  const keep = new Set([
    'manage-venue.webm',
    'grow-business.webm',
    'browse-event.webm',
    'host-and-messages.webm',
    'social-features.webm',
  ]);
  for (const dir of [REC_PARTY, REC_BUSINESS]) {
    if (!readdirSync(dir, { withFileTypes: true }).length) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.webm') && !keep.has(f)) {
        try {
          unlinkSync(join(dir, f));
          console.log('  removed stale', f);
        } catch {
          // ignore
        }
      }
    }
  }
}

async function main() {
  mkdirSync(SHOTS_PARTY, { recursive: true });
  mkdirSync(SHOTS_BUSINESS, { recursive: true });
  mkdirSync(REC_PARTY, { recursive: true });
  mkdirSync(REC_BUSINESS, { recursive: true });

  console.log(`\nSEC Marketing Capture — ${BASE_URL}`);
  console.log('Mobile viewport: 390×844 · A browser window will open.\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'dark' });
  const page = await context.newPage();

  try {
    const partyOnly = process.argv.includes('--party-only') || process.env.MARKETING_PARTY_ONLY === '1';

    if (!partyOnly) {
      await waitForManualLogin(page, BASE_URL, {
        roleIntent: 'VENUE',
        continueFile: CONTINUE_BUSINESS,
        instructions: [
          'PHASE 1 — BUSINESS OWNER',
          '1. Sign in with your Business Owner account in the browser.',
          '2. Switch to Business mode if the app asks (venue / dashboard view).',
          '3. Open Business Dashboard (/BusinessDashboard) if you are not there yet.',
        ].join('\n'),
      });

      await captureBusinessScreenshots(page);
      await captureBusinessRecordings(page);

      console.log('\nLogging out for Party-Goer phase...');
      await logout(page, BASE_URL);
    } else {
      console.log('\nParty-only mode — skipping business phase (business assets already captured).\n');
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    const skipPublic = process.argv.includes('--skip-public');
    if (!skipPublic) {
      await capturePartyPublicScreenshots(page);
    } else {
      console.log('Skipping public screenshots (already captured).\n');
    }

    await waitForManualLogin(page, BASE_URL, {
      roleIntent: 'PARTY_GOER',
      continueFile: CONTINUE_PARTY,
      instructions: [
        'PHASE 2 — PARTY-GOER',
        '1. Sign in with your Party-Goer account in the browser.',
        '2. Stay in Party Goer mode (not Business).',
        '3. Wait until you land on the Home feed (/).',
        '4. Do NOT press continue until you see your feed — capture starts automatically.',
      ].join('\n'),
    });

    await capturePartyAuthScreenshots(page);
    await capturePartyRecordings(page);

    cleanStaleRecordings();
    console.log('\n✓ Marketing capture complete.');
    console.log('  Screenshots:', KIT_ROOT);
    console.log('  Rebuild zip: Compress-Archive -Path marketing-kit -DestinationPath sec-marketing-kit.zip -Force\n');
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
