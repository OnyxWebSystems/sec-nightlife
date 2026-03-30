/**
 * Creates all app tables in Neon by running the SQL schema.
 * Run from backend folder: node scripts/run-neon-schema.js
 * Requires: DATABASE_URL in .env (Neon pooled URL with pgbouncer=true)
 */
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString });

const sqlPath = path.join(__dirname, 'migrations', 'neon-schema.sql');
let sql;
try {
  sql = readFileSync(sqlPath, 'utf8');
} catch (e) {
  console.error('Could not read migrations/neon-schema.sql:', e.message);
  process.exit(1);
}

// Remove comments and split into statements (simple split by ;)
const statements = sql
  .split(';')
  .map(s => s.replace(/--[^\n]*/g, '').trim())
  .filter(s => s.length > 0);

async function run() {
  const client = await pool.connect();
  try {
    for (const statement of statements) {
      const one = statement + ';';
      try {
        await client.query(one);
      } catch (err) {
        if (err.code === '42P07' || err.message?.includes('already exists')) {
          console.log('(skipped - already exists):', one.slice(0, 50) + '...');
        } else {
          throw err;
        }
      }
    }
    console.log('Neon schema applied successfully. You can restart the backend and try Sign up.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Error applying schema:', err.message);
  process.exit(1);
});
