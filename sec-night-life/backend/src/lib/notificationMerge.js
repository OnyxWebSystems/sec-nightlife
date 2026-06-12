/** Max gap between legacy + in-app rows that describe the same alert */
const DEDUPE_WINDOW_MS = 3 * 60 * 1000;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textsOverlap(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const probeLen = Math.min(left.length, right.length, 28);
  if (probeLen < 10) return false;
  const probe = left.slice(0, probeLen);
  return right.includes(probe) || left.includes(right.slice(0, probeLen));
}

function createdMs(row) {
  return new Date(row.createdAt).getTime();
}

/**
 * Legacy notifications table duplicates many in-app rows (payment + activity pairs).
 * Prefer the in-app row — it carries referenceId/referenceType for deep links.
 */
export function isLegacyDuplicateOfInApp(legacy, inApp) {
  if (!legacy || !inApp) return false;
  const delta = Math.abs(createdMs(legacy) - createdMs(inApp));
  if (delta > DEDUPE_WINDOW_MS) return false;

  if (legacy.title === inApp.title && (legacy.body || '') === (inApp.body || '')) {
    return true;
  }
  if (textsOverlap(legacy.title, inApp.title) && textsOverlap(legacy.body, inApp.body)) {
    return true;
  }

  if (legacy.type === 'payment' && inApp.referenceType === 'TICKET') {
    return true;
  }

  const pairedInAppTypes = new Set([
    'EVENT_JOINED',
    'TABLE_JOINED',
    'JOIN_REQUEST_ACCEPTED',
    'FRIEND_REQUEST',
    'FRIEND_ACCEPTED',
  ]);
  if (legacy.type === 'payment' && pairedInAppTypes.has(inApp.type)) {
    if (textsOverlap(legacy.body, inApp.body) || textsOverlap(legacy.title, inApp.title)) {
      return true;
    }
    return delta <= 10_000;
  }

  if (legacy.type === 'friend_request' && inApp.type === 'FRIEND_REQUEST') {
    return true;
  }
  if (
    legacy.type === 'friend_request' &&
    inApp.type === 'FRIEND_ACCEPTED' &&
    textsOverlap(legacy.body, inApp.body)
  ) {
    return true;
  }

  return false;
}

export function filterDuplicateLegacyRows(legacyRows, inAppRows) {
  if (!legacyRows.length || !inAppRows.length) return legacyRows;
  return legacyRows.filter(
    (legacy) => !inAppRows.some((inApp) => isLegacyDuplicateOfInApp(legacy, inApp)),
  );
}

export function dedupeInAppRows(inAppRows) {
  if (inAppRows.length < 2) return inAppRows;
  const kept = [];
  for (const row of inAppRows) {
    const duplicate = kept.some((existing) => {
      const delta = Math.abs(createdMs(existing) - createdMs(row));
      if (delta > DEDUPE_WINDOW_MS) return false;
      if (existing.title === row.title) return true;
      if (existing.type === row.type && textsOverlap(existing.title, row.title)) return true;
      return textsOverlap(existing.title, row.title) && textsOverlap(existing.body, row.body);
    });
    if (!duplicate) kept.push(row);
  }
  return kept;
}

export function mergeNotificationRows(inAppRows, legacyRows) {
  const uniqueInApp = dedupeInAppRows(inAppRows);
  const filteredLegacy = filterDuplicateLegacyRows(legacyRows, uniqueInApp);
  return [...uniqueInApp, ...filteredLegacy].sort(
    (a, b) => createdMs(b) - createdMs(a),
  );
}
