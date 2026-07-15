/**
 * Client-side bucket for host dashboard table lists (mirrors backend eventWallClock rules).
 * Past = after user-set end datetime (or refunded) — not CLOSED alone, not start+24h.
 */

export function isHostedTablePast(table) {
  if (Boolean(table?.isPast)) return true;
  if (table?.hostRefundStatus === 'REFUNDED') return true;

  const now = Date.now();
  if (table?.windowEndsAt) {
    const end = new Date(table.windowEndsAt);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now) return true;
  }

  return false;
}

export function splitHostDashboardTables(tables = []) {
  const upcoming = [];
  const past = [];
  for (const t of tables) {
    if (isHostedTablePast(t)) past.push(t);
    else upcoming.push(t);
  }
  return { upcoming, past };
}
