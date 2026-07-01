/**
 * Wall-clock event start for validation and host-dashboard visibility.
 * Uses the same UTC convention as {@link eventStartsAtFromEvent} / {@link eventStartsAtFromHostedTable} in ticketHelpers.
 */
import { eventStartsAtFromEvent, eventStartsAtFromHostedTable, eventEndsAtFromEvent } from './ticketHelpers.js';

const MS_24H = 24 * 60 * 60 * 1000;

/** SEC in-app event row → start instant (null if unusable). */
export function inAppEventStartUtc(ev) {
  if (!ev?.date) return null;
  return eventStartsAtFromEvent(ev);
}

/** External meet-up payload → start instant. */
export function externalMeetupStartUtc(eventDate, eventTime) {
  if (!eventDate) return null;
  return eventStartsAtFromHostedTable({ eventDate, eventTime });
}

export function isInAppEventInFuture(ev, now = new Date()) {
  const s = inAppEventStartUtc(ev);
  if (!s || Number.isNaN(s.getTime())) return false;
  return s.getTime() > now.getTime();
}

export function isExternalMeetupInFuture(eventDate, eventTime, now = new Date()) {
  const s = externalMeetupStartUtc(eventDate, eventTime);
  if (!s || Number.isNaN(s.getTime())) return false;
  return s.getTime() > now.getTime();
}

/** When this hosted table should drop off the host's "My tables" list (event end, or legacy start + 24h). */
export function hostDashboardHideAfterUtc(hostedRow, eventRow) {
  if (hostedRow?.windowEndsAt) {
    const end = hostedRow.windowEndsAt instanceof Date ? hostedRow.windowEndsAt : new Date(hostedRow.windowEndsAt);
    if (!Number.isNaN(end.getTime())) return end;
  }
  if (hostedRow?.tableType === 'IN_APP_EVENT' && eventRow) {
    const end = eventEndsAtFromEvent(eventRow);
    if (end && !Number.isNaN(end.getTime())) return end;
  }
  const start =
    hostedRow?.tableType === 'IN_APP_EVENT' && eventRow
      ? eventStartsAtFromEvent(eventRow)
      : eventStartsAtFromHostedTable(hostedRow);
  if (!start || Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + MS_24H);
}

export function shouldShowHostedTableOnHostDashboard(hostedRow, eventRow, now = new Date()) {
  const hideAfter = hostDashboardHideAfterUtc(hostedRow, eventRow);
  if (!hideAfter) return true;
  return now.getTime() < hideAfter.getTime();
}
