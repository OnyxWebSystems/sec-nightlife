# SEC Nightlife — Launch Checklist

Use before public launch. Check off each item in Vercel / Neon / external dashboards.

## Infrastructure

- [ ] Backend `NODE_ENV=production`
- [ ] `DATABASE_URL` (Neon pooler) + `DIRECT_DATABASE_URL` on backend Vercel
- [ ] `CRON_SECRET` set on backend — **required** (cron jobs fail without it)
- [ ] `SKIP_EMAIL_VERIFICATION` and `ALLOW_UNVERIFIED_LOGIN` **unset** on production backend
- [ ] `JWT_ACCESS_EXPIRY=15m`, `JWT_REFRESH_EXPIRY=365d`
- [ ] `CORS_ORIGIN` + `APP_URL` = `https://secnightlife.com` (or your domain)
- [ ] `RESEND_API_KEY` + verified `EMAIL_FROM` domain
- [ ] Frontend `VITE_API_URL`, `VITE_PUBLIC_APP_URL`, Cloudinary, Google Maps keys
- [ ] Optional: `VITE_SENTRY_DSN` + backend `SENTRY_DSN`

## Health probes

| Endpoint | Expected |
|----------|----------|
| `GET /api/health` | `{ status: "ok" }` |
| `GET /api/health/ready` | `{ status: "ready", db: "ok" }` |

Point uptime monitors at `/api/health/ready`.

## Smoke tests (production)

1. Guest opens `/` — splash, no auth spinner, zero API calls
2. Register → verify email → login OTP → Home loads
3. Home loads in **≤5 API calls** (bootstrap + feed + events + venues + featured-details)
4. Map shows pins in nearby + all modes
5. Send group chat message — appears within poll interval
6. Native app: push token registers (`POST /api/users/push-token` returns 200)
7. Cron: verify promotion expiry ran (check Vercel Cron logs)

## Payments (before paid launch)

- [ ] Live Paystack keys on backend + frontend
- [ ] Webhook URL configured in Paystack dashboard
- [ ] End-to-end test: ticket purchase → QR in Profile

## App stores (native)

- [ ] Apple Developer + Google Play accounts
- [ ] Store screenshots, privacy policy URL, app description
- [ ] Firebase APNs key (iOS) — see `FIREBASE_PUSH_SETUP.md`
- [ ] FCM send service (backend) — tokens stored; delivery wiring is post-launch if not yet implemented

## Deferred (post-launch)

- Upstash Redis for feed caching + distributed rate limits
- FCM push delivery from backend cron/events
- AdminDashboard lazy sub-routes
