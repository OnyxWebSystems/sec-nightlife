# Backend Setup Guide

## What’s done

- `.env` created from `.env.example` (default: `postgres:postgres@localhost:5432`)
- Prisma Client generated
- `scripts/create-db.js` added to create the `sec_nightlife` database

## PostgreSQL not running

The setup failed because PostgreSQL is either **not installed** or **not running** on `localhost:5432`.

---

## Option 1: Install PostgreSQL (recommended for local dev)

1. **Download PostgreSQL**  
   https://www.postgresql.org/download/windows/

2. **Install**  
   - Use default port **5432**
   - Set a password for the `postgres` user (or leave default if applicable)
   - Remember this password

3. **Update `.env`** if needed:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/sec_nightlife"
   ```

4. **Run setup:**
   ```bash
   npm run db:create
   npm run db:push
   npm run dev
   ```

---

## Option 2: Use Docker

If Docker is installed:

```bash
docker run -d --name sec-nightlife-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sec_nightlife -p 5432:5432 postgres:16
```

Then run:

```bash
npm run db:push
npm run dev
```

---

## Option 3: Cloud PostgreSQL (Neon, Supabase, Railway, etc.)

1. Create a free PostgreSQL database on:
   - [Neon](https://neon.tech)
   - [Supabase](https://supabase.com)
   - [Railway](https://railway.app)

2. Copy the connection string and set it in `.env`:
   ```env
   DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
   ```

3. The database is usually created for you. Then run:
   ```bash
   npm run db:push
   npm run dev
   ```

---

## Neon: "Can't reach database server"

If you use Neon and see **Can't reach database server at `ep-...neon.tech:5432`**:

1. **Wake the project**  
   Neon scales down after inactivity. Open [Neon Console](https://console.neon.tech) → your project **sec-nightlife-prod** → **SQL Editor**, run any simple query (e.g. `SELECT 1`). That wakes the compute. Then restart your backend (`npm run dev`).

2. **Connection string**  
   In `.env`, `DATABASE_URL` should use the **pooled** connection from the Neon dashboard (host contains `-pooler`), with `?sslmode=require&connect_timeout=30` (or similar). Restart the backend after changing `.env`.

3. **Network / firewall**  
   If it still fails, your network may block outbound port 5432. Try from another network or VPN, or check corporate firewall rules.

---

## After PostgreSQL is available

```bash
cd sec-night-life/backend

# Create DB (only if using local PostgreSQL without Option 2)
npm run db:create

# Apply schema
npm run db:push

# Start server
npm run dev
```
