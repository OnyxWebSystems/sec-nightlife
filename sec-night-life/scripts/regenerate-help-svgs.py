"""Regenerate Help Center SVGs as well-formed XML (escape &, <, >, remove control chars)."""
from pathlib import Path
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

DIAG = Path("public/help/diagrams")
SHOT = Path("public/help/screenshots")
DIAG.mkdir(parents=True, exist_ok=True)
SHOT.mkdir(parents=True, exist_ok=True)


def T(s: str) -> str:
    return escape(s, {'"': "&quot;", "'": "&apos;"})


def write(path: Path, content: str) -> None:
    path.write_text(content.strip() + "\n", encoding="utf-8")


write(
    DIAG / "refund-flow.svg",
    f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" role="img">
  <title>Refund money flow</title>
  <desc>Guest requests refund, venue pays guest share, SEC keeps platform fee</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121214"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#C0C0C0"/>
    </marker>
  </defs>
  <rect width="720" height="420" rx="24" fill="url(#bg)"/>
  <rect x="1" y="1" width="718" height="418" rx="23" fill="none" stroke="#3a3a3e"/>
  <text x="36" y="48" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="18" font-weight="600">{T("Refund money flow")}</text>
  <text x="36" y="74" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="13">{T("Approved refunds - venue pays guest; SEC keeps fee")}</text>
  <rect x="40" y="120" width="180" height="100" rx="16" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="130" y="165" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="15" font-weight="600">{T("Party-Goer")}</text>
  <text x="130" y="190" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Requests refund")}</text>
  <rect x="270" y="120" width="180" height="100" rx="16" fill="#1a1a1d" stroke="#C0C0C0"/>
  <text x="360" y="165" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="15" font-weight="600">{T("Venue")}</text>
  <text x="360" y="190" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Approves and pays 85%")}</text>
  <rect x="500" y="120" width="180" height="100" rx="16" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="590" y="165" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="15" font-weight="600">{T("SEC")}</text>
  <text x="590" y="190" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Keeps ~15% fee")}</text>
  <path d="M220 170 H262" stroke="#C0C0C0" stroke-width="2" marker-end="url(#arrow)"/>
  <path d="M450 155 H492" stroke="#6a6a70" stroke-width="2" stroke-dasharray="4 4"/>
  <path d="M360 220 V280 H130 V220" fill="none" stroke="#C0C0C0" stroke-width="2"/>
  <circle cx="130" cy="220" r="4" fill="#C0C0C0"/>
  <rect x="80" y="300" width="560" height="72" rx="14" fill="#161618" stroke="#333338"/>
  <text x="360" y="332" text-anchor="middle" fill="#e8e8ea" font-family="system-ui,sans-serif" font-size="13" font-weight="600">{T("Guest receives share via Sec Wallet lookup (off-app)")}</text>
  <text x="360" y="354" text-anchor="middle" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="12">{T("QR / tickets invalidated - capacity restored - Paid by venue")}</text>
</svg>
""",
)

write(
    DIAG / "custom-table-flow.svg",
    f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 280" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121214"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
  </defs>
  <rect width="720" height="280" rx="24" fill="url(#bg)"/>
  <rect x="1" y="1" width="718" height="278" rx="23" fill="none" stroke="#3a3a3e"/>
  <text x="36" y="42" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="16" font-weight="600">{T("Custom table lifecycle")}</text>
  <rect x="24" y="80" width="150" height="88" rx="14" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="99" y="118" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="12" font-weight="600">{T("Pending review")}</text>
  <text x="99" y="140" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="11">{T("Guest submits")}</text>
  <text x="186" y="128" fill="#C0C0C0" font-size="18">{T(">")}</text>
  <rect x="210" y="80" width="150" height="88" rx="14" fill="#1a1a1d" stroke="#C0C0C0"/>
  <text x="285" y="118" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="12" font-weight="600">{T("Approved")}</text>
  <text x="285" y="140" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="11">{T("Venue accepts")}</text>
  <text x="372" y="128" fill="#C0C0C0" font-size="18">{T(">")}</text>
  <rect x="396" y="80" width="150" height="88" rx="14" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="471" y="118" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="12" font-weight="600">{T("Pending payment")}</text>
  <text x="471" y="140" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="11">{T("Guest checks out")}</text>
  <text x="558" y="128" fill="#C0C0C0" font-size="18">{T(">")}</text>
  <rect x="580" y="80" width="116" height="88" rx="14" fill="#1a1a1d" stroke="#8f8f96"/>
  <text x="638" y="118" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="12" font-weight="600">{T("Confirmed")}</text>
  <text x="638" y="140" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="11">{T("Host session")}</text>
  <text x="36" y="220" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="12">{T("Declined requests stop at review - guest can revise and resubmit if custom requests stay enabled.")}</text>
  <text x="36" y="244" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="12">{T("Venues may hide a standard empty slot to free the floor for an approved custom booking.")}</text>
</svg>
""",
)

write(
    DIAG / "host-join-flow.svg",
    f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 400" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121214"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
  </defs>
  <rect width="720" height="400" rx="24" fill="url(#bg)"/>
  <rect x="1" y="1" width="718" height="398" rx="23" fill="none" stroke="#3a3a3e"/>
  <text x="36" y="44" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="16" font-weight="600">{T("Host vs join")}</text>
  <text x="36" y="68" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="12">{T("Three paths from a venue table listing")}</text>
  <rect x="40" y="100" width="200" height="240" rx="16" fill="#1a1a1d" stroke="#C0C0C0"/>
  <text x="140" y="140" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="14" font-weight="600">{T("1. Host")}</text>
  <text x="140" y="170" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Slot is free")}</text>
  <text x="140" y="198" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Pay host fee + min spend")}</text>
  <text x="140" y="220" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Creates Hosted Table")}</text>
  <text x="140" y="242" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Group chat + QR")}</text>
  <text x="140" y="280" text-anchor="middle" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="11">{T("You manage invites")}</text>
  <rect x="260" y="100" width="200" height="240" rx="16" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="360" y="140" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="14" font-weight="600">{T("2. Join")}</text>
  <text x="360" y="170" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Public hosted table")}</text>
  <text x="360" y="198" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Join fee + optional menu")}</text>
  <text x="360" y="220" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Private needs host approval")}</text>
  <text x="360" y="242" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Added to group when Going")}</text>
  <text x="360" y="280" text-anchor="middle" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="11">{T("Host gets 85% of join fee")}</text>
  <rect x="480" y="100" width="200" height="240" rx="16" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="580" y="140" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="14" font-weight="600">{T("3. Join host")}</text>
  <text x="580" y="170" text-anchor="middle" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Slot already hosted")}</text>
  <text x="580" y="198" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Redirects to Hosted Table")}</text>
  <text x="580" y="220" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("No second host session")}</text>
  <text x="580" y="242" text-anchor="middle" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="11">{T("Same join rules apply")}</text>
  <text x="580" y="280" text-anchor="middle" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="11">{T("One table, one host")}</text>
</svg>
""",
)

write(
    DIAG / "remove-listings.svg",
    f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 360" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#121214"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
  </defs>
  <rect width="720" height="360" rx="24" fill="url(#bg)"/>
  <rect x="1" y="1" width="718" height="358" rx="23" fill="none" stroke="#3a3a3e"/>
  <text x="36" y="44" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="16" font-weight="600">{T("Remove from listings")}</text>
  <text x="36" y="68" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="12">{T("Soft-hide empty standard slots so guests cannot book them")}</text>
  <rect x="40" y="100" width="300" height="200" rx="16" fill="#1a1a1d" stroke="#C0C0C0"/>
  <text x="190" y="140" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="14" font-weight="600">{T("Owner use")}</text>
  <text x="60" y="175" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="12">{T("Venue needs the table for VIPs,")}</text>
  <text x="60" y="195" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="12">{T("staff, or a private reservation.")}</text>
  <text x="60" y="230" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Hide slot - status Hidden")}</text>
  <text x="60" y="255" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Restore when free again")}</text>
  <rect x="380" y="100" width="300" height="200" rx="16" fill="#1a1a1d" stroke="#4a4a50"/>
  <text x="530" y="140" text-anchor="middle" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="14" font-weight="600">{T("Custom compensation")}</text>
  <text x="400" y="175" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="12">{T("Approved custom table will use")}</text>
  <text x="400" y="195" fill="#b0b0b6" font-family="system-ui,sans-serif" font-size="12">{T("this physical floor space.")}</text>
  <text x="400" y="230" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Hide matching empty slot")}</text>
  <text x="400" y="255" fill="#9a9aa0" font-family="system-ui,sans-serif" font-size="12">{T("Prevents double booking")}</text>
  <text x="36" y="330" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="12">{T("Blocked if: slot is in use, or the listing is the custom-request entry itself.")}</text>
</svg>
""",
)


def phone(title, rows, filename, subtitle="SEC Night Life"):
    y = 150
    parts = []
    for label, detail in rows:
        parts.append(
            f"""
  <rect x="48" y="{y}" width="304" height="64" rx="14" fill="#1a1a1d" stroke="#333338"/>
  <text x="68" y="{y + 28}" fill="#f2f2f2" font-family="system-ui,sans-serif" font-size="14" font-weight="600">{T(label)}</text>
  <text x="68" y="{y + 48}" fill="#8a8a90" font-family="system-ui,sans-serif" font-size="11">{T(detail)}</text>"""
        )
        y += 76
    height = max(520, y + 40)
    write(
        SHOT / filename,
        f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 {height}" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0e0e10"/>
      <stop offset="100%" stop-color="#000"/>
    </linearGradient>
  </defs>
  <rect width="400" height="{height}" rx="28" fill="url(#bg)"/>
  <rect x="1" y="1" width="398" height="{height - 2}" rx="27" fill="none" stroke="#3a3a3e"/>
  <circle cx="200" cy="22" r="4" fill="#2a2a2e"/>
  <text x="32" y="70" fill="#C0C0C0" font-family="system-ui,sans-serif" font-size="11" letter-spacing="2">{T(subtitle.upper())}</text>
  <text x="32" y="102" fill="#f5f5f5" font-family="system-ui,sans-serif" font-size="22" font-weight="700">{T(title)}</text>
  {"".join(parts)}
  <text x="200" y="{height - 24}" text-anchor="middle" fill="#55555a" font-family="system-ui,sans-serif" font-size="10">{T("Illustrative UI - SEC Help")}</text>
</svg>
""",
    )


screens = {
    "profile-tickets.svg": (
        "Tickets",
        [
            ("Friday Night - VIP table", "QR ready - Request refund"),
            ("Neon Room - General ticket", "QR ready - Eligible refund"),
            ("Hosted: Rooftop 4", "Open Host Dashboard"),
        ],
    ),
    "venue-refunds.svg": (
        "Refund requests",
        [
            ("Pending - Table checkout", "Guest: Alex - R1,275 share"),
            ("Approved - Ticket", "Mark paid via wallet lookup"),
            ("Rejected - Outside policy", "Template: no-show"),
        ],
    ),
    "wallet-payout.svg": (
        "Sec Wallet",
        [
            ("Wallet code", "SEC-XXXX - Share for refunds"),
            ("Payout recipient", "Paystack bank - Connected"),
            ("Pending transfers", "Complete when details set"),
        ],
    ),
    "vendors-browse.svg": (
        "Vendors",
        [
            ("Midnight Snacks", "Food and snacks - Published"),
            ("Bassline DJ", "DJ / AV - Published"),
            ("Glow Decor Co", "Decor - Published"),
        ],
    ),
    "vendor-settings.svg": (
        "My vendor businesses",
        [
            ("Create listing", "Name, category, photos"),
            ("Publish", "Appear on Vendors page"),
            ("Edit anytime", "Settings - My vendors"),
        ],
    ),
    "create-job.svg": (
        "Create job",
        [
            ("Job type", "Promoter or Venue staff"),
            ("Spots and description", "Requirements + cover apply"),
            ("Publish", "Visible on Jobs feed"),
        ],
    ),
    "jobs-browse.svg": (
        "Jobs",
        [
            ("Weekend Promoter", "Apply - 50+ char cover"),
            ("Door staff", "My Job Applications"),
            ("Status", "Pending to Shortlisted to Hired"),
        ],
    ),
    "min-spend-checkout.svg": (
        "Checkout",
        [
            ("Minimum spend", "R2,500 required"),
            ("Menu cart", "R1,800 - add R700 more"),
            ("Pay locked", "Unlocks when min met"),
        ],
    ),
    "group-chat.svg": (
        "Messages",
        [
            ("VIP Table - Hosted", "Automatic group - 6 members"),
            ("Host", "You - capacity includes host"),
            ("Joiners", "Added when Going"),
        ],
    ),
    "custom-table-request.svg": (
        "Custom table",
        [
            ("Guests and times", "Preferred start / end"),
            ("Proposed min spend", "Manual or menu total"),
            ("Submit", "Pending venue review"),
        ],
    ),
    "table-details.svg": (
        "Table details",
        [
            ("Host this table", "Fee + minimum spend"),
            ("Join hosted table", "Joining fee from R10"),
            ("Already hosted?", "Opens that Hosted Table"),
        ],
    ),
    "create-event.svg": (
        "Create event",
        [
            ("Format", "Table hosting | Ticketed only"),
            ("Tiers", "Fees, min spend, tickets"),
            ("Publish", "Live on Events / Home"),
        ],
    ),
    "day-bookings.svg": (
        "Bookings",
        [
            ("Event sessions", "SEC hosted tables"),
            ("Day bookings", "Time windows - 30 min steps"),
            ("Venue tables", "Hide / restore slots"),
        ],
    ),
    "promotions.svg": (
        "Promotions",
        [
            ("Publish", "R50 / day - 1 to 30 days"),
            ("Boost promo", "R150 / day sponsored"),
            ("Home feed", "Sponsored placement"),
        ],
    ),
    "feed-boost.svg": (
        "Boost",
        [
            ("Boost days", "R150 / day - max 30"),
            ("Applies to", "Events, tables, listings"),
            ("Not refundable", "Platform product"),
        ],
    ),
    "remove-listings.svg": (
        "Venue tables",
        [
            ("VIP Booth A", "Remove from listings"),
            ("Status", "Hidden - not bookable"),
            ("Restore", "When slot free again"),
        ],
    ),
    "host-dashboard-create.svg": (
        "Host Dashboard",
        [
            ("List as Event", "Own place / non-SEC venue"),
            ("Listing fee", "R200 - draft until paid"),
            ("Optional join fee", "You earn 85% share"),
        ],
    ),
    "host-list-table.svg": (
        "List as Table",
        [
            ("Address required", "Unregistered venue OK"),
            ("End date and time", "Required to publish"),
            ("Pay R200", "Goes live on Tables"),
        ],
    ),
    "payment-success.svg": (
        "Payment success",
        [
            ("Tickets and QR", "Profile - Tickets"),
            ("Hosted table", "Host Dashboard"),
            ("Group chat", "Messages updated"),
        ],
    ),
    "promoter-coc.svg": (
        "Promoter status",
        [
            ("Hired", "Accept Code of Conduct"),
            ("Milestones", "Jobs + ratings"),
            ("Verified", "Admin grants badge"),
        ],
    ),
}

for fn, (title, rows) in screens.items():
    phone(title, rows, fn)

bad = 0
for p in sorted(Path("public/help").rglob("*.svg")):
    try:
        ET.fromstring(p.read_bytes())
        print("OK", p)
    except Exception as e:
        bad += 1
        print("FAIL", p, e)

raise SystemExit(bad)
