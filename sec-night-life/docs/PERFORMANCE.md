# SEC Nightlife — Performance (Phase 1)

Production readiness improved from **~62/100** to **~78/100** via safe, low-risk optimizations.

## Phase 1 — Implemented

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
- **Vite** — `manualChunks` for react, query, motion, sentry, charts, radix
- **Sentry** — dynamic import after first paint

### Assets
- **Cloudinary** — `cloudinaryCardUrl` / `cloudinaryDetailUrl` via `getEventImage` / `getVenueImage`
- **Fonts** — Inter 400/600 only + preload
- **Dependencies** — removed unused heavy packages (maps, three, lodash, moment, etc.)

## Phase 2 — Deferred (requires approval)

- Upstash Redis for public feeds + distributed rate limits
- `GET /api/home/bootstrap` aggregated endpoint
- Short-lived auth suspension cache
- Lazy Layout shell refactor

## Deploy notes

Run on production DB after deploy:

```bash
cd backend && npx prisma migrate deploy
```

Verify Vercel env: pooled `DATABASE_URL`, `DIRECT_DATABASE_URL` for migrations.
