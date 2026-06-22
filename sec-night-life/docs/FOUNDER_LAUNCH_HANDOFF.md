# SEC Nightlife — Founder Launch Handoff

Step-by-step guide for transferring ownership, collecting credentials, and preparing for Play Store and App Store submission.

**Tagline:** Your Night. Simplified.

---

## Quick call checklist

Use this during the founder meeting. Check off as you go.

- [ ] Transfer **frontend** Vercel project to founder
- [ ] Transfer **backend** Vercel project to founder
- [ ] Transfer **Neon** database project to founder (or schedule)
- [ ] Founder creates **Cloudinary** account → collect credentials + upload preset
- [ ] Add founder **Google Maps** key to frontend Vercel
- [ ] Founder creates **Resend** account → verify domain
- [ ] Founder creates **Sentry** org → copy DSNs (optional but recommended)
- [ ] Confirm **custom domain** (e.g. `app.secnightlife.com` + `api.secnightlife.com`)
- [ ] Founder registers **Apple Developer** ($99/year)
- [ ] Founder registers **Google Play Console** ($25 once)
- [ ] **Defer:** Live Paystack keys, store screenshots, Pusher, full Cloudinary media migration

---

## What transfers vs what is created new

| Service | Current owner | Action | Notes |
|---------|---------------|--------|-------|
| Vercel Frontend | Developer | **Transfer project** | Settings → Transfer Project → founder's team |
| Vercel Backend | Developer | **Transfer project** | Second project — same process |
| Neon PostgreSQL | Developer | **Transfer project** | Neon Console → Transfer to founder org (keeps `DATABASE_URL`) |
| Cloudinary | Developer | **Founder creates new** | Accounts are not transferable; see Cloudinary section |
| Google Maps | Founder | **Add key to Vercel** | Already founder-owned |
| Resend | TBD | **Founder creates new** | Required for production email |
| Paystack | TBD | **Founder business account** | You configure live keys after call |
| Sentry | None | **Founder creates org** | Free tier OK at launch |
| Pusher | None | **Optional** | Post-launch chat performance upgrade |
| Firebase | None | **Founder creates project** | Push notifications for native app |
| Apple Developer | None | **Founder registers** | Needed for iOS + Team ID |
| Google Play | None | **Founder registers** | Needed for Android SHA-256 |

---

## Credential capture form

Fill in during the call. Share via password manager — never plain-text chat.

### Backend Vercel project

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `DATABASE_URL` | | Neon dashboard (after transfer) |
| `DIRECT_DATABASE_URL` | | Neon direct connection string (migrations) |
| `JWT_ACCESS_SECRET` | | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | | Generate a **different** 64+ char secret |
| `NODE_ENV` | `production` | Set manually |
| `CORS_ORIGIN` | `https://app.YOUR_DOMAIN` | Your custom frontend URL |
| `APP_URL` | `https://app.YOUR_DOMAIN` | Same as public app URL |
| `RESEND_API_KEY` | | resend.com → API Keys |
| `EMAIL_FROM` | `SEC Nightlife <noreply@YOUR_DOMAIN>` | After domain verified in Resend |
| `CLOUDINARY_CLOUD_NAME` | | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | | Cloudinary dashboard (backend only) |
| `CRON_SECRET` | | Random string; same in Vercel Cron settings |
| `PAYSTACK_SECRET_KEY` | | Paystack dashboard (later) |
| `PAYSTACK_PUBLIC_KEY` | | Paystack dashboard (later) |
| `SUPER_ADMIN_EMAIL` | | Founder's admin email |
| `SENTRY_DSN` | | sentry.io → Project → DSN (optional) |
| `PUSHER_APP_ID` | | pusher.com (optional, post-launch) |
| `PUSHER_KEY` | | pusher.com (optional) |
| `PUSHER_SECRET` | | pusher.com (optional) |
| `PUSHER_CLUSTER` | e.g. `eu` | pusher.com (optional) |

### Frontend Vercel project

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `VITE_API_URL` | `https://api.YOUR_DOMAIN` | Backend custom domain |
| `VITE_PUBLIC_APP_URL` | `https://app.YOUR_DOMAIN` | Frontend custom domain |
| `VITE_CLOUDINARY_CLOUD_NAME` | | Same as backend Cloudinary |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | e.g. `sec_unsigned_uploads` | Cloudinary upload preset |
| `VITE_GOOGLE_MAPS_API_KEY` | | Google Cloud Console (founder has) |
| `VITE_PAYSTACK_PUBLIC_KEY` | | Paystack (later) |
| `VITE_SENTRY_DSN` | | Sentry frontend DSN (optional) |

### Native / store-only (after Capacitor build)

| Item | Value | Where to get it |
|------|-------|-----------------|
| Apple Team ID | | developer.apple.com → Membership |
| Android package | `com.secnightlife.app` | Already set |
| Android SHA-256 fingerprint | | Release keystore — see CAPACITOR_BUILD.md |
| Firebase `google-services.json` | | Firebase console → Android app |
| Firebase `GoogleService-Info.plist` | | Firebase console → iOS app |

---

## Transfer guides

### Vercel (frontend + backend)

1. Open each project in Vercel dashboard.
2. **Settings → General → Transfer Project**.
3. Enter founder's Vercel team slug or email.
4. Founder accepts transfer → becomes billing owner.
5. Env vars and domains stay attached — verify after transfer.
6. Redeploy both projects after any env changes.

### Neon database

**Preferred:** Transfer project

1. Neon Console → select project → **Settings → Transfer**.
2. Transfer to founder's Neon organization.
3. `DATABASE_URL` in backend Vercel stays valid if connection string unchanged.

**Alternative:** Export/import

```bash
pg_dump "$OLD_DATABASE_URL" > sec_backup.sql
psql "$NEW_DATABASE_URL" < sec_backup.sql
```

Update `DATABASE_URL` and `DIRECT_DATABASE_URL` in backend Vercel.

### Cloudinary (founder creates new account)

Cloudinary accounts **cannot be transferred**. Founder must own the account.

1. Sign up at [cloudinary.com](https://cloudinary.com) with business email.
2. Dashboard → copy **Cloud Name**, **API Key**, **API Secret**.
3. **Settings → Upload → Upload presets → Add**:
   - Name: `sec_unsigned_uploads`
   - Signing mode: **Unsigned**
   - Folder: `sec-nightlife`
   - Allowed formats: images + PDF
4. Update Vercel env vars (backend + frontend) → redeploy both.
5. Test uploads: venue logo, promotion image, job CV, compliance document.

**Existing media in database:** URLs still point to developer's old Cloudinary.

- **Quick path:** New uploads use founder account; old images work until re-uploaded.
- **Full migration:** Copy assets old → new Cloudinary + update DB URLs (post-call task).

---

## Custom domain setup (two Vercel projects)

Replace `YOUR_DOMAIN` with the real domain (e.g. `secnightlife.com`).

### 1. Frontend Vercel project

- Add domain: `app.YOUR_DOMAIN` (or root `YOUR_DOMAIN`)
- DNS: CNAME to `cname.vercel-dns.com` (Vercel shows exact record)

### 2. Backend Vercel project

- Add domain: `api.YOUR_DOMAIN`
- DNS: CNAME per Vercel instructions

### 3. Update environment variables

| Project | Variable | Value |
|---------|----------|-------|
| Frontend | `VITE_API_URL` | `https://api.YOUR_DOMAIN` |
| Frontend | `VITE_PUBLIC_APP_URL` | `https://app.YOUR_DOMAIN` |
| Backend | `CORS_ORIGIN` | `https://app.YOUR_DOMAIN` |
| Backend | `APP_URL` | `https://app.YOUR_DOMAIN` |

Redeploy **both** projects after changes.

### 4. Google Maps API key restrictions

In Google Cloud Console → APIs & Services → Credentials:

- HTTP referrers: `https://app.YOUR_DOMAIN/*`, `http://localhost:*`
- Android app: package `com.secnightlife.app` + SHA-1 from release keystore
- iOS app: bundle ID `com.secnightlife.app`

### 5. Resend domain verification

- Add domain in Resend → copy DNS records (SPF, DKIM) to domain registrar
- Wait for verification → set `EMAIL_FROM=noreply@YOUR_DOMAIN`

### 6. Verify deep links

After deploy, these must return **JSON** (not HTML):

- `https://app.YOUR_DOMAIN/.well-known/assetlinks.json`
- `https://app.YOUR_DOMAIN/.well-known/apple-app-site-association`

Update placeholders in `public/.well-known/`:

- `FOUNDER_APPLE_TEAM_ID` → real Team ID
- `FOUNDER_ANDROID_SHA256_FINGERPRINT` → release keystore SHA-256

---

## Production safety (must confirm before go-live)

| Flag | Required value |
|------|----------------|
| `SKIP_EMAIL_VERIFICATION` | unset or `false` |
| `ALLOW_UNVERIFIED_LOGIN` | unset or `false` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://app.YOUR_DOMAIN` only (no localhost) |
| `APP_URL` | `https://app.YOUR_DOMAIN` |

---

## Cloudinary — where it is used in the app

**Backend:** `backend/src/routes/upload.js`, `backend/src/lib/cloudinarySignedUrl.js`, compliance documents

**Frontend (browser uploads):** Venue Onboarding, Business Dashboard, Business Promotions, Job CV upload, hosted table photos, business messaging attachments

---

## Pusher (optional — post-launch)

Current chat uses HTTP polling (8–60 second refresh). Pusher enables instant messaging but is **not required** for store approval.

When ready: create Pusher app → add `PUSHER_*` env vars → implement WebSocket layer (separate engineering task).

---

## Store submission prerequisites

See also: [CAPACITOR_BUILD.md](./CAPACITOR_BUILD.md), [FIREBASE_PUSH_SETUP.md](./FIREBASE_PUSH_SETUP.md)

- [ ] `npm run build:mobile` succeeds
- [ ] App runs in Android emulator + iOS simulator
- [ ] All env placeholders replaced on Vercel
- [ ] `manifest.json` + icons load (no 404)
- [ ] `.well-known` URLs return valid JSON
- [ ] Upload test on founder's Cloudinary
- [ ] Account deletion works on production
- [ ] Apple Team ID + Android SHA-256 in deep link files
- [ ] Release AAB (Android) + IPA (iOS) signed
- [ ] Store screenshots + listings (you handle separately)
- [ ] Live Paystack (you handle separately)

---

## Related docs

- [VERCEL_ENV_FRONTEND.md](./VERCEL_ENV_FRONTEND.md)
- [VERCEL_ENV_BACKEND.md](./VERCEL_ENV_BACKEND.md)
- [CAPACITOR_BUILD.md](./CAPACITOR_BUILD.md)
- [FIREBASE_PUSH_SETUP.md](./FIREBASE_PUSH_SETUP.md)
