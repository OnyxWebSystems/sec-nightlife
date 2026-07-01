import { prisma } from './prisma.js';
import {
  scheduleEntryForWeekday,
  serviceScheduleFromTable,
  weekdayKeyFromDate,
} from './serviceSchedule.js';

const SAST_OFFSET = '+02:00';
const MIN_WINDOW_MINUTES = 30;

function parseClock(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m, minutes: h * 60 + m };
}

function formatDateYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Start of calendar day in SAST as UTC instant. */
export function startOfTodaySast(now = new Date()) {
  const ymd = formatDateYmd(now);
  return new Date(`${ymd}T00:00:00+02:00`);
}

export function startOfTomorrowSast(now = new Date()) {
  const d = startOfTodaySast(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function isHostedTableForToday(ht, refDate = new Date()) {
  if (!ht?.eventDate) return false;
  const eventYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ht.eventDate instanceof Date ? ht.eventDate : new Date(ht.eventDate));
  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(refDate instanceof Date ? refDate : new Date(refDate));
  return eventYmd === todayYmd;
}

/** Whether a day-booking host session should still block inventory / show as occupied. */
export function isDaySessionStillActive(ht, venueTable, now = new Date()) {
  if (!ht || !['ACTIVE', 'FULL'].includes(ht.status)) return false;
  if (ht.windowEndsAt) {
    const end = ht.windowEndsAt instanceof Date ? ht.windowEndsAt : new Date(ht.windowEndsAt);
    return !Number.isNaN(end.getTime()) && end.getTime() > now.getTime();
  }
  if (!isHostedTableForToday(ht, now)) return false;
  const endsAt = computeLegacyWindowEndsAt(ht, venueTable);
  if (endsAt) return endsAt.getTime() > now.getTime();
  return true;
}

/** Calendar date + HH:mm in SAST (+02:00), matching cron.js eventStartDateTime. */
export function parseWindowInstant(date, hhmm) {
  if (!date || !hhmm) return null;
  const ymd = formatDateYmd(date);
  const clock = /^\d{2}:\d{2}$/.test(String(hhmm)) ? String(hhmm) : null;
  if (!clock) return null;
  const instant = new Date(`${ymd}T${clock}:00${SAST_OFFSET}`);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function windowEndInstant(date, startTime, endTime) {
  const start = parseWindowInstant(date, startTime);
  const end = parseWindowInstant(date, endTime);
  if (!start || !end) return null;
  const startClock = parseClock(startTime);
  const endClock = parseClock(endTime);
  if (startClock && endClock && endClock.minutes <= startClock.minutes) {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return end;
}

export function venueWindowForDate(table, refDate = new Date()) {
  const entry = scheduleEntryForWeekday(table, weekdayKeyFromDate(refDate));
  if (entry) {
    return { startTime: entry.startTime, endTime: entry.endTime };
  }
  const startTime = table?.startTime ?? table?.start_time;
  const endTime = table?.endTime ?? table?.end_time;
  if (startTime && endTime) return { startTime: String(startTime), endTime: String(endTime) };
  return null;
}

export function windowsOverlap(startA, endA, startB, endB) {
  const a0 = parseClock(startA);
  const a1 = parseClock(endA);
  const b0 = parseClock(startB);
  const b1 = parseClock(endB);
  if (!a0 || !a1 || !b0 || !b1) return false;
  return a0.minutes < b1.minutes && b0.minutes < a1.minutes;
}

export function isTimeWithinWindow(time, windowStart, windowEnd) {
  const t = parseClock(time);
  const s = parseClock(windowStart);
  const e = parseClock(windowEnd);
  if (!t || !s || !e) return false;
  if (e.minutes > s.minutes) return t.minutes >= s.minutes && t.minutes <= e.minutes;
  return t.minutes >= s.minutes || t.minutes <= e.minutes;
}

export function validateUserWindow(userStart, userEnd, venueWindow) {
  if (!venueWindow?.startTime || !venueWindow?.endTime) {
    return { ok: false, error: 'No service window configured for this day' };
  }
  const s = parseClock(userStart);
  const e = parseClock(userEnd);
  if (!s || !e) return { ok: false, error: 'Invalid time format' };
  if (e.minutes <= s.minutes) return { ok: false, error: 'End time must be after start time' };
  const duration = e.minutes - s.minutes;
  if (duration < MIN_WINDOW_MINUTES) {
    return { ok: false, error: `Minimum booking duration is ${MIN_WINDOW_MINUTES} minutes` };
  }
  if (!isTimeWithinWindow(userStart, venueWindow.startTime, venueWindow.endTime)) {
    return { ok: false, error: 'Start time must be within the venue service window' };
  }
  if (!isTimeWithinWindow(userEnd, venueWindow.startTime, venueWindow.endTime)) {
    return { ok: false, error: 'End time must be within the venue service window' };
  }
  return { ok: true };
}

export function formatHHmmSast(instant) {
  if (!instant) return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour')?.value;
  const m = parts.find((p) => p.type === 'minute')?.value;
  if (!h || !m) return null;
  return `${h}:${m}`;
}

export function resolveBookingWindowFromPayload(payload, existing, venueTable, bookingDate = new Date()) {
  const specs = existing?.userSpecs && typeof existing.userSpecs === 'object' ? existing.userSpecs : {};
  const windowStart =
    payload?.windowStart ||
    payload?.window_start ||
    existing?.windowStartTime ||
    specs.preferredTime ||
    specs.windowStartTime ||
    null;
  const windowEnd =
    payload?.windowEnd ||
    payload?.window_end ||
    existing?.windowEndTime ||
    specs.preferredEndTime ||
    specs.windowEndTime ||
    null;
  const dateRaw = payload?.bookingDate || existing?.bookingDate || specs.preferredDate || bookingDate;
  const bookingDateResolved = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
  return { bookingDate: bookingDateResolved, windowStart, windowEnd };
}

export function validateDayBookingWindow(table, payload, existing, bookingDate = new Date()) {
  if (!isDayVenueTable(table)) return { ok: true };
  const { windowStart, windowEnd, bookingDate: date } = resolveBookingWindowFromPayload(
    payload,
    existing,
    table,
    bookingDate,
  );
  if (!windowStart || !windowEnd) {
    return { ok: false, error: 'Select a start and end time for your booking' };
  }
  const venueWindow = venueWindowForDate(table, date);
  const check = validateUserWindow(windowStart, windowEnd, venueWindow);
  if (!check.ok) return check;
  return { ok: true, bookingDate: date, windowStart, windowEnd, windowEndsAt: windowEndInstant(date, windowStart, windowEnd) };
}

export function isDayVenueTable(table) {
  if (!table) return false;
  if (table.eventId) return false;
  const key = String(table.hostingTierKey || '');
  return key.startsWith('day:') || table.isCustomListing;
}

export async function getActiveDaySessions(venueTableId, bookingDate = new Date()) {
  const now = new Date();
  const venueTable = await prisma.venueTable.findUnique({ where: { id: venueTableId } });
  const rows = await prisma.hostedTable.findMany({
    where: {
      status: { in: ['ACTIVE', 'FULL'] },
      OR: [{ venueTableId }, ...(venueTable?.hostedTableId ? [{ id: venueTable.hostedTableId }] : [])],
    },
    include: {
      host: {
        select: {
          id: true,
          username: true,
          fullName: true,
          userProfile: { select: { username: true, avatarUrl: true } },
        },
      },
      members: {
        where: { status: 'GOING' },
        select: { id: true },
      },
    },
    orderBy: { eventTime: 'asc' },
  });
  const seen = new Set();
  return rows.filter((ht) => {
    if (seen.has(ht.id)) return false;
    seen.add(ht.id);
    return isDaySessionStillActive(ht, venueTable, now);
  });
}

function sessionWindowFromHosted(ht, venueTable, bookingDate) {
  const startTime = ht.eventTime ? String(ht.eventTime) : null;
  let endTime = null;
  if (ht.windowEndsAt) {
    endTime = formatHHmmSast(ht.windowEndsAt);
  } else if (venueTable) {
    const vw = venueWindowForDate(venueTable, bookingDate);
    endTime = vw?.endTime || null;
  }
  return { startTime, endTime };
}

export async function canHostInWindow(venueTableId, bookingDate, userStart, userEnd, { excludeHostedTableId = null } = {}) {
  const sessions = await getActiveDaySessions(venueTableId, bookingDate);
  const venueTable = await prisma.venueTable.findUnique({ where: { id: venueTableId } });
  for (const ht of sessions) {
    if (excludeHostedTableId && ht.id === excludeHostedTableId) continue;
    const { startTime, endTime } = sessionWindowFromHosted(ht, venueTable, bookingDate);
    if (startTime && endTime && windowsOverlap(userStart, userEnd, startTime, endTime)) {
      return { ok: false, error: 'This table is already hosted during the selected time' };
    }
  }
  return { ok: true };
}

export function buildHostedTablePayload(ht, { goingCount = null, requestedGuestCount = null } = {}) {
  const going =
    goingCount != null
      ? Math.max(0, Number(goingCount) || 0)
      : Math.max(0, Number(ht.guestQuantity) - Number(ht.spotsRemaining));
  const capacity =
    requestedGuestCount != null && requestedGuestCount >= 1
      ? Math.round(requestedGuestCount)
      : Math.max(1, Number(ht.guestQuantity) || 1);
  const spotsRemaining = Math.max(0, capacity - going);

  return {
    id: ht.id,
    tableName: ht.tableName,
    isPublic: ht.isPublic,
    hasJoiningFee: ht.hasJoiningFee,
    joiningFee: ht.joiningFee,
    guestCapacity: capacity,
    spotsRemaining,
    windowStartTime: ht.eventTime ? String(ht.eventTime) : null,
    windowEndTime: ht.windowEndsAt
      ? formatHHmmSast(ht.windowEndsAt)
      : null,
    isCustomTable: Boolean(requestedGuestCount),
    host: {
      id: ht.host?.id,
      username: ht.host?.userProfile?.username || ht.host?.username,
      fullName: ht.host?.fullName,
      avatarUrl: ht.host?.userProfile?.avatarUrl || null,
    },
  };
}

export async function buildOccupancyForSlot(venueTable, bookingDate = new Date()) {
  const sessions = await getActiveDaySessions(venueTable.id, bookingDate);
  const occupancy = [];
  for (const ht of sessions) {
    const { startTime, endTime } = sessionWindowFromHosted(ht, venueTable, bookingDate);
    if (!startTime || !endTime) continue;
    const goingCount = ht.members?.length ?? Math.max(0, ht.guestQuantity - ht.spotsRemaining);
    occupancy.push({
      startTime,
      endTime,
      hostedTableId: ht.id,
      hostedTable: buildHostedTablePayload(ht, { goingCount }),
      spotsRemaining: ht.spotsRemaining,
    });
  }
  return occupancy;
}

export function computeLegacyWindowEndsAt(hostedTable, venueTable) {
  if (hostedTable?.windowEndsAt) {
    const d = hostedTable.windowEndsAt instanceof Date ? hostedTable.windowEndsAt : new Date(hostedTable.windowEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!venueTable) return null;
  const bookingDate = hostedTable?.eventDate || new Date();
  const vw = venueWindowForDate(venueTable, bookingDate);
  if (!vw) return null;
  return windowEndInstant(bookingDate, vw.startTime, vw.endTime);
}

export function resolveBookingWindowFromMember(member, venueTable, bookingDate = new Date()) {
  const specs = member?.userSpecs && typeof member.userSpecs === 'object' ? member.userSpecs : {};
  const startTime =
    member?.windowStartTime ||
    specs.preferredTime ||
    specs.windowStartTime ||
    venueWindowForDate(venueTable, bookingDate)?.startTime;
  const endTime =
    member?.windowEndTime ||
    specs.preferredEndTime ||
    specs.windowEndTime ||
    venueWindowForDate(venueTable, bookingDate)?.endTime;
  const date = member?.bookingDate || specs.preferredDate || bookingDate;
  return { bookingDate: date, windowStartTime: startTime, windowEndTime: endTime };
}

export function venueWindowFromTables(venueTables, refDate = new Date()) {
  for (const t of venueTables) {
    const w = venueWindowForDate(t, refDate);
    if (w) return w;
  }
  return null;
}

export { serviceScheduleFromTable, MIN_WINDOW_MINUTES };
