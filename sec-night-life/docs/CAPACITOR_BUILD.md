# Capacitor — Native Build Guide

SEC Nightlife uses **Capacitor** to wrap the Vite React app for Android and iOS store submission.

- **App ID:** `com.secnightlife.app`
- **App name:** SEC Nightlife

---

## Prerequisites

- Node.js 18+
- **Android:** Android Studio, JDK 17+
- **iOS:** macOS, Xcode, Apple Developer account ($99/year)

---

## Build commands

```bash
cd sec-night-life
npm install
npm run build:mobile    # vite build + cap sync
npm run cap:android     # open Android Studio
npm run cap:ios         # open Xcode
```

After web code changes, always run `npm run build:mobile` before testing native.

---

## Android release build

1. Open project: `npm run cap:android`
2. **Build → Generate Signed Bundle / APK** → Android App Bundle (AAB) for Play Store
3. Create or use a **release keystore** — store password safely (founder owns this)
4. Set `versionCode` and `versionName` in `android/app/build.gradle`

### Get SHA-256 for App Links

After creating the release keystore:

```bash
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

Copy the **SHA-256** fingerprint (colon-separated format) into:

`public/.well-known/assetlinks.json` → replace `FOUNDER_ANDROID_SHA256_FINGERPRINT`

Redeploy frontend so the updated file is live at:

`https://app.YOUR_DOMAIN/.well-known/assetlinks.json`

---

## iOS release build

1. Open project: `npm run cap:ios`
2. Select signing team (founder's Apple Developer account)
3. Set **Bundle Identifier:** `com.secnightlife.app`
4. **Product → Archive** → Distribute to App Store Connect

### Apple Team ID for Universal Links

1. [developer.apple.com](https://developer.apple.com) → Membership → copy **Team ID**
2. Update `public/.well-known/apple-app-site-association`:

   `"appID": "YOUR_TEAM_ID.com.secnightlife.app"`

3. In Xcode → Signing & Capabilities → add **Associated Domains**:

   `applinks:app.YOUR_DOMAIN`

4. Redeploy frontend; verify AASA URL returns JSON without `.json` extension.

---

## Splash screen and status bar

Configured in `capacitor.config.ts`:

- Background: `#000000`
- Status bar: dark style (light icons on black)

Replace splash assets in:

- `android/app/src/main/res/` (drawable folders)
- `ios/App/App/Assets.xcassets/Splash.imageset/`

Use SEC mark from `marketing-kit/brand/logos/sec-mark.svg` at 2732×2732 for iOS splash.

---

## Production vs development

- **Production:** App loads bundled files from `dist/` (offline-capable shell, API calls over network)
- **Development:** Optional `server.url` in `capacitor.config.ts` can point to `http://YOUR_LAN_IP:5173` for live reload — do not ship with this enabled

---

## Store assets still needed (separate task)

- 1024×1024 App Store icon
- Play Store feature graphic + screenshots
- Privacy policy URL on live domain
- Support email URL

See [FOUNDER_LAUNCH_HANDOFF.md](./FOUNDER_LAUNCH_HANDOFF.md).
