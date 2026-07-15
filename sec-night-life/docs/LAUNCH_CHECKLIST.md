# SEC Nightlife — Launch Checklist

Use before public launch. Check off each item in Vercel / Neon / external dashboards.

**Full step-by-step (what to pay for + order):** [POST_MERGE_FOUNDER_GUIDE.md](./POST_MERGE_FOUNDER_GUIDE.md)

## Infrastructure

- [ ] Backend `NODE_ENV=production`
- [ ] `DATABASE_URL` (Neon pooler) + `DIRECT_DATABASE_URL` on backend Vercel
- [ ] Run `npx prisma migrate deploy` (includes payout unique + statuses)
- [ ] `CRON_SECRET` set on backend — **required** (backend refuses to start in production without it)
- [ ] Cron includes `/api/cron/retry-payouts`
- [ ] `SKIP_EMAIL_VERIFICATION` and `ALLOW_UNVERIFIED_LOGIN` **unset** on production backend
- [ ] `JWT_ACCESS_EXPIRY` optional (code default 24h, min 1h); `JWT_REFRESH_EXPIRY` optional (code default 120d, min 4 months)
- [ ] `CORS_ORIGIN` + `APP_URL` = `https://secnightlife.com`
- [ ] **Do not** set `CORS_ALLOW_VERCEL_PREVIEW` in production
- [ ] Frontend `VITE_API_URL=https://api.secnightlife.com`, `VITE_PUBLIC_APP_URL=https://secnightlife.com`
- [ ] `RESEND_API_KEY` + verified `EMAIL_FROM` domain
- [ ] Cloudinary + Google Maps keys on frontend/backend Vercel
- [ ] Cloudinary unsigned preset locked (folder/MIME/size)
- [ ] Optional: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Home feed cache)
- [ ] Optional: `VITE_SENTRY_DSN` + backend `SENTRY_DSN`

## Health probes

| Endpoint | Expected |
|----------|----------|
| `GET /api/health` | `{ status: "ok" }` |
| `GET /api/health/ready` | `{ status: "ready", db: "ok" }` |

Point uptime monitors at `/api/health/ready`. Run `npm run verify:production` after deploy (fails if deep-link placeholders remain).

## Smoke tests (production)

1. Guest opens `/` — splash, age gate, cookie notice, no auth spinner
2. Register → verify email → login OTP → Home loads
3. Home loads in **≤5 API calls** on first paint (bootstrap + feed + events + featured-details; venues load on scroll)
4. Map shows pins in nearby + all modes
5. Send group chat message — appears within poll interval
6. Native app: push token registers (`POST /api/users/push-token` returns 200)
7. Cron: verify promotion expiry + retry-payouts ran (Vercel Cron logs)
8. Settings → Download my data works

## Payments (before paid launch)

- [ ] Live Paystack keys on backend + frontend — see [`launch-resources/paystack/LIVE_KEYS_CHECKLIST.md`](../../launch-resources/paystack/LIVE_KEYS_CHECKLIST.md)
- [ ] Paystack activation demo sent — see [`launch-resources/paystack/EMAIL_TO_PAYSTACK.md`](../../launch-resources/paystack/EMAIL_TO_PAYSTACK.md)
- [ ] Webhook URL configured (charge + **transfer** + dispute events)
- [ ] End-to-end test: ticket purchase → QR in Profile → transfer webhook settles ledger
- [ ] Refund path: request → venue approve → reveal account → mark paid (manual / off-app)

## App stores (native)

- [ ] Apple Developer + Google Play accounts
- [ ] Replace `FOUNDER_*` in `.well-known` deep-link files
- [ ] Store screenshots, privacy policy URL, app description — see [`launch-resources/README.md`](../../launch-resources/README.md)
- [ ] Firebase APNs key (iOS) — see `FIREBASE_PUSH_SETUP.md`
- [ ] FCM push delivery from backend — set `FIREBASE_SERVICE_ACCOUNT_JSON` (see `FIREBASE_PUSH_SETUP.md`)
- [ ] Release build uses `aps-environment` = production

## Deferred (optional scale)

- Pusher for real-time chat (~$49+/mo) — only if chat polling feels laggy
- AdminDashboard lazy sub-routes

## Related

- [FOUNDER_SOFTWARE_SETUP.md](./FOUNDER_SOFTWARE_SETUP.md) — software setup and costs
- [POST_MERGE_FOUNDER_GUIDE.md](./POST_MERGE_FOUNDER_GUIDE.md) — ordered post-merge actions
- [PERFORMANCE.md](./PERFORMANCE.md) — performance phases
