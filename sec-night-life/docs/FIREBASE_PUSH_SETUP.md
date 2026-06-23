# Firebase Push Notifications Setup

Native push notifications use **Firebase Cloud Messaging (FCM)** via Capacitor Push Notifications.

Web/PWA does not use Firebase env vars — only native Android/iOS builds.

---

## Project (configured)

- Project ID: `sec-nightlife-55ed4`
- Android package / iOS bundle: `com.secnightlife.app`
- Config files: `android/app/google-services.json`, `ios/App/App/GoogleService-Info.plist`

---

## 2. Android app

1. **Add app** → Android
2. Package name: `com.secnightlife.app`
3. Download **`google-services.json`**
4. Place file at:

   ```
   sec-night-life/android/app/google-services.json
   ```

5. Follow Firebase console steps to add Google Services plugin (Capacitor Android template may already support this after `cap sync`)

---

## 3. iOS app

1. **Add app** → iOS
2. Bundle ID: `com.secnightlife.app`
3. Download **`GoogleService-Info.plist`**
4. Add to Xcode project: drag into `ios/App/App/` and ensure target membership is checked

5. Apple Push requires:
   - Apple Developer account
   - Push Notifications capability in Xcode
   - APNs key uploaded to Firebase (Project Settings → Cloud Messaging → Apple app configuration)

---

## 4. App code

Push registration is in `src/lib/pushNotifications.js` — runs only on native platforms (Capacitor).

Called from `src/main.jsx` after app mount. Token is logged to console until backend endpoint is wired.

**Future:** Send FCM token to `POST /api/users/push-token` (not yet implemented).

---

## 5. Test

1. `npm run build:mobile`
2. Run on physical device (push does not work reliably on simulators)
3. Accept notification permission prompt
4. Send test message from Firebase Console → Cloud Messaging

---

## Placeholder files

If Firebase is not configured yet:

- `android/app/google-services.json.example` — copy and rename when founder provides real file
- `ios/App/App/GoogleService-Info.plist.example` — same for iOS

Do not commit real Firebase config with production keys to public repos if policy requires — use founder's private repo or secure storage.
