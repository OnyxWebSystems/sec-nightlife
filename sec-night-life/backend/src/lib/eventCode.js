/** Date-based door code: PREFIX-MMDD-SUFFIX (e.g. VV-0619-A). */
export const EVENT_CODE_REGEX = /^[A-Z]{2,4}-\d{4}-[A-Z0-9]{1,4}$/;

export function normalizeEventCodeInput(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  return s || null;
}

export function validateEventCodeFormat(code) {
  if (!code) return { ok: true, code: null };
  if (!EVENT_CODE_REGEX.test(code)) {
    return {
      ok: false,
      error: 'Event code must match PREFIX-MMDD-SUFFIX (e.g. VV-0619-A).',
    };
  }
  return { ok: true, code };
}

export async function assertEventCodeUniqueForVenue(prisma, { venueId, eventCode, excludeEventId = null }) {
  if (!eventCode) return { ok: true };
  const existing = await prisma.event.findFirst({
    where: {
      venueId,
      eventCode,
      deletedAt: null,
      ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    },
    select: { id: true, title: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `Event code "${eventCode}" is already used by "${existing.title}".`,
    };
  }
  return { ok: true };
}

/** Suggest PREFIX-MMDD-SUFFIX from venue name and ISO date (YYYY-MM-DD). */
export function suggestEventCode({ venueName, dateIso, existingCodes = [] }) {
  const words = String(venueName || 'SEC')
    .split(/[\s&]+/)
    .filter(Boolean);
  let prefix = words
    .map((w) => w.replace(/[^a-zA-Z]/g, '').charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 4);
  if (prefix.length < 2) prefix = (prefix + 'SEC').slice(0, 2);

  const d = dateIso ? new Date(`${dateIso}T00:00:00`) : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mmdd = `${mm}${dd}`;

  const taken = new Set((existingCodes || []).map((c) => String(c).toUpperCase()));
  const suffixes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const suffix of suffixes) {
    const code = `${prefix}-${mmdd}-${suffix}`;
    if (!taken.has(code)) return code;
  }
  return `${prefix}-${mmdd}-Z`;
}
