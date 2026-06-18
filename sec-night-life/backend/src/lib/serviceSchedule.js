export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const WEEKDAY_LABELS = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const WEEKDAY_FULL = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const JS_DAY_TO_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function weekdayKeyFromDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return JS_DAY_TO_KEY[d.getDay()] || 'monday';
}

function parseClock(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

/** Normalize API/form payload to sorted unique day entries. */
export function normalizeServiceSchedule(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : input?.days;
  if (!Array.isArray(raw)) return [];
  const byDay = new Map();
  for (const row of raw) {
    const day = String(row?.day || '').toLowerCase();
    if (!WEEKDAY_KEYS.includes(day)) continue;
    const startTime = row.startTime || row.start_time || '19:00';
    const endTime = row.endTime || row.end_time || '23:00';
    byDay.set(day, { day, startTime, endTime });
  }
  return WEEKDAY_KEYS.filter((d) => byDay.has(d)).map((d) => byDay.get(d));
}

export function serviceScheduleFromTable(table) {
  if (!table) return [];
  const sched = table.serviceSchedule ?? table.service_schedule;
  const normalized = normalizeServiceSchedule(sched);
  if (normalized.length) return normalized;
  if (table.startTime || table.endTime) {
    return [{ day: 'monday', startTime: table.startTime || '19:00', endTime: table.endTime || '23:00' }];
  }
  return [];
}

export function isVenueTableOpenOnWeekday(table, weekdayKey) {
  const schedule = serviceScheduleFromTable(table);
  if (!schedule.length) return true;
  return schedule.some((e) => e.day === weekdayKey);
}

export function isVenueTableBookableToday(table, refDate = new Date()) {
  return isVenueTableOpenOnWeekday(table, weekdayKeyFromDate(refDate));
}

export function scheduleEntryForWeekday(table, weekdayKey) {
  const schedule = serviceScheduleFromTable(table);
  return schedule.find((e) => e.day === weekdayKey) || null;
}

function applyClockToDate(baseDate, clock, { endOfDayFallback = false } = {}) {
  const d = new Date(baseDate.getTime());
  const parsed = parseClock(clock);
  if (!parsed) {
    if (endOfDayFallback) d.setUTCHours(23, 59, 59, 999);
    return d;
  }
  d.setUTCHours(parsed.h, parsed.m, 0, 0);
  return d;
}

/** Start instant for a weekday entry on the calendar week containing refDate. */
export function dayStartsAtForScheduleEntry(entry, refDate = new Date()) {
  if (!entry) return null;
  const targetIdx = WEEKDAY_KEYS.indexOf(entry.day);
  if (targetIdx < 0) return null;
  const jsTarget = (targetIdx + 1) % 7;
  const d = new Date(refDate.getTime());
  const currentJs = d.getDay();
  let diff = jsTarget - currentJs;
  if (diff < 0) diff += 7;
  if (diff === 0) {
    const start = applyClockToDate(d, entry.startTime);
    return start;
  }
  d.setDate(d.getDate() + diff);
  return applyClockToDate(d, entry.startTime);
}

/** End instant for a weekday entry (handles end after midnight). */
export function dayEndsAtForScheduleEntry(entry, refDate = new Date()) {
  if (!entry) return null;
  const start = dayStartsAtForScheduleEntry(entry, refDate);
  if (!start) return null;
  const end = applyClockToDate(new Date(start.getTime()), entry.endTime, { endOfDayFallback: true });
  const startClock = parseClock(entry.startTime);
  const endClock = parseClock(entry.endTime);
  if (startClock && endClock) {
    const startMins = startClock.h * 60 + startClock.m;
    const endMins = endClock.h * 60 + endClock.m;
    if (endMins <= startMins) end.setUTCDate(end.getUTCDate() + 1);
  }
  return end;
}

export function dayStartsAtFromVenueTableSchedule(table, refDate = new Date()) {
  const entry = scheduleEntryForWeekday(table, weekdayKeyFromDate(refDate));
  if (entry) return dayStartsAtForScheduleEntry(entry, refDate);
  return null;
}

export function dayEndsAtFromVenueTableSchedule(table, refDate = new Date()) {
  const entry = scheduleEntryForWeekday(table, weekdayKeyFromDate(refDate));
  if (entry) return dayEndsAtForScheduleEntry(entry, refDate);
  return null;
}

export function formatServiceScheduleSummary(schedule) {
  const rows = normalizeServiceSchedule(schedule);
  if (!rows.length) return null;
  const dayPart = rows.map((r) => WEEKDAY_LABELS[r.day] || r.day).join(', ');
  const uniqueWindows = new Set(rows.map((r) => `${r.startTime}–${r.endTime}`));
  if (uniqueWindows.size === 1) {
    const [window] = [...uniqueWindows];
    return `${dayPart} · ${window}`;
  }
  return rows.map((r) => `${WEEKDAY_LABELS[r.day] || r.day} ${r.startTime}–${r.endTime}`).join(' · ');
}
