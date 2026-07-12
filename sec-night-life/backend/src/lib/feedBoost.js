/** Shared feed-boost pricing (aligned with Business Promotions). */
export const FEED_BOOST_ZAR_PER_DAY = 150;
export const FEED_BOOST_MAX_DAYS = 30;
export const FEED_BOOST_MS_DAY = 24 * 60 * 60 * 1000;

export function isBoostActiveRow(row, now = new Date()) {
  if (!row?.boosted) return false;
  if (!row.boostExpiresAt) return true;
  const exp = row.boostExpiresAt instanceof Date ? row.boostExpiresAt : new Date(row.boostExpiresAt);
  return exp > now;
}

/** Whole days remaining until `endAt` (inclusive of partial day), capped 1–30. Returns 0 if already ended. */
export function maxBoostDaysUntil(endAt, now = new Date()) {
  if (!endAt) return FEED_BOOST_MAX_DAYS;
  const end = endAt instanceof Date ? endAt : new Date(endAt);
  if (Number.isNaN(end.getTime())) return FEED_BOOST_MAX_DAYS;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.min(FEED_BOOST_MAX_DAYS, Math.max(1, Math.ceil(ms / FEED_BOOST_MS_DAY)));
}

export function clampBoostDays(days, maxDays = FEED_BOOST_MAX_DAYS) {
  const n = parseInt(String(days), 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(Math.max(1, n), Math.max(1, maxDays), FEED_BOOST_MAX_DAYS);
}
