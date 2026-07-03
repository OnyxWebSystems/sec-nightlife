/**
 * Record a Paystack ticket-purchase demo for activation review.
 *
 * Usage (from sec-night-life/):
 *   npm run launch:paystack-demo
 *
 * 1. Log in as Party-Goer when prompted.
 * 2. Script navigates to an event with tickets.
 * 3. Complete Paystack test checkout manually (card 4084084084084081).
 * 4. Press ENTER when ticket appears in Profile → Tickets.
 */
import { createRequire } from 'module';
import { mkdirSync, unlinkSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTION_URL, PRODUCTION_API_URL, VIEWPORT, DEVICE_SCALE_FACTOR } from './capture-routes.mjs';
import {
  waitForManualLogin,
  gotoAuthenticated,
  waitForEnter,
  finalizeVideo,
  waitForApp,
  goto,
  launchVisibleBrowser,
} from './capture-helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../sec-night-life/package.json'));
const { chromium } = require('playwright');

const KIT_ROOT = join(__dirname, '..');
const BASE_URL = (process.env.BASE_URL || PRODUCTION_URL).replace(/\/+$/, '');
const API_URL = (process.env.API_URL || process.env.VITE_API_URL || PRODUCTION_API_URL).replace(
  /\/+$/,
  '',
);
const OUTPUT_MP4 = join(KIT_ROOT, 'paystack/payment-demo-ticket.mp4');
const OUTPUT_WEBM = join(KIT_ROOT, 'paystack/payment-demo-ticket.webm');
const CONTINUE_PARTY = join(__dirname, '.continue-party');

async function resolveEventWithTickets(page) {
  try {
    const eventPath = await page.evaluate(async (apiUrl) => {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
      if (!token) return null;
      const res = await fetch(`${apiUrl}/api/events?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return null;
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data?.events ?? data?.items ?? [];
      for (const ev of list) {
        const tiers = ev.ticket_tiers ?? ev.ticketTiers ?? [];
        if (tiers.length > 0 && ev.id) return `/EventDetails?id=${ev.id}`;
      }
      if (list[0]?.id) return `/EventDetails?id=${list[0].id}`;
      return null;
    }, API_URL);
    if (eventPath) return eventPath;
  } catch {
    // fall through to UI navigation
  }
  return null;
}

async function openEventForCheckout(page, baseUrl) {
  const eventPath = await resolveEventWithTickets(page);
  if (eventPath) {
    console.log(`\nNavigating to event: ${eventPath}`);
    await gotoAuthenticated(page, baseUrl, eventPath, { file: 'event-details' });
    return;
  }

  console.log('\nOpening Events — using first event in the list.');
  await gotoAuthenticated(page, baseUrl, '/Events', { file: 'events' });
  const eventLink = page.locator('a[href*="EventDetails"]').first();
  await eventLink.waitFor({ state: 'visible', timeout: 45000 });
  await eventLink.click();
  await waitForApp(page);
}

async function main() {
  mkdirSync(dirname(OUTPUT_MP4), { recursive: true });
  for (const stale of [OUTPUT_MP4, OUTPUT_WEBM]) {
    if (existsSync(stale)) {
      try {
        unlinkSync(stale);
      } catch {
        // ignore
      }
    }
  }

  console.log(`\nSEC Paystack Demo Recorder — ${BASE_URL}`);
  console.log(`API: ${API_URL}`);
  console.log('A separate Chrome window will open — sign in THERE, not in this terminal.\n');

  let demoComplete = false;
  const browser = await launchVisibleBrowser(chromium, { slowMo: 80 });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: 'dark',
    recordVideo: { dir: dirname(OUTPUT_MP4), size: VIEWPORT },
  });
  const page = await context.newPage();
  await page.bringToFront();

  try {
    await waitForManualLogin(page, BASE_URL, {
      roleIntent: 'PARTY_GOER',
      continueFile: CONTINUE_PARTY,
      instructions: [
        'PAYSTACK DEMO — PARTY-GOER',
        '1. Sign in with your Party-Goer account.',
        '2. Stay in Party Goer mode.',
        '3. Wait until Home loads — recording continues automatically.',
      ].join('\n'),
    });

    await openEventForCheckout(page, BASE_URL);

    console.log('\n' + '='.repeat(64));
    console.log('MANUAL STEPS (recorded):');
    console.log('1. Select a ticket tier and quantity.');
    console.log('2. Tap Buy / Pay — complete Paystack checkout.');
    console.log('   Test card: 4084084084084081, expiry any future date, CVV 408');
    console.log('3. After success, open Profile → Tickets and show your QR ticket.');
    console.log('4. Press ENTER in this terminal when finished.');
    console.log('='.repeat(64) + '\n');

    await waitForEnter('Press ENTER when demo is complete (ticket visible in Profile)... ', null);

    demoComplete = true;
    await page.waitForTimeout(2000);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video && demoComplete) {
      const webmPath = await video.path();
      const out = finalizeVideo(webmPath, OUTPUT_MP4, KIT_ROOT);
      console.log('\n✓ Paystack demo saved:', out);
    } else if (video) {
      const webmPath = await video.path();
      try {
        unlinkSync(webmPath);
      } catch {
        // ignore
      }
      console.log('\n✗ Demo not saved — sign-in or checkout did not complete.');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
