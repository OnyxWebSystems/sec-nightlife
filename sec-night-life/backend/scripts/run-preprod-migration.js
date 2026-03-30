import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, 'migrations', 'migrate-pre-production.sql'), 'utf8');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const result = await pool.query(sql);
  const last = Array.isArray(result) ? result[result.length - 1] : result;
  console.log('✅', last?.rows?.[0]?.status || 'Migration executed');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
