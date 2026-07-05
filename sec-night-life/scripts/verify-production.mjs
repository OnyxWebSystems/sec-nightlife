#!/usr/bin/env node
/**
 * Smoke-check production domains after deploy.
 * Usage: node scripts/verify-production.mjs
 *        FRONTEND_URL=https://secnightlife.com API_URL=https://api.secnightlife.com node scripts/verify-production.mjs
 */
const FRONTEND = (process.env.FRONTEND_URL || 'https://secnightlife.com').replace(/\/+$/, '');
const API = (process.env.API_URL || 'https://api.secnightlife.com').replace(/\/+$/, '');

const checks = [
  {
    name: 'API health',
    url: `${API}/api/health`,
    expectJson: (j) => j?.status === 'ok',
  },
  {
    name: 'API ready (DB)',
    url: `${API}/api/health/ready`,
    expectJson: (j) => j?.status === 'ready' && j?.db === 'ok',
  },
  {
    name: 'Android assetlinks.json',
    url: `${FRONTEND}/.well-known/assetlinks.json`,
    expectJson: (j) => Array.isArray(j) && j[0]?.target?.package_name === 'com.secnightlife.app',
  },
  {
    name: 'Apple app site association',
    url: `${FRONTEND}/.well-known/apple-app-site-association`,
    expectJson: (j) => j?.applinks?.details?.length > 0,
  },
  {
    name: 'Frontend SPA',
    url: FRONTEND,
    expectHtml: true,
  },
  {
    name: 'TicketVerify page bundle',
    url: `${FRONTEND}/TicketVerify?token=smoke-test`,
    expectTicketVerifyBundle: true,
  },
];

async function fetchCheck({ name, url, expectJson, expectHtml, expectTicketVerifyBundle }) {
  const res = await fetch(url, { redirect: 'follow' });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();

  if (!res.ok) {
    return { name, url, ok: false, error: `HTTP ${res.status}` };
  }

  if (expectTicketVerifyBundle) {
    const bundleMatch = text.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!bundleMatch) {
      return { name, url, ok: false, error: 'Main JS bundle not found in TicketVerify HTML' };
    }
    const bundleUrl = new URL(bundleMatch[1], url).toString();
    const bundleRes = await fetch(bundleUrl, { redirect: 'follow' });
    const bundleText = await bundleRes.text();
    if (!bundleRes.ok) {
      return { name, url: bundleUrl, ok: false, error: `Bundle HTTP ${bundleRes.status}` };
    }
    if (!bundleText.includes('Verifying ticket with SEC')) {
      return {
        name,
        url: bundleUrl,
        ok: false,
        error: 'TicketVerify not eager-loaded in main bundle',
      };
    }
    if (/TicketVerify-[A-Za-z0-9]+\.js/.test(bundleText)) {
      return {
        name,
        url: bundleUrl,
        ok: false,
        error: 'TicketVerify still lazy-loaded as separate chunk',
      };
    }
    return { name, url, ok: true };
  }

  if (expectHtml) {
    const htmlOk =
      typeof expectHtml === 'function'
        ? expectHtml(text)
        : text.includes('SEC') || text.includes('root');
    if (!htmlOk) {
      return { name, url, ok: false, error: 'Unexpected HTML body' };
    }
    return { name, url, ok: true };
  }

  if (!ct.includes('json') && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    return { name, url, ok: false, error: `Expected JSON, got ${ct || 'unknown'}` };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { name, url, ok: false, error: 'Invalid JSON' };
  }

  if (expectJson && !expectJson(json)) {
    return { name, url, ok: false, error: 'JSON shape check failed' };
  }

  return { name, url, ok: true };
}

async function main() {
  console.log(`Frontend: ${FRONTEND}`);
  console.log(`API:      ${API}\n`);

  let failed = 0;
  for (const check of checks) {
    try {
      const result = await fetchCheck(check);
      if (result.ok) {
        console.log(`✓ ${result.name}`);
      } else {
        failed += 1;
        console.error(`✗ ${result.name}: ${result.error} (${result.url})`);
      }
    } catch (err) {
      failed += 1;
      console.error(`✗ ${check.name}: ${err?.message || err}`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log('\nAll production checks passed.');
}

main();
