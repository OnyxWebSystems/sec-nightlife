/**
 * Persist last-known ticket verify + "My tickets" payloads so QR flows work
 * after the device has been online at least once (email QR is already inline-CID).
 */

const VERIFY_PREFIX = 'sec_tv_v1_';
const MY_TICKETS_PREFIX = 'sec_my_tickets_v1_';

function safeJsonParse(raw) {
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/** Strip UI-only keys before persisting verify snapshots. */
function scrubVerifyPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { _offline_cached, _offline_no_cache, _verify_refresh_failed, ...rest } = payload;
  return rest;
}

export function saveTicketVerifySnapshot(qrToken, payload) {
  if (!qrToken || !payload || typeof payload !== 'object') return;
  const clean = scrubVerifyPayload(payload);
  if (!clean) return;
  try {
    const toStore = { ...clean, _cached_at: new Date().toISOString() };
    localStorage.setItem(VERIFY_PREFIX + qrToken, JSON.stringify(toStore));
  } catch {
    /* quota / private mode */
  }
}

export function loadTicketVerifySnapshot(qrToken) {
  if (!qrToken) return null;
  try {
    return safeJsonParse(localStorage.getItem(VERIFY_PREFIX + qrToken));
  } catch {
    return null;
  }
}

export function myTicketsCacheKey(userId) {
  return MY_TICKETS_PREFIX + String(userId);
}

/**
 * @param {string} userId
 * @param {{ active?: unknown[]; expired?: unknown[] }} buckets
 */
export function saveMyTicketsSnapshot(userId, buckets) {
  if (!userId || !buckets || typeof buckets !== 'object') return;
  const active = Array.isArray(buckets.active) ? buckets.active : [];
  const expired = Array.isArray(buckets.expired) ? buckets.expired : [];
  try {
    const row = {
      active,
      expired,
      _cached_at: new Date().toISOString(),
    };
    localStorage.setItem(myTicketsCacheKey(userId), JSON.stringify(row));
  } catch {
    /* quota */
  }
}

export function loadMyTicketsSnapshot(userId) {
  if (!userId) return null;
  try {
    const o = safeJsonParse(localStorage.getItem(myTicketsCacheKey(userId)));
    if (!o) return null;
    return {
      active: Array.isArray(o.active) ? o.active : [],
      expired: Array.isArray(o.expired) ? o.expired : [],
      _cached_at: o._cached_at || null,
    };
  } catch {
    return null;
  }
}

export function isLikelyOffline() {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}
