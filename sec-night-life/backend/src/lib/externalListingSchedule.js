import { parseWindowInstant, formatYmdSast } from './dayBookingWindows.js';

/**
 * Own-place (EXTERNAL_VENUE, no venue slot) end instant.
 * Prefer windowEndsAt, then eventEndDate+eventEndTime, else end of start day 23:59 SAST.
 * Does NOT use start + 24h.
 */
export function externalListingEndsAt(hostedRow) {
  if (!hostedRow) return null;

  if (hostedRow.windowEndsAt) {
    const end =
      hostedRow.windowEndsAt instanceof Date
        ? hostedRow.windowEndsAt
        : new Date(hostedRow.windowEndsAt);
    if (!Number.isNaN(end.getTime())) return end;
  }

  const endDate = hostedRow.eventEndDate || hostedRow.eventDate;
  const endTime = hostedRow.eventEndTime || '23:59';
  if (endDate && endTime) {
    const fromParts = parseWindowInstant(endDate, endTime);
    if (fromParts) return fromParts;
  }

  if (hostedRow.eventDate) {
    return parseWindowInstant(hostedRow.eventDate, '23:59');
  }
  return null;
}

/** Validate and build schedule fields for create/patch of EXTERNAL_VENUE listings. */
export function buildExternalListingSchedule({
  eventDate,
  eventTime,
  eventEndDate,
  eventEndTime,
  now = new Date(),
}) {
  const start = parseWindowInstant(eventDate, eventTime);
  if (!start || Number.isNaN(start.getTime())) {
    return { ok: false, error: 'Start date and time are invalid.' };
  }
  if (start.getTime() <= now.getTime()) {
    return { ok: false, error: 'Start date and time must be in the future.' };
  }

  const endDate = eventEndDate || eventDate;
  const endTime = eventEndTime || '23:59';
  if (!/^\d{2}:\d{2}$/.test(String(endTime))) {
    return { ok: false, error: 'End time must be HH:mm.' };
  }
  const end = parseWindowInstant(endDate, endTime);
  if (!end || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'End date and time are invalid.' };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: 'End must be after the start date and time.' };
  }

  return {
    ok: true,
    eventDate: eventDate instanceof Date ? eventDate : new Date(eventDate),
    eventTime: String(eventTime),
    eventEndDate: endDate instanceof Date ? endDate : new Date(endDate),
    eventEndTime: String(endTime),
    windowEndsAt: end,
    startAt: start,
  };
}

export function formatExternalEndForForm(hostedRow) {
  const end = externalListingEndsAt(hostedRow);
  if (!end) {
    return {
      eventEndDate: hostedRow?.eventDate ? formatYmdSast(hostedRow.eventDate) : '',
      eventEndTime: hostedRow?.eventEndTime || '23:59',
    };
  }
  return {
    eventEndDate: formatYmdSast(end),
    eventEndTime: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Johannesburg',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(end)
      .replace('24:', '00:'),
  };
}
