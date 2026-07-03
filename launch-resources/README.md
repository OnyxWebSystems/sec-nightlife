# SEC Nightlife — Launch Resources

Everything needed to submit SEC to the **Apple App Store**, **Google Play Store**, and complete **Paystack live activation**.

**Live app:** https://secnightlife.com

---

## Folder structure

| Folder | Contents |
|--------|----------|
| [`app-store/`](app-store/) | 1024×1024 icon, resized screenshots (1290×2796), listing copy template |
| [`play-store/`](play-store/) | 512 icon, feature graphic (1024×500), resized screenshots (1080×1920), listing copy |
| [`screenshots/mobile/`](screenshots/mobile/) | Source mobile captures (390×844 @3x) — party-goer & business-owner |
| [`legal/`](legal/) | Exported legal page PNGs + [`LEGAL_URLS.md`](legal/LEGAL_URLS.md) for store forms |
| [`paystack/`](paystack/) | Payment demo video, activation email draft, payment flows reference |
| [`brand/`](brand/) | Logos and brand guide |
| [`copy/`](copy/) | Taglines and messaging |
| [`scripts/`](scripts/) | Capture and export automation |

---

## Capture store screenshots (your accounts)

From `sec-night-life/`:

```bash
npm run launch:capture
```

A **visible browser** opens on production. You log in twice:

1. **Business Owner** — sign in (complete OTP if asked). The script **automatically opens Business Dashboard** — you do not need the nav bar. Optional direct link: `https://secnightlife.com/BusinessDashboard`
2. **Party-Goer** — sign in after logout, press **Enter** when on Home (or create `launch-resources/scripts/.continue-party`)

### Screenshots captured

**Party-goer:** Home, Profile, Messages, Notifications, Friends, Host Dashboard

**Business owner:** Dashboard, Analytics, Bookings, Menu (Food tab)

---

## Export legal documents

```bash
npm run launch:export-legal
```

Exports all Settings → Support legal pages as PNGs and updates `legal/LEGAL_URLS.md`.

---

## Paystack activation demo

```bash
npm run launch:paystack-demo
```

Log in as party-goer, complete a **test ticket purchase**, then press Enter. Output: `paystack/payment-demo-ticket.mp4`

See [`paystack/EMAIL_TO_PAYSTACK.md`](paystack/EMAIL_TO_PAYSTACK.md) for the email to send with the video.

---

## Generate icons & resize screenshots

```bash
npm run launch:generate-assets
```

Creates App Store / Play Store icons, feature graphic, and resizes mobile screenshots into `app-store/screenshots/` and `play-store/screenshots/`.

---

## Package for sharing

```bash
zip -r sec-launch-resources.zip launch-resources/
```

PowerShell:

```powershell
Compress-Archive -Path launch-resources -DestinationPath sec-launch-resources.zip -Force
```

---

## Related docs

- Native build: [`sec-night-life/docs/CAPACITOR_BUILD.md`](../sec-night-life/docs/CAPACITOR_BUILD.md)
- Launch checklist: [`sec-night-life/docs/LAUNCH_CHECKLIST.md`](../sec-night-life/docs/LAUNCH_CHECKLIST.md)
- Founder handoff: [`sec-night-life/docs/FOUNDER_LAUNCH_HANDOFF.md`](../sec-night-life/docs/FOUNDER_LAUNCH_HANDOFF.md)
