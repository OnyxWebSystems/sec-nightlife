# SEC Logo

**sec-logo-founder.png** — Official circular SEC lockup from the founder (source of truth for store icons).

**sec-app-icon-transparent-master.png** — Circle only, transparent outside the ring.

**sec-app-icon-4096.png** — Transparent 4096×4096 (marketing; not for App Store).

**sec-logo.png** — Compact raster used in some UI/email contexts.

App Store / Play icons are generated via:

```bash
cd sec-night-life
npm run icons:generate-app
```

Note: iOS App Store icons must be opaque 1024×1024 (no transparency). The honeycomb/background outside the ring is removed; the App Store file uses a solid black square behind the circle.
