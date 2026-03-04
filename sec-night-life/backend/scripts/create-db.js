/**
 * Creates the sec_nightlife database if it doesn't exist.
 * Run: node scripts/create-db.js
 */
import pg from 'pg';
import { config } from 'dotenv';

config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

// Connect to default 'postgres' database to create our DB
const baseUrl = dbUrl.replace(/\/[^/]+$/, '/postgres');
const client = new pg.Client({ connectionString: baseUrl });

async function createDb() {
  try {
    await client.connect();
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'sec_nightlife'"
    );
    if (result.rows.length > 0) {
      console.log('Database sec_nightlife already exists.');
      return;
    }
    await client.query('CREATE DATABASE sec_nightlife');
    console.log('Database sec_nightlife created successfully.');
  } catch (err) {
    console.error('Error:', err.message || err.toString());
    if (err.code) console.error('Code:', err.code);
    if (err.message.includes('password') || err.message.includes('auth')) {
      console.error('\nTip: Update DATABASE_URL in .env with your PostgreSQL username and password.');
      console.error('Default is often: postgresql://postgres:postgres@localhost:5432/sec_nightlife');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDb();
