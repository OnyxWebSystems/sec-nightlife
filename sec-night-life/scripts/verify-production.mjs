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
];

async function fetchCheck({ name, url, expectJson, expectHtml }) {
  const res = await fetch(url, { redirect: 'follow' });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();

  if (!res.ok) {
    return { name, url, ok: false, error: `HTTP ${res.status}` };
  }

  if (expectHtml) {
    if (!text.includes('SEC') && !text.includes('root')) {
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
