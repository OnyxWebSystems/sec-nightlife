# Firebase Push Notifications Setup

Native push notifications use **Firebase Cloud Messaging (FCM)** via Capacitor Push Notifications.

Web/PWA does not use Firebase env vars — only native Android/iOS builds.

---

## Project (configured)

- Project ID: `sec-nightlife-55ed4`
- Android package / iOS bundle: `com.secnightlife.app`
- Config files: `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`

---

## Client (native app)

Push registration is in `src/lib/pushNotifications.js` — runs only on Capacitor native platforms.

Called from `src/main.jsx` after app mount:

1. Requests notification permission
2. Registers FCM/APNs token → `POST /api/users/push-token`
3. On logout → `DELETE /api/users/push-token`
4. On notification tap → navigates via `data.path` deep link

---

## Backend delivery

When `FIREBASE_SERVICE_ACCOUNT_JSON` is set on the **backend** Vercel project:

1. Firebase Admin SDK initializes (`backend/src/lib/pushDelivery.js`)
2. Each in-app notification (`createInAppNotification`) also sends FCM to the user's registered tokens

### Get service account JSON

1. Firebase Console → Project Settings → **Service accounts**
2. **Generate new private key** → download JSON
3. In Vercel backend → Environment Variables → add:

   ```
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```

   Paste the **entire JSON on one line** (or use Vercel's multiline secret).

4. Redeploy backend

Without this variable, tokens are stored but push is not sent (in-app notifications still work).

---

## iOS — APNs (requires Apple Developer)

1. Apple Developer → Keys → create **APNs Auth Key**
2. Firebase Console → Project Settings → Cloud Messaging → Apple app → upload APNs key
3. Xcode → Signing & Capabilities → enable **Push Notifications**

---

## Android

1. `google-services.json` at `android/app/google-services.json`
2. Google Services plugin applied in `android/app/build.gradle` after `cap sync`

---

## Test

1. `npm run build:mobile`
2. Run on a **physical device** (simulators are unreliable for push)
3. Accept notification permission
4. Trigger an in-app notification (e.g. friend request) — should receive push if backend env is set
5. Or send test from Firebase Console → Cloud Messaging

---

## Related

- Deep links: `public/.well-known/README.md`
- Founder setup: `docs/FOUNDER_SOFTWARE_SETUP.md`
