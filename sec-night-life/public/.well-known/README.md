# Deep link configuration

Replace placeholders after store accounts are ready:

## Android — `assetlinks.json`

1. Create a **release keystore** (see `docs/FOUNDER_SOFTWARE_SETUP.md`).
2. Run:
   ```bash
   keytool -list -v -keystore your-release-key.keystore -alias your-alias
   ```
3. Copy the **SHA-256** fingerprint (colon-separated) into `sha256_cert_fingerprints` in `assetlinks.json`.
4. Redeploy the **frontend** Vercel project.

## iOS — `apple-app-site-association`

1. Register **Apple Developer** ($99/year) and copy your **Team ID** from Membership.
2. Replace `FOUNDER_APPLE_TEAM_ID` in `apple-app-site-association` with your Team ID.
   - Format: `"appID": "TEAMID.com.secnightlife.app"`
3. Redeploy the **frontend** Vercel project.
4. In Xcode → Signing & Capabilities, confirm **Associated Domains** includes `applinks:secnightlife.com` (see `ios/App/App/App.entitlements`).

Verify after deploy:

```bash
curl -sI https://secnightlife.com/.well-known/apple-app-site-association
curl -s https://secnightlife.com/.well-known/assetlinks.json
```
