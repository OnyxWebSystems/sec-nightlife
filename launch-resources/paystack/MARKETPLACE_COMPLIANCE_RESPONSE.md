# Paystack Marketplace Compliance — Sec Nightlife (1806436)

Internal reference for activation review (Janet, July 2026).

**Business:** Sec Nightlife  
**Merchant ID:** 1806436  
**Founder:** Menzi Simelane — menzisimelane6@gmail.com  
**Developer:** Sihle Simelane — sihle.soa@gmail.com  
**Platform:** https://secnightlife.com

---

## 1. Vendor verification and KYC

Sec Nightlife is a **nightlife services marketplace** (venues, table hosts, promoters)—not a physical-goods store.

### Venue vendors (primary vendors)

Before a venue can operate commercially on the platform, we require onboarding and document upload in the Business Dashboard:

| Document | Purpose |
|----------|---------|
| Liquor licence | Legal alcohol service |
| Business registration (CIPC) | Registered business entity |
| Health certificate | Venue health compliance |
| Tax clearance (SARS) | Tax compliance |

Each document is reviewed **manually** by SEC compliance reviewers (admin dashboard). A venue is marked **verified** only when all required document types are **approved**. Rejected documents must be re-uploaded. Venues cannot publish paid promotions until compliance is in order.

Venue obligations are also defined in our [Venue Compliance Charter](https://secnightlife.com/VenueComplianceCharter).

### Individual users (party-goers, table hosts)

- **Age verification:** Users declare they are 18+ and provide date of birth at registration ([Age Verification Declaration](https://secnightlife.com/AgeVerificationDeclaration)).
- **Identity verification (KYC):** Users may upload a government ID document in Profile. Submissions are **manually reviewed** by SEC admins who approve, reject, or request resubmission. Verified identity is required for certain actions (e.g. hosting tables, inviting guests).
- **Fraud prevention:** Reporting, moderation, and account suspension per [Community Guidelines](https://secnightlife.com/CommunityGuidelines) and [Terms of Service](https://secnightlife.com/TermsOfService).

We do **not** use automated third-party KYC APIs today; verification is human review of uploaded documents against profile information.

---

## 2. Policy documents (links for Paystack)

Paystack requested Acceptable Use, Shipping, and Returns policies. Sec Nightlife sells **digital access and in-venue services**, not shipped physical products.

| Paystack request | Sec Nightlife equivalent | Public URL |
|------------------|--------------------------|------------|
| Acceptable Use Policy | Community Guidelines + Terms of Service + User Agreement | See [POLICY_LINKS.md](./POLICY_LINKS.md) |
| Shipping Policy | Service Delivery & Fulfillment Policy (no physical shipping) | [SERVICE_DELIVERY_POLICY.md](./SERVICE_DELIVERY_POLICY.md) · [Venue Compliance Charter](https://secnightlife.com/VenueComplianceCharter) |
| Returns Policy | Refund Policy | https://secnightlife.com/RefundPolicy |

Optional PNG exports for email attachment: `../legal/documents/` (refund-policy.png, community-guidelines.png, terms-of-service.png).

---

## 3. Payment collection model

**SEC receives customer payments on behalf of vendors** via Paystack checkout on the platform Paystack account.

- Customer pays SEC (Paystack) for tickets, tables, menu items, etc.
- **15%** platform fee retained by SEC.
- **85%** paid to the venue or table host via **Paystack Transfers** after successful charge (when payout bank details are configured).
- **100%** to SEC for pure platform products (venue promotion publishing/boost fees).

Funds do **not** go directly from the customer to the vendor at checkout.

---

## 4. Fund holding and disbursement

| Scenario | Behaviour |
|----------|-----------|
| Successful payment + vendor/host has Paystack transfer recipient configured | **85%** transfer is initiated **promptly after payment verification** (typically within minutes of `charge.success`). |
| Successful payment + missing/invalid payout setup | Recipient share is recorded as **pending** in our payout ledger until the vendor/host completes **Sec Wallet → Payout Setup** with valid bank details. SEC does not hold funds for a fixed multi-day escrow period. |
| SEC platform revenue (15% or 100% flows) | Remains on the SEC Paystack balance. |

We are **not** a licensed escrow agent. SEC acts as a payment facilitator and marketplace operator using Paystack collection and transfers.

---

## 5. Wallets and peer-to-peer transfers

Users and venues have a **Sec Wallet ID** (e.g. `SEC-U-…`, `SEC-V-…`). This is **not** a stored-value e-money wallet.

- **No cash balance** is held inside the app for spending.
- The wallet screen shows **payout history** and **pending earnings** (ledger entries awaiting or completed Paystack transfer).
- Users **cannot** transfer wallet balances to another user or vendor inside the platform.
- Venues may **look up** a user’s wallet ID to facilitate **off-platform bank refunds** when they approve a refund request (venue pays the customer directly via their bank).

---

## 6. Fulfilment centre

**No.** Sec Nightlife is **not** a fulfilment centre.

- We do not warehouse, ship, or deliver physical products.
- **Digital fulfilment:** Event tickets and QR codes are issued in-app immediately after successful payment.
- **Service fulfilment:** Tables, events, and venue services are delivered **in person** at the venue by the venue or host. SEC provides discovery, booking, payment facilitation, and communication tools only.

---

## 7. Refunds, cancellations, and disputes

| Topic | Process |
|-------|---------|
| **Refund responsibility** | Venues/event organizers are primarily responsible. SEC facilitates but does not fund refunds from platform revenue in the ordinary course. |
| **In-app refund requests** | Eligible ticket and table purchases: user submits request in Profile with reason + Sec Wallet ID. |
| **Approved refunds** | Venue pays customer **directly off-platform** (bank transfer), typically using the Sec Wallet ID to identify the payee. SEC retains its **15%** platform fee on the original transaction. QR/tickets are invalidated and capacity restored. |
| **Cancellations** | Event cancellation or venue closure handled per venue policy and [Refund Policy](https://secnightlife.com/RefundPolicy). |
| **Disputes** | User contacts venue first; unresolved cases may be escalated to SEC support for **administrative facilitation only** (SEC does not accept liability for venue outcomes). |
| **Fraud** | SEC may investigate abuse and suspend accounts per Terms and Community Guidelines. |

---

## 8. Platform demo (payments)

Public payment demo video (no login required):

https://res.cloudinary.com/dta2lrkje/video/upload/v1782747050/sec-paystack/payment-demo-ticket.mp4

---

## 9. Website / services visibility

| Resource | URL |
|----------|-----|
| Live web app | https://secnightlife.com |
| Terms of Service | https://secnightlife.com/TermsOfService |
| Privacy Policy | https://secnightlife.com/PrivacyPolicy |
| Help Center (in-app) | https://secnightlife.com/HelpCenter |

The app is in final pre-launch for Apple App Store and Google Play; the web app is fully functional for review.
