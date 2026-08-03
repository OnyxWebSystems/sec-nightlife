# SEC Logo

**sec-logo.png** — Compact raster lockup used in UI/email.

**sec-app-icon.svg** — Vector circular app icon (source of truth for store icons).

**sec-app-icon-4096.png** — Transparent 4096×4096 render (marketing; not for App Store).

App Store / Play icons are generated via:

```bash
cd sec-night-life
npm run icons:generate-app
```

Note: iOS App Store icons must be opaque 1024×1024 (no transparency).
