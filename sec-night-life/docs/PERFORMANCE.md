# SEC Nightlife — Performance

Production readiness improved via paid infra **and** app-level optimizations (deploy + code).

## Phase 1 — Implemented (earlier)

### Backend
- **Prisma singleton** (`globalThis`) — fewer Neon connection churn / P2024 errors on Vercel
- **Home feed** — removed `promotion.updateMany` write-on-read (cron handles expiry)
- **Table offerings** — SQL `take` + ordering cap
- **Friend search/suggestions** — batched friendship/block/conversation lookups
- **Auth middleware** — single user lookup includes email verification flag
- **Leaderboard** — scoped job activity (no full-table scan)
- **Featured events** — batched going counts
- **Messages filter** — capped at 100 rows
- **Notifications unread** — `count()` instead of fetch-all
- **DB indexes** — migration `20260625120000_performance_indexes`

### Frontend
- **Public Home** — `/` and `/Home` skip auth spinner; guest splash loads without API storm
- **Home queries** — `enabled: !!user?.id` for authenticated-only data
- **RequireOnboardingComplete** — uses `useAuth()` (no duplicate `/api/auth/me`)
- **Layout** — React Query dedup for `staff-venues`, `compliance-access`, `user-roles-me`; reuses `biz-venues` via ActiveVenueContext
- **Vite** — `manualChunks` for react, query, motion, radix (`vite.config.js`)
- **Sentry** — dynamic import after first paint

### Assets
- **Cloudinary** — `cloudinaryCardUrl` / `cloudinaryDetailUrl` via `getEventImage` / `getVenueImage`
- **Dependencies** — removed unused heavy packages (maps, three, lodash, moment, etc.)

## Phase 2 — Performance sprint (current)

Paid Neon Scale + Vercel Pro + Upstash alone are **not** enough. This pass fixes deploy + code bottlenecks on signup → Home → payment.

### Deploy / ops
- Removed frontend `experimentalServices` dual-build (was producing API `index.js` entrypoint and **“No Production Deployment”** on `sec-nightlife`)
- Frontend project must stay Vite SPA only; API stays on `sec-nightlife-2io4`
- Founder checklist updated: pooled `DATABASE_URL`, Upstash REST vars, **same region** for Vercel Functions / Neon / Redis
- API `vercel.json`: `regions: ["fra1"]`, `maxDuration: 60` (change region if Neon is not Frankfurt)

### Backend
- **Auth user cache** in Redis (~45s) — `authenticateToken` no longer hits Neon every request
- **Rate-limit Lua** — one Redis round-trip instead of incr → expire → ttl
- **Home bootstrap + feed + table-offerings** Redis cache (incl. authenticated, short TTL)
- **Batched table spots** — no N× `buildEventTableTiers` on Home offerings
- **Payment repair** branches by `metadata.type` (no sequential all-path waterfall)
- **Refresh tokens** — SHA-256 lookup only; removed legacy 500-row bcrypt scan
- **Composite indexes** — migration `20260723220000_performance_composite_indexes`
- Featured carousel API resolves featured/boosted ids when `ids` omitted

### Frontend
- Eager pages shrunk to auth/payment deep-links (legal/help lazy)
- Login no longer re-fetches `/api/auth/me` before redirect
- AuthContext no longer soft-revalidates `/me` on every route change
- Home featured: single `/api/events/featured-details?limit=5`
- Payment poll: verify once, repair once if stuck — not interleaved every few polls
- Layout badges via React Query (60s stale / 120s interval)
- Dropped Google Fonts CDN (system UI stack — no render-blocking third-party font)

## Founder env checklist (required for paid stack to work)

On **API** Vercel Production (`sec-nightlife-2io4`):

1. `DATABASE_URL` = Neon **pooler** (`-pooler.neon.tech`)
2. `DIRECT_DATABASE_URL` = Neon direct (migrations)
3. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (same region as Neon)
4. Functions region matches Neon (default code: `fra1`)
5. Run: `cd backend && npx prisma migrate deploy`

On **frontend** Vercel (`sec-nightlife`):

1. Root Directory = `sec-night-life`, Output = `dist`
2. Production deploy exists (not “No Production Deployment”)
3. `VITE_API_URL=https://api.secnightlife.com`, `VITE_PUBLIC_APP_URL=https://secnightlife.com`
4. Domain `secnightlife.com` on that Production deployment

See [POST_MERGE_FOUNDER_GUIDE.md](./POST_MERGE_FOUNDER_GUIDE.md) and [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md).

## Verify after redeploy

```bash
curl -sI https://secnightlife.com | head -5
curl -s https://api.secnightlife.com/api/health
curl -s https://api.secnightlife.com/api/health/ready
```

Timed walkthrough: Register → Login/OTP → Home → table/event checkout → Paystack verify. In Upstash console, confirm keys like `home:bootstrap:*` and `auth:user:*` after Home load.
