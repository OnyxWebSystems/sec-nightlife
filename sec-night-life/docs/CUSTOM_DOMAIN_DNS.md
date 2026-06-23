# Custom domain — secnightlife.com

Production domains:

| Project | Domain | Vercel project |
|---------|--------|----------------|
| **Frontend** | `https://secnightlife.com` | sec-nightlife |
| **Backend** | `https://api.secnightlife.com` | sec-nightlife-2io4 |

Fallback `*.vercel.app` URLs still work until DNS is fully live.

---

## Vercel environment variables (after DNS is valid)

### Frontend Vercel

```env
VITE_API_URL=https://api.secnightlife.com
VITE_PUBLIC_APP_URL=https://secnightlife.com
```

Redeploy frontend after setting (required — `VITE_*` baked at build time).

### Backend Vercel

```env
CORS_ORIGIN=https://secnightlife.com
APP_URL=https://secnightlife.com
```

Redeploy backend after setting.

---

## DNS at domain registrar (GoDaddy)

Adding a domain **inside Vercel** only shows which records to create. You must also add those records at **GoDaddy** (where `secnightlife.com` was purchased).

### Frontend (`secnightlife.com`)

In Vercel → frontend project → **Settings → Domains** → copy the exact record for `secnightlife.com`.

Typically one of:

- **A record** `@` → Vercel IP(s), or
- **CNAME** `@` → `cname.vercel-dns.com` (if registrar supports CNAME on apex)

Also add `www.secnightlife.com` in Vercel and point `www` → redirect to root (optional).

### Backend (`api.secnightlife.com`)

In Vercel → backend project → **Settings → Domains** → add `api.secnightlife.com`.

At GoDaddy DNS:

| Type | Name | Value |
|------|------|--------|
| CNAME | `api` | `cname.vercel-dns.com` (use value Vercel shows) |

---

## Verify DNS is working

Run these checks (or use [dnschecker.org](https://dnschecker.org)):

```bash
# Should NOT return GoDaddy parking page — should be Vercel
curl -sI https://secnightlife.com | head -5

# Should return JSON health check, not HTML
curl -s https://api.secnightlife.com/api/health

# Deep links (must return JSON, not SPA HTML)
curl -s https://secnightlife.com/.well-known/assetlinks.json
curl -s https://secnightlife.com/.well-known/apple-app-site-association
```

### Signs DNS is NOT ready yet

- `secnightlife.com` shows GoDaddy “coming soon” / website builder
- `api.secnightlife.com` does not resolve (NXDOMAIN)
- API URL returns HTML instead of JSON

DNS can take **5 minutes to 48 hours** after GoDaddy changes.

---

## Google Maps key restrictions

Add to Google Cloud Console → Credentials → your browser key:

- `https://secnightlife.com/*`
- `http://localhost:*`
- Android: `com.secnightlife.app`
- iOS: `com.secnightlife.app`

---

## Resend email

Verify domain `secnightlife.com` in Resend, then:

```env
EMAIL_FROM=SEC Nightlife <noreply@secnightlife.com>
```

---

## Related docs

- [VERCEL_ENV_FRONTEND.md](./VERCEL_ENV_FRONTEND.md)
- [VERCEL_ENV_BACKEND.md](./VERCEL_ENV_BACKEND.md)
- [FOUNDER_LAUNCH_HANDOFF.md](./FOUNDER_LAUNCH_HANDOFF.md)
