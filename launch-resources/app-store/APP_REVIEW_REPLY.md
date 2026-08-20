# App Store Review reply — Build 8 (login fix)

**Use Build 8** for re-review. Paste into **Reply to App Review** and **App Review Information → Notes**.

---

```
Hello App Review Team,

Thank you for the follow-up review on iPad Air 11-inch (Build 7).

We identified and fixed the login error. Please review iOS 1.0 (Build 8).

What we fixed
- The native Capacitor build now always calls the production API (https://api.secnightlife.com) instead of relative/localhost URLs inside the iPad WebView.
- Production CORS now allows Capacitor WebView origins (https://localhost / capacitor://localhost).
- Login UI is scrollable on iPad so the Sign In / OTP controls remain reachable with the keyboard open.
- Network error messaging no longer shows developer-only instructions.

Demo account (party-goer / USER)
Email: onyxwebsystems@gmail.com
Password: 123Sihle!

Important — email OTP
After a successful password check, the app emails a 6-digit sign-in code to the demo inbox. Please open that email (and spam folder if needed), enter the code, then continue.

Suggested path after login
Home → open a venue/event → Messages → Profile → Settings → Delete Account (show confirmation, then Cancel — please do not permanently delete the shared demo account).

Support: support@secnightlife.com
Help Center: https://secnightlife.com/HelpCenter
Privacy Policy: https://secnightlife.com/PrivacyPolicy

Please use Build 8 for this review. We are available immediately if you need anything else during the review window.

Thank you,
Sihle Simelane
SEC Nightlife
support@secnightlife.com
```

---

## Founder Mac — Build 8 upload

```bash
cd ~/Developer/sec-nightlife/sec-night-life
git fetch origin
git reset --hard origin/main
npm install
npm run build:mobile
# Confirm API URL baked in:
# grep -o 'api.secnightlife.com' dist/assets/*.js | head
npm run cap:ios
```

In Xcode: Signing OK → Any iOS Device → Product → Clean Build Folder → Archive → Distribute → App Store Connect → Upload.

Then in App Store Connect: select Build **8**, paste Notes above, Reply to App Review, Submit for Review.
