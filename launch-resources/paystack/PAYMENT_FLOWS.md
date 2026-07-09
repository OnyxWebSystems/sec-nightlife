# SEC Nightlife — Payment Flows Reference

Internal reference for Paystack activation and store compliance.

**Platform:** https://secnightlife.com  
**Currency:** ZAR  
**Gateway:** Paystack (inline checkout + webhook verification)

---

## Platform fee model

- **15% SEC platform fee** on gross transaction value (embedded in customer total, not added on top)
- **85%** paid to recipient (venue or host) via Paystack Transfers after payout setup
- **100% to SEC** on pure platform products (promotions, boosts, certain host fees)

Source: `sec-night-life/backend/src/lib/platformSplit.js` — `PLATFORM_FEE_RATE = 0.15`

---

## Party-goer payments

| Flow | Description | SEC share | Recipient |
|------|-------------|-----------|-----------|
| Event tickets | Buy tickets for venue events | 15% | Venue (85%) |
| Event entrance | Pay entrance only (table events); optional menu | 15% | Venue (85%) |
| Join venue table | Join a table at a venue; may include menu items | 15% | Venue (85%) |
| Host venue table | Pay to host a table at a venue | 15% | Venue (85%) |
| Join hosted table | Join another user's hosted table; joining fee to host; entrance/menu to venue | 15% | Host (join) / Venue (entrance+menu) |
| Hosted table menu | Order menu items on a hosted table after joining | 15% | Venue (85%) |
| Ticketed event tables | Host/join tables on ticketed events (table pass = entry QR) | 15% | Same as table host/join splits |
| Host own event | Pay entrance / host fees to run event at venue | 15% venue share; host fees may be 100% SEC | Venue / SEC |
| Table boost | Pay to boost table visibility | 100% | SEC |
| External listing | List table at external venue | 100% | SEC |

**Checkout:** User selects items → backend creates Paystack transaction → Paystack inline overlay in browser/app → verify + webhook → tickets/QR or table confirmation in Profile.

---

## Business owner payments

| Flow | Description | SEC share |
|------|-------------|-----------|
| Publish promotion | R50/day to run venue promotion in app | 100% |
| Boost promotion | R150/day to boost promotion visibility | 100% |

**Checkout:** Business Dashboard → Promotions → create draft → Pay to publish → Paystack inline → promotion goes live.

---

## Payouts to venues and hosts

Recipients configure bank details via **Wallet / Payout Setup** in the app. SEC stores a Paystack transfer recipient code and sends **85%** of eligible transactions after successful charge. SEC's **15%** remains on the platform Paystack balance.

---

## Demo video (Paystack activation)

`payment-demo-ticket.mp4` — party-goer purchases an event ticket using Paystack test checkout, then shows ticket + QR in Profile.

Test card (Paystack ZA test): `4084084084084081`, any future expiry, CVV `408`, PIN `0000` if prompted.

---

## Live activation checklist

See [`LIVE_KEYS_CHECKLIST.md`](./LIVE_KEYS_CHECKLIST.md).
