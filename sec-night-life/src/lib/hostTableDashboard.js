/**
 * Client-side bucket for host dashboard table lists (mirrors backend eventWallClock rules).
 */

function formatYmdSast(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date instanceof Date ? date : new Date(date));
}

export function isHostedTablePast(table) {
  if (Boolean(table?.isPast)) return true;

  const now = Date.now();
  if (table?.windowEndsAt) {
    const end = new Date(table.windowEndsAt);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now) return true;
  }

  if (table?.status === 'CLOSED' && table?.eventDate) {
    const todayYmd = formatYmdSast(new Date());
    const eventYmd = formatYmdSast(table.eventDate);
    if (eventYmd < todayYmd) return true;
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
