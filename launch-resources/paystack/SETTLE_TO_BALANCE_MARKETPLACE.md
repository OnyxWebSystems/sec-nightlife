# Paystack: Settled to Balance (marketplace venue Transfers)

**Business:** Sec Nightlife · Paystack ID **1806436**  
**Goal:** Customer charges settle into **Paystack Balance (Available)** so the SEC app can **automatically Transfer** venue/host shares. SEC’s platform fee stays in Available (withdraw to Standard Bank when you choose). Money must **not** auto-payout the full net to Standard Bank.

**Do not switch payment gateways** until this path is proven impossible. The app already auto-Transfers from Available when funded.

**Never share Paystack login/password with developers or AI tools.** Founder/ops click the dashboard; engineers guide from screenshots.

---

## Money flow (intended)

1. Customer pays Sec Nightlife (live charge).
2. Paystack takes its processing fee.
3. Net settles into **Transfers → Balance → Available** (Payout schedule = **Settled to Balance**).
4. App Transfers API sends venue/host share (~85% or ~96% on tickets) to their Sec Wallet recipient.
5. SEC platform fee remains in Available; withdraw to Standard Bank later if needed.

If **Payouts** shows **Paid → Sec Nightlife ~R8.51** and **Available = R0**, settlement is still going to the **business bank**, not Available. Venue Sec Wallet stays **Pending**.

---

## Step 1 — Confirm Manual Payouts (Preferences, not Accounts)

Official check ([Paystack Manual payouts](https://support.paystack.com/en/articles/2131074)):

1. Open **[Settings → Preferences](https://dashboard.paystack.com/#/settings/preferences)** while logged into **Sec Nightlife (1806436)**, **Live**.
2. Find **Tax Invoices, Payouts & Balances** → **Payout schedule**.
3. It must say **Settled to Balance** (Manual).

**Wrong page:** Settings → Accounts → Payouts (Standard Bank ENABLED) only shows the withdraw/settlement bank. That does **not** prove Settled to Balance.

Screenshot Preferences (Payout schedule line) + Transfers → Balance + Payouts list.

If schedule is still **Settled two days after** (or similar auto bank schedule), Manual Payouts was not applied — escalate (Step 2).

---

## Step 2 — Escalation email (copy/paste)

Send to the support thread (Ijeoma / Favour). Attach screenshots.

```
Subject: Manual Payouts not Settled to Balance — 1806436 still auto-pays Standard Bank

Hi Ijeoma / Favour,

On 30 Jul you confirmed Manual Payouts for Sec Nightlife (1806436). Customer charges are still settling as Payouts → Paid to Sec Nightlife / Standard Bank (ZAR 8.51 on 25 Jul and again on 1 Aug). Transfers → Balance → Available remains R0, so our Transfers API cannot pay venue/host shares.

Please confirm on 1806436:

1. Settings → Preferences → Payout schedule is Settled to Balance (not automatic bank payout).
2. New live charges credit Paystack Balance / Available for Transfers (marketplace: we Transfer ~85%/96% to venue recipients; SEC keeps the platform fee in balance).
3. Stop auto-payout of full settlement to Standard Bank for this account.

Screenshots of Preferences + Payouts + Balance attached / available on request.

Kind regards,
Sihle — Sec Nightlife / Menzi Simelane
```

If Preferences already shows Settled to Balance but bank payouts continue, ask them to **re-apply the schedule switch** (SA is backend-only).

---

## Step 3 — Optional: Topup smoke test (proves the app, not settlement)

Use only to verify Transfers API + Sec Wallet **Received** while waiting on settlement config:

1. Transfers → Balance → **Topup** (SA EFT; ~1% top-up fee).
2. Fund at least **R20–R50** Available.
3. Wait for cron/retry (or next payment path) so a **Pending** ~R8.50 venue ledger can Transfer.
4. Check Paystack → Transfers (a send appears) and Business Dashboard → Sec Wallet → **Received**.

This does **not** fix customer charges auto-paying Standard Bank. Stop live entrance tests until Available receives settlements (or you only Topup for controlled tests).

---

## Success criteria (after Settled to Balance works)

After a small live sale:

1. Available increases (not a new full-net **Paid** payout to Standard Bank).
2. Paystack **Transfers** shows ~venue share to the venue recipient.
3. Sec Wallet line → **Received**.
4. SEC fee remains in Available (optional later withdraw to Standard Bank).

---

## Fallback (only if Paystack refuses Settled to Balance)

Stay on Paystack; plan a later engineering change to **Transaction Splits + Subaccounts** (settle venue share at charge time). That is a separate project — do not migrate to another gateway first.

Marketing emails about the “new Dashboard” (Transfers UI, Recurring, Audit Logs) are unrelated to settlement schedule.
