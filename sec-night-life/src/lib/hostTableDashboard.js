/**
 * Client-side bucket for host dashboard table lists (mirrors backend eventWallClock rules).
 */
export function isHostedTablePast(table) {
  return Boolean(table?.isPast);
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
