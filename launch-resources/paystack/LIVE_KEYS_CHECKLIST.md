# Paystack Live Keys — Post-Approval Checklist

Complete these steps **after** Paystack approves live activation for Sec Nightlife (1806436).

---

## 1. Vercel — Backend project

| Variable | Value |
|----------|-------|
| `PAYSTACK_SECRET_KEY` | `sk_live_...` |
| `PAYSTACK_PUBLIC_KEY` | `pk_live_...` |
| `APP_URL` | Production frontend URL (e.g. `https://secnightlife.com` or current Vercel URL) |

Redeploy backend after saving.

---

## 2. Vercel — Frontend project

| Variable | Value |
|----------|-------|
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_...` (must match backend account/mode) |

**Redeploy frontend** — Vite bakes `VITE_*` at build time. A backend-only key change is not enough.

Alternative: omit `VITE_PAYSTACK_PUBLIC_KEY` and rely on `GET /api/payments/paystack-public-key` (requires `PAYSTACK_PUBLIC_KEY` on backend).

---

## 3. Paystack dashboard

- **Webhook URL:** `https://<api-domain>/api/webhooks/paystack`
  - Alternate: `https://<api-domain>/api/payments/paystack/webhook`
- **Events:** `charge.success`, `charge.failed`
- Confirm **ZAR** enabled on live account
- Enable **Transfers** and fund transfer balance for venue/host payouts

---

## 4. Smoke tests (production)

1. Small real ticket purchase → ticket + QR in Profile → Tickets
2. Confirm webhook received in Paystack dashboard (charge.success)
3. Venue with payout setup: verify 85% transfer attempt in logs / Paystack transfers
4. Business promotion publish checkout (uses ZAR + callback_url after code fix)

---

## 5. Operational

- Venues: complete **Payout Setup** in Business Dashboard before expecting transfers
- Hosts: complete payout setup to receive joining-fee share
- Update `legal/LEGAL_URLS.md` and store listings when custom domain goes live

---

## Code reference

- Initialize helper: `sec-night-life/backend/src/lib/paystackInitialize.js`
- 15% split: `sec-night-life/backend/src/lib/platformSplit.js`
- Promotion checkout: `sec-night-life/backend/src/routes/promotions.js` (uses `buildPaystackInitializeBody`)

See also: `sec-night-life/docs/LAUNCH_CHECKLIST.md`, `sec-night-life/docs/VERCEL_ENV_BACKEND.md`
