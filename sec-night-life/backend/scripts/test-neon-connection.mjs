/**
 * Tests TCP + TLS reachability to Neon using the same URLs Prisma uses.
 * Run: node scripts/test-neon-connection.mjs
 */
import { config } from 'dotenv';
import dns from 'node:dns';
import net from 'node:net';
import pg from 'pg';

config();

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* Node < 17 */
}

function maskUrl(u) {
  if (!u) return '(not set)';
  try {
    const x = new URL(u.replace(/^postgresql:/i, 'http:'));
    if (x.password) x.password = '***';
    return x.href.replace(/^http:/i, 'postgresql:');
  } catch {
    return '(invalid URL)';
  }
}

function stripChannelBinding(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
    u.searchParams.delete('channel_binding');
    return u.href.replace(/^http:/i, 'postgresql:');
  } catch {
    return connectionString;
  }
}

function hostFromPgUrl(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
    return u.hostname;
  } catch {
    return null;
  }
}

function testRawTcp(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, family: 4 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(12000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('TCP connect timeout (Node raw socket)'));
    });
    socket.on('error', reject);
  });
}

async function tryConnect(name, connectionString, sslOptions) {
  if (!connectionString?.trim()) {
    console.log(`\n[${name}] SKIPPED — not set`);
    return { ok: false, err: null };
  }
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 25000,
    ssl: sslOptions ?? { rejectUnauthorized: true },
  });
  try {
    await client.connect();
    const r = await client.query('SELECT 1 AS ok');
    await client.end();
    console.log(`\n[${name}] OK — ${JSON.stringify(r.rows[0])}`);
    return { ok: true, err: null };
  } catch (e) {
    console.log(`\n[${name}] FAILED`);
    console.log(`  URL: ${maskUrl(connectionString)}`);
    console.log(`  Error: ${e.code || ''} ${e.message}`);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return { ok: false, err: e };
  }
}

console.log('Neon / Postgres connection check (uses .env in this folder)');
console.log('DNS order: ipv4first\n');

const dbUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

const directHost = hostFromPgUrl(directUrl || '') || hostFromPgUrl(dbUrl || '');

let tcpOk = false;
if (directHost) {
  try {
    const { address, family } = await dns.promises.lookup(directHost);
    console.log(`DNS lookup ${directHost} → ${address} (IPv${family})`);
  } catch (e) {
    console.log(`DNS lookup ${directHost} FAILED: ${e.message}`);
  }

  try {
    await testRawTcp(directHost, 5432);
    tcpOk = true;
    console.log(`[Raw TCP] OK — Node opened TCP to ${directHost}:5432 (IPv4) and closed.`);
  } catch (e) {
    console.log(`[Raw TCP] FAILED — ${e.message}`);
  }
}

console.log('\nDATABASE_URL:', maskUrl(dbUrl));
console.log('DIRECT_URL (optional):', maskUrl(directUrl));
console.log('\nPrisma uses DATABASE_URL only (migrations + client). Optional DIRECT_URL is for extra tests.\n');

let a = await tryConnect('DATABASE_URL', dbUrl);
if (!a.ok && dbUrl?.includes('channel_binding')) {
  console.log('\nRetry DATABASE_URL without channel_binding=...');
  a = await tryConnect('DATABASE_URL (no channel_binding)', stripChannelBinding(dbUrl));
}

let b = { ok: true, err: null };
if (directUrl?.trim()) {
  b = await tryConnect('DIRECT_URL', directUrl);
  if (!b.ok) {
    console.log('\nRetry DIRECT_URL with ssl.rejectUnauthorized=false (diagnostic)...');
    const br = await tryConnect('DIRECT_URL (TLS relax)', directUrl, { rejectUnauthorized: false });
    if (br.ok) {
      console.log('\n>>> Relaxed TLS worked but strict TLS did not — check antivirus / node.exe.');
    }
    b = br;
  }
}

if (a.ok && b.ok) {
  process.exit(0);
}

if (!a.ok && !b.ok) {
  console.log('\n==========');
  if (tcpOk) {
    console.log('Raw TCP from Node to :5432 works, but the Postgres client timed out or failed.');
    console.log('PowerShell Test-NetConnection can show True while Node still struggles with TLS.');
    console.log('');
    console.log('Try:');
    console.log('  1. Run this from PowerShell (same folder): npm run db:test-connection');
    console.log('  2. Antivirus: exclude node.exe from SSL/TLS scanning, or try a phone hotspot');
    console.log('  3. Run migrations in CI/Vercel (DATABASE_URL there) — see vercel build');
  } else {
    console.log('Raw TCP from Node also failed — firewall / network blocking port 5432 for Node,');
    console.log('or different network than Test-NetConnection. Try hotspot, allow Node outbound.');
  }
  process.exit(1);
}

if (!a.ok) process.exit(1);
if (directUrl?.trim() && !b.ok) process.exit(1);
process.exit(0);
