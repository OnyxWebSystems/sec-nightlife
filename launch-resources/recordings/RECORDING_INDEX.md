# Screen Recording Index

All recordings captured at **390 × 844** mobile viewport, **dark theme**, from **production** (`https://secnightlife.com`) using real accounts.

**Format:** WebM. Plays in Chrome, Edge, Firefox, and VLC.

To convert to MP4 (optional):

```bash
ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p output.mp4
```

---

## Party-Goer (`party-goer/`)

| File | Description |
|------|-------------|
| `browse-event.webm` | Events list → event details → scroll |
| `host-and-messages.webm` | Host dashboard → Messages |
| `social-features.webm` | Friends → Leaderboard |

## Business Owner (`business-owner/`)

| File | Description |
|------|-------------|
| `manage-venue.webm` | Business dashboard → Events → Bookings |
| `grow-business.webm` | Promotions → Analytics |

---

## Capture workflow

Recordings are captured **after you log in manually** in the browser window opened by:

```bash
cd sec-night-life
npm run marketing:capture
```

1. Log in as **Business Owner** → press Enter → business screenshots + recordings
2. Log out → log in as **Party-Goer** → press Enter → party-goer screenshots + recordings

---

## Notes

- Browser-based captures of the web app (same UI as production).
- Review for sensitive content before sharing with marketing.
