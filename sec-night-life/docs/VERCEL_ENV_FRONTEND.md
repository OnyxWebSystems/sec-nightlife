# Frontend Vercel Environment Variables

Copy each variable into the **frontend** Vercel project → Settings → Environment Variables.

Apply to **Production**, **Preview**, and **Development** as appropriate. Redeploy after changes.

---

## Required for production

| Variable | Example placeholder | Where to get it | Used in |
|----------|---------------------|-----------------|---------|
| `VITE_API_URL` | `https://api.secnightlife.com` | Backend custom domain | `src/api/client.js`, `src/config/env.js` |
| `VITE_PUBLIC_APP_URL` | `https://secnightlife.com` | Frontend custom domain | `src/utils/index.ts` (share links, ticket QR) |
| `VITE_CLOUDINARY_CLOUD_NAME` | `founder_cloud_name` | Cloudinary dashboard | Venue onboarding, promotions, uploads |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | `sec_unsigned_uploads` | Cloudinary → Upload presets (unsigned) | Browser direct uploads |
| `VITE_GOOGLE_MAPS_API_KEY` | `AIza...` | Google Cloud Console (founder) | Map, address autocomplete |

---

## Optional

| Variable | Example | Where to get it | Used in |
|----------|---------|-----------------|---------|
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_...` | Paystack dashboard | `src/lib/paystackInline.js` — or backend exposes via API |
| `VITE_SENTRY_DSN` | `https://...@sentry.io/...` | Sentry → Project → Client Keys (DSN) | `src/lib/sentry.js` |

---

## Local development

Copy `sec-night-life/.env.example` to `.env.local`:

```env
VITE_API_URL=http://localhost:4000
VITE_PUBLIC_APP_URL=http://localhost:5173
VITE_CLOUDINARY_CLOUD_NAME=founder_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=sec_unsigned_uploads
VITE_GOOGLE_MAPS_API_KEY=your_browser_maps_key
```

---

## Notes

- `VITE_*` variables are baked in at **build time**. Changing them requires a **redeploy**.
- Never put `CLOUDINARY_API_SECRET` in the frontend — backend only.
- If `VITE_API_URL` is wrong, the app may receive HTML instead of API JSON.
