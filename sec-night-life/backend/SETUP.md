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

2. Copy the connection string into `.env` as **`DATABASE_URL`** (Neon pooled URL is fine for app + `prisma migrate` on Vercel).  
   Optional: add a separate **direct** Neon URL only if you need it for local tooling — the Prisma schema does **not** require `DIRECT_URL`.

3. The database is usually created for you. Then run:
   ```bash
   npm run db:push
   npm run dev
   ```

---

## Neon: "Can't reach database server"

If you use Neon and see **Can't reach database server at `ep-...neon.tech:5432`**:

1. **Wake the project**  
   Neon scales down after inactivity. Open [Neon Console](https://console.neon.tech) → your project → **SQL Editor**, run any simple query (e.g. `SELECT 1`). Then try migrations again.

2. **Connection strings (Prisma + Neon)**  
   Set **`DATABASE_URL`** in `.env` and in **Vercel** (backend project). Pooled Neon URLs work for migrations in most setups. Include `?sslmode=require`.  
   If you still get timeouts, try **removing** `channel_binding=require` from `DATABASE_URL` only (keep `sslmode=require`). Some Windows/Node setups have issues with channel binding.

3. **Diagnose from this repo**  
   From `sec-night-life/backend`:
   ```bash
   npm run db:test-connection
   ```
   If both URLs **time out**, the problem is network path (firewall, ISP, or DNS), not the URL format.

4. **Windows / IPv4 (common fix for P1001)**  
   Prefer IPv4 when resolving Neon hostnames:
   ```bash
   npm run db:deploy:ipv4
   ```
   Or in Git Bash:
   ```bash
   NODE_OPTIONS=--dns-result-order=ipv4first npx prisma migrate deploy
   ```

5. **Network / firewall**  
   Some ISPs and Wi‑Fi networks block **outbound TCP port 5432**. Quick check (PowerShell):
   ```powershell
   Test-NetConnection ep-YOUR-HOST.neon.tech -Port 5432
   ```
   If `TcpTestSucceeded` is false, try a **phone hotspot** or another network. Allow **Node.js** through Windows Firewall for outbound connections.

6. **`Test-NetConnection` True but `npm run db:test-connection` still times out**  
   That means raw TCP can reach Neon from Windows, but **Node’s Postgres client** is not completing the connection (often stuck during **TLS**).  
   - Run `npm run db:test-connection` again — it prints **`[Raw TCP] OK`** if Node can open port 5432; if that is OK but `pg` still fails, suspect **antivirus “HTTPS/SSL scanning”** on **`node.exe`** (exclude Node or disable scanning for dev).  
   - Run the same commands from **PowerShell** (not only Git Bash).  
   - You can still apply migrations on **Vercel** (`npm run build` runs `prisma migrate deploy` when `DATABASE_URL` is set in the project env).

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
