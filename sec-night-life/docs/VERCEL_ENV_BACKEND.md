# Backend Vercel Environment Variables

Copy each variable into the **backend** Vercel project → Settings → Environment Variables.

Redeploy after changes. Cron jobs require `CRON_SECRET` to match Vercel Cron auth.

---

## Required (all environments)

| Variable | Example placeholder | Where to get it | Used in |
|----------|---------------------|-----------------|---------|
| `DATABASE_URL` | `postgresql://...@...neon.tech/...` | Neon dashboard | Prisma, all DB access |
| `JWT_ACCESS_SECRET` | 64+ char random hex | Generate new for prod | `routes/auth.js` |
| `JWT_REFRESH_SECRET` | Different 64+ char random | Generate new for prod | `routes/auth.js` |

---

## Required in production (`NODE_ENV=production`)

| Variable | Example placeholder | Where to get it | Used in |
|----------|---------------------|-----------------|---------|
| `NODE_ENV` | `production` | Set manually | Startup validation |
| `CORS_ORIGIN` | `https://secnightlife.com` | Frontend URL | `src/app.js` |
| `APP_URL` | `https://secnightlife.com` | Frontend URL | Email links, deep links |
| `RESEND_API_KEY` | `re_...` | resend.com | `src/lib/email.js` |
| `EMAIL_FROM` | `SEC Nightlife <noreply@secnightlife.com>` | After Resend domain verify | Transactional email |

---

## Strongly recommended for production

| Variable | Example placeholder | Where to get it | Used in |
|----------|---------------------|-----------------|---------|
| `CLOUDINARY_CLOUD_NAME` | `founder_cloud_name` | Cloudinary dashboard | Uploads, signed URLs |
| `CLOUDINARY_API_KEY` | numeric key | Cloudinary dashboard | Upload signature |
| `CLOUDINARY_API_SECRET` | secret string | Cloudinary dashboard | Signing, server uploads |
| `CRON_SECRET` | random string | Generate; set in Vercel Cron | `routes/cron.js` |
| `DIRECT_DATABASE_URL` | Neon direct URL | Neon dashboard | `scripts/vercel-build.mjs` migrations |
| `PAYSTACK_SECRET_KEY` | `sk_live_...` | Paystack (later) | Payments, webhooks |
| `PAYSTACK_PUBLIC_KEY` | `pk_live_...` | Paystack (later) | SPA fallback endpoint |
| `SUPER_ADMIN_EMAIL` | `admin@secnightlife.com` | Founder email | Compliance notifications |

---

## Optional

| Variable | Example | Where to get it | Used in |
|----------|---------|-----------------|---------|
| `SENTRY_DSN` | `https://...@sentry.io/...` | Sentry backend DSN | `src/lib/sentry.js` |
| `PUSHER_APP_ID` | numeric | pusher.com | Future real-time chat |
| `PUSHER_KEY` | key string | pusher.com | Future real-time chat |
| `PUSHER_SECRET` | secret | pusher.com | Future real-time chat |
| `PUSHER_CLUSTER` | `eu` | pusher.com | Future real-time chat |
| `SUPPORT_CONTACT_EMAIL` | `support@...` | Founder | Legal pages |
| `ADMIN_CONTACT_EMAIL` | `admin@...` | Founder | Legal pages |
| `PUBLIC_APP_URL` | `https://app...` | Fallback for ticket URLs | `ticketVerifyUrl.js` |

---

## Must NOT be set in production

| Variable | Required value |
|----------|----------------|
| `SKIP_EMAIL_VERIFICATION` | unset or `false` |
| `ALLOW_UNVERIFIED_LOGIN` | unset or `false` |

---

## Local development

Copy `backend/.env.example` to `backend/.env`.

---

## Generate secrets

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run twice for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — they must differ.
