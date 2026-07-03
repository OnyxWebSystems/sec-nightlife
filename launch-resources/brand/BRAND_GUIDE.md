# SEC Brand Guide

## Brand identity

**SEC** is positioned as a **premium luxury nightlife** platform. Visual identity is **black + metallic silver**, inspired by high-end club aesthetics.

**Product name variants:**
- **SEC** — primary app name
- **SEC Nightlife** — email and formal communications
- **Sec** — casual in-app copy

**Primary tagline:** Your Night. Simplified.

---

## Logo files

Located in [`logos/`](logos/):

| File | Description |
|------|-------------|
| `sec-logo.svg` | Horizontal lockup: SEC wordmark + "YOUR NIGHT. SIMPLIFIED." |
| `sec-mark.svg` | Icon mark (S-curve + dot) — favicons, app icons, compact spaces |
| `sec-logo.png` | Raster full logo with silver circle treatment |
| `sec-email-logo.png` | Circular logo for email headers |
| `sec-email-logo-transparent.png` | Circular logo, transparent background |

### Logo usage

- Prefer **dark backgrounds** (`#000000` or near-black). The brand is designed for dark mode.
- Maintain clear space around the logo equal to the height of the "SEC" wordmark.
- Do not stretch, rotate, or recolor the logo outside the approved palette.
- The metallic silver gradient on primary buttons mirrors the logo chrome — use for CTAs, not for logo fills.

---

## Color palette

### Core (dark theme — default)

| Name | Hex | CSS token | Usage |
|------|-----|-----------|-------|
| Base black | `#000000` | `--sec-bg-base` | App background |
| Elevated black | `#0A0A0A` | `--sec-bg-elevated` | Raised surfaces |
| Card black | `#0F0F0F` | `--sec-bg-card` | Cards, panels |
| Metallic silver | `#C0C0C0` | `--sec-accent` | Accent, logo chrome |
| Silver bright | `#D4D4D4` | `--sec-accent-bright` | Hover highlights |
| Text primary | `#F5F5F5` | `--sec-text-primary` | Headlines, body |
| Text secondary | `#B8B8B8` | `--sec-text-secondary` | Supporting text |
| Text muted | `#6B6B6B` | `--sec-text-muted` | Labels, captions |
| Border | `#1F1F1F` | `--sec-border` | Dividers, card edges |

### Metallic gradient (primary buttons)

```css
linear-gradient(135deg, #A8A8A8 0%, #D8D8D8 40%, #A0A0A0 70%, #C8C8C8 100%)
```

### Secondary accents

| Name | Hex | Usage |
|------|-----|-------|
| Gold (logo dot) | `#C9A962` | Logo mark accent in SVG |
| Gold (premium CTA) | `#B8963E` | Premium / gold button variant |
| Success | `#3DBA6B` | Confirmations, verified states |
| Warning | `#D4A017` | Alerts |
| Error | `#D95555` | Errors |
| Info | `#5A9FD4` | Informational |

### Light theme

A light theme exists for user preference but **marketing should default to dark** — it matches the logo and brand positioning.

---

## Typography

**Primary font:** [Inter](https://fonts.google.com/specimen/Inter)

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

| Weight | Use |
|--------|-----|
| 300 | Light supporting text (rare) |
| 400 | Body copy |
| 500 | Medium labels |
| 600 | Headings, buttons |
| 700 | Display, hero titles |

**Fallback stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

**Base size:** 15px · **Line height:** 1.6 (body), 1.25 (headings)

**Heading style:** `font-weight: 600`, `letter-spacing: -0.02em`

**Tagline / label style:** `font-size: 11–12px`, `letter-spacing: 0.12–0.14em`, `text-transform: uppercase`

---

## UI patterns

- **Border radius:** 6–16px for cards; pill (`9999px`) for badges and chips
- **Cards:** Dark fill (`#0F0F0F`) with subtle border (`#1F1F1F`)
- **Primary CTA:** Silver metallic gradient button, dark text (`#0B0B0F`)
- **Navigation:** Bottom tab bar on mobile; mode switcher between Party Goer and Business

---

## Source of truth

Design tokens live in the app at `sec-night-life/src/styles/design-system.css`.
