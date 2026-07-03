/**
 * Captures mobile screenshots (390×844) and screen recordings for the SEC marketing kit.
 *
 * Env:
 *   BASE_URL          — frontend URL (default http://localhost:5173)
 *   API_URL           — backend URL (default http://localhost:4000)
 *   PARTY_GOER_EMAIL / PARTY_GOER_PASSWORD
 *   BUSINESS_EMAIL / BUSINESS_PASSWORD
 *
 * Reads marketing-kit/scripts/.marketing-credentials.json if env vars are not set.
 */
import { createRequire } from 'module';
import { readFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../sec-night-life/package.json'));
const { chromium } = require('playwright');
const KIT_ROOT = join(__dirname, '..');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const VIEWPORT = { width: 390, height: 844 };

const SHOTS_PARTY = join(KIT_ROOT, 'screenshots/mobile/party-goer');
const SHOTS_BUSINESS = join(KIT_ROOT, 'screenshots/mobile/business-owner');
const REC_PARTY = join(KIT_ROOT, 'recordings/party-goer');
const REC_BUSINESS = join(KIT_ROOT, 'recordings/business-owner');
const CREDS_PATH = join(__dirname, '.marketing-credentials.json');

function loadCreds() {
  if (existsSync(CREDS_PATH)) {
    return JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
  }
  return null;
}

async function apiLogin(email, password, role) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.error || res.statusText}`);
  return data;
}

async function setAuth(page, { accessToken, refreshToken }) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ accessToken, refreshToken }) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('sec_active_mode', 'partygoer');
  }, { accessToken, refreshToken });
}

async function clearAuth(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.clear();
  });
}

async function waitForApp(page, timeout = 15000) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await page.waitForTimeout(800);
}

async function screenshot(page, filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  await waitForApp(page);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log('  ✓', filePath.replace(KIT_ROOT, ''));
}

async function goto(page, path) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
}

async function loginAs(page, email, password, role, mode = 'partygoer') {
  const intent = role === 'VENUE' ? 'VENUE' : 'PARTY_GOER';
  await goto(page, '/Login');
  await page.evaluate((i) => localStorage.setItem('sec-role-intent', i), intent);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(
    () => !window.location.pathname.toLowerCase().includes('login'),
    { timeout: 20000 }
  );
  await page.evaluate((m) => localStorage.setItem('sec_active_mode', m), mode);
  await waitForApp(page);
  await page.waitForTimeout(1200);
}

async function captureBrandSplash(page) {
  const logoB64 = readFileSync(join(KIT_ROOT, 'brand/logos/sec-logo.png')).toString('base64');
  await page.setViewportSize(VIEWPORT);
  await page.setContent(`<!DOCTYPE html>
<html class="dark"><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 390px; height: 844px; background: #000;
    font-family: Inter, -apple-system, sans-serif;
    display: flex; align-items: center; justify-content: center;
    color: #F5F5F5;
  }
  .wrap { text-align: center; max-width: 340px; padding: 40px 24px; }
  .logo { width: 128px; height: 128px; margin: 0 auto 40px; display: block; object-fit: contain; }
  h1 { font-size: 38px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.02em; }
  .tagline {
    color: #6B6B6B; font-size: 12px; letter-spacing: 0.14em;
    text-transform: uppercase; font-weight: 600; margin-bottom: 24px;
  }
  .desc { color: #B8B8B8; font-size: 15px; line-height: 1.65; margin-bottom: 40px; }
  .btn {
    width: 100%; padding: 14px; border: none; border-radius: 6px;
    background: linear-gradient(135deg, #A8A8A8 0%, #D8D8D8 40%, #A0A0A0 70%, #C8C8C8 100%);
    color: #0B0B0F; font-size: 15px; font-weight: 600;
  }
  .members { margin-top: 14px; color: #6B6B6B; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
</style></head><body>
<div class="wrap">
  <img class="logo" src="data:image/png;base64,${logoB64}" alt="SEC" />
  <h1>SEC</h1>
  <p class="tagline">Your Night. Simplified.</p>
  <p class="desc">Discover events, book and join tables, and connect with the nightlife community.</p>
  <button class="btn" type="button">Enter</button>
  <p class="members">Members only</p>
</div></body></html>`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
}

function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function finalizeVideo(webmPath, desiredPath) {
  const webmOut = desiredPath.endsWith('.webm') ? desiredPath : desiredPath.replace(/\.mp4$/i, '.webm');
  if (hasFfmpeg() && desiredPath.endsWith('.mp4')) {
    execSync(
      `ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${desiredPath}"`,
      { stdio: 'ignore' }
    );
    unlinkSync(webmPath);
    console.log('  ✓', desiredPath.replace(KIT_ROOT, ''));
    return desiredPath;
  }
  if (webmPath !== webmOut) renameSync(webmPath, webmOut);
  console.log('  ✓', webmOut.replace(KIT_ROOT, ''), '(webm)');
  return webmOut;
}

async function recordFlow(browser, outputPath, steps) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    recordVideo: { dir: dirname(outputPath), size: VIEWPORT },
  });
  const page = await context.newPage();
  try {
    for (const step of steps) {
      await step(page);
    }
    await page.waitForTimeout(1500);
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      const webmPath = await video.path();
      finalizeVideo(webmPath, outputPath);
    }
  }
}

async function safeGoto(page, path) {
  try {
    await goto(page, path);
  } catch (err) {
    if (!String(err.message).includes('ERR_ABORTED')) throw err;
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await waitForApp(page);
  }
}

async function captureScreenshots(browser, creds) {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'dark' });
  const page = await context.newPage();
  const eventPath = creds?.eventId ? `/EventDetails?id=${creds.eventId}` : '/Events';
  const venuePath = creds?.venueId ? `/VenueProfile?id=${creds.venueId}` : '/VenueProfile';

  console.log('\n── Party-Goer screenshots (public) ──');
  await clearAuth(page);
  await captureBrandSplash(page);
  mkdirSync(dirname(join(SHOTS_PARTY, '01-home-splash.png')), { recursive: true });
  await page.screenshot({ path: join(SHOTS_PARTY, '01-home-splash.png'), fullPage: false });
  console.log('  ✓', '\\screenshots\\mobile\\party-goer\\01-home-splash.png');
  await goto(page, '/Onboarding');
  await screenshot(page, join(SHOTS_PARTY, '02-role-selection.png'));
  await goto(page, '/Register');
  await screenshot(page, join(SHOTS_PARTY, '03-register.png'));

  const partyEmail = process.env.PARTY_GOER_EMAIL || creds?.partyGoer?.email;
  const partyPass = process.env.PARTY_GOER_PASSWORD || creds?.password;
  if (!partyEmail || !partyPass) throw new Error('Party-Goer credentials missing');

  console.log('\n── Party-Goer screenshots (authenticated) ──');
  await loginAs(page, partyEmail, partyPass, 'USER', 'partygoer');

  await goto(page, '/');
  await screenshot(page, join(SHOTS_PARTY, '04-home-feed.png'));
  await goto(page, '/Events');
  await screenshot(page, join(SHOTS_PARTY, '05-events.png'));
  await goto(page, '/Explore');
  await screenshot(page, join(SHOTS_PARTY, '06-explore.png'));
  await goto(page, eventPath);
  await screenshot(page, join(SHOTS_PARTY, '07-event-details.png'));
  await goto(page, '/Tables');
  await screenshot(page, join(SHOTS_PARTY, '08-tables.png'));
  await goto(page, '/Map');
  await screenshot(page, join(SHOTS_PARTY, '09-map.png'));
  await goto(page, '/Profile');
  await screenshot(page, join(SHOTS_PARTY, '10-profile.png'));
  await goto(page, '/Friends');
  await screenshot(page, join(SHOTS_PARTY, '11-friends.png'));
  await goto(page, '/Leaderboard');
  await screenshot(page, join(SHOTS_PARTY, '12-leaderboard.png'));

  const bizEmail = process.env.BUSINESS_EMAIL || creds?.businessOwner?.email;
  const bizPass = process.env.BUSINESS_PASSWORD || creds?.password;
  if (!bizEmail || !bizPass) throw new Error('Business credentials missing');

  console.log('\n── Business Owner screenshots ──');
  await loginAs(page, bizEmail, bizPass, 'VENUE', 'business');
  await page.evaluate(() => localStorage.setItem('sec_active_mode', 'business'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page);

  await goto(page, '/Onboarding');
  await screenshot(page, join(SHOTS_BUSINESS, '01-role-selection.png'));
  await goto(page, '/VenueOnboarding');
  await screenshot(page, join(SHOTS_BUSINESS, '02-venue-onboarding.png'));
  await goto(page, '/BusinessDashboard');
  await screenshot(page, join(SHOTS_BUSINESS, '03-dashboard.png'));
  await goto(page, '/BusinessEvents');
  await screenshot(page, join(SHOTS_BUSINESS, '04-events.png'));
  await goto(page, '/BusinessBookings');
  await screenshot(page, join(SHOTS_BUSINESS, '05-bookings.png'));
  await goto(page, '/BusinessVenueTables');
  await screenshot(page, join(SHOTS_BUSINESS, '06-tables.png'));
  await goto(page, '/BusinessPromotions');
  await screenshot(page, join(SHOTS_BUSINESS, '07-promotions.png'));
  await goto(page, '/VenueAnalytics');
  await screenshot(page, join(SHOTS_BUSINESS, '08-analytics.png'));
  await goto(page, '/BusinessMenu');
  await screenshot(page, join(SHOTS_BUSINESS, '09-menu.png'));
  await goto(page, venuePath);
  await screenshot(page, join(SHOTS_BUSINESS, '10-venue-profile.png'));

  await context.close();
}

async function captureRecordings(browser, creds) {
  const partyEmail = process.env.PARTY_GOER_EMAIL || creds?.partyGoer?.email;
  const partyPass = process.env.PARTY_GOER_PASSWORD || creds?.password;
  const bizEmail = process.env.BUSINESS_EMAIL || creds?.businessOwner?.email;
  const bizPass = process.env.BUSINESS_PASSWORD || creds?.password;
  const eventPath = creds?.eventId ? `/EventDetails?id=${creds.eventId}` : '/Events';

  console.log('\n── Party-Goer recordings ──');

  await recordFlow(browser, join(REC_PARTY, 'signup-and-discover.webm'), [
    async (page) => {
      await clearAuth(page);
      await safeGoto(page, '/');
      await page.waitForTimeout(1200);
      await safeGoto(page, '/Onboarding');
      await page.waitForTimeout(1200);
      await safeGoto(page, '/Register');
      await page.waitForTimeout(1200);
      await loginAs(page, partyEmail, partyPass, 'USER', 'partygoer');
      await safeGoto(page, '/');
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(1500);
    },
  ]);

  await recordFlow(browser, join(REC_PARTY, 'browse-event.webm'), [
    async (page) => {
      await loginAs(page, partyEmail, partyPass, 'USER', 'partygoer');
      await goto(page, '/Events');
      await page.waitForTimeout(1200);
      await goto(page, eventPath);
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(2000);
    },
  ]);

  await recordFlow(browser, join(REC_PARTY, 'social-features.webm'), [
    async (page) => {
      await loginAs(page, partyEmail, partyPass, 'USER', 'partygoer');
      await goto(page, '/Friends');
      await page.waitForTimeout(1500);
      await goto(page, '/Leaderboard');
      await page.waitForTimeout(2000);
    },
  ]);

  console.log('\n── Business Owner recordings ──');

  await recordFlow(browser, join(REC_BUSINESS, 'venue-registration.webm'), [
    async (page) => {
      await clearAuth(page);
      await safeGoto(page, '/Onboarding');
      await page.waitForTimeout(1000);
      await safeGoto(page, '/VenueOnboarding');
      await page.waitForTimeout(2000);
    },
  ]);

  await recordFlow(browser, join(REC_BUSINESS, 'manage-venue.webm'), [
    async (page) => {
      await loginAs(page, bizEmail, bizPass, 'VENUE', 'business');
      await page.evaluate(() => localStorage.setItem('sec_active_mode', 'business'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForApp(page);
      await goto(page, '/BusinessDashboard');
      await page.waitForTimeout(1500);
      await goto(page, '/BusinessEvents');
      await page.waitForTimeout(1500);
      await goto(page, '/BusinessBookings');
      await page.waitForTimeout(2000);
    },
  ]);

  await recordFlow(browser, join(REC_BUSINESS, 'grow-business.webm'), [
    async (page) => {
      await loginAs(page, bizEmail, bizPass, 'VENUE', 'business');
      await page.evaluate(() => localStorage.setItem('sec_active_mode', 'business'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForApp(page);
      await goto(page, '/BusinessPromotions');
      await page.waitForTimeout(1500);
      await goto(page, '/VenueAnalytics');
      await page.waitForTimeout(2000);
    },
  ]);
}

async function main() {
  const creds = loadCreds();
  mkdirSync(SHOTS_PARTY, { recursive: true });
  mkdirSync(SHOTS_BUSINESS, { recursive: true });
  mkdirSync(REC_PARTY, { recursive: true });
  mkdirSync(REC_BUSINESS, { recursive: true });

  console.log(`Capturing marketing assets from ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  try {
    if (process.env.SKIP_SCREENSHOTS !== '1') {
      await captureScreenshots(browser, creds);
    }
    if (process.env.SKIP_RECORDINGS !== '1') {
      await captureRecordings(browser, creds);
    }
  } finally {
    await browser.close();
  }

  // Clean stray playwright video artifacts
  for (const dir of [REC_PARTY, REC_BUSINESS]) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.webm') && !f.includes('signup') && !f.includes('browse') && !f.includes('social') && !f.includes('venue') && !f.includes('manage') && !f.includes('grow')) {
        unlinkSync(join(dir, f));
      }
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
