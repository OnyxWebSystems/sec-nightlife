export const MIN_WINDOW_MINUTES = 30;
export const END_BUFFER_MINUTES = 60;
export const SLOT_STEP_MINUTES = 30;

function parseClock(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m, minutes: h * 60 + m };
}

function minutesToHHmm(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isOvernightWindow(startTime, endTime) {
  const s = parseClock(startTime);
  const e = parseClock(endTime);
  if (!s || !e) return false;
  return e.minutes <= s.minutes;
}

export function toServiceMinutes(time, venueWindow) {
  const t = parseClock(time);
  const vs = parseClock(venueWindow?.startTime);
  if (!t || !vs) return null;
  let m = t.minutes;
  if (isOvernightWindow(venueWindow.startTime, venueWindow.endTime) && m < vs.minutes) {
    m += 1440;
  }
  return m;
}

export function serviceInterval(startTime, endTime, venueWindow) {
  const s = toServiceMinutes(startTime, venueWindow);
  let e = toServiceMinutes(endTime, venueWindow);
  if (s == null || e == null) return null;
  if (e <= s) e += 1440;
  return [s, e];
}

export function latestBookableEndTime(venueWindow, bufferMinutes = END_BUFFER_MINUTES) {
  if (!venueWindow?.endTime) return null;
  const e = parseClock(venueWindow.endTime);
  if (!e) return null;
  let mins = e.minutes - bufferMinutes;
  if (mins < 0) mins += 1440;
  return minutesToHHmm(mins);
}

export function bookingDurationMinutes(startTime, endTime, venueWindow) {
  const interval = serviceInterval(startTime, endTime, venueWindow);
  if (!interval) return null;
  return interval[1] - interval[0];
}

export function buildAvailableGaps(
  venueWindow,
  occupancy = [],
  { minMinutes = MIN_WINDOW_MINUTES, endBufferMinutes = END_BUFFER_MINUTES } = {},
) {
  if (!venueWindow?.startTime || !venueWindow?.endTime) return [];

  const bookableStart = toServiceMinutes(venueWindow.startTime, venueWindow);
  const venueEnd = toServiceMinutes(venueWindow.endTime, venueWindow);
  if (bookableStart == null || venueEnd == null) return [];

  const bookableEnd = venueEnd - endBufferMinutes;
  if (bookableEnd <= bookableStart) return [];

  const blocks = occupancy
    .map((o) => serviceInterval(o.startTime, o.endTime, venueWindow))
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of blocks) {
    const clampedStart = Math.max(s, bookableStart);
    const clampedEnd = Math.min(e, bookableEnd);
    if (clampedEnd <= clampedStart) continue;
    const last = merged[merged.length - 1];
    if (last && clampedStart <= last[1]) {
      last[1] = Math.max(last[1], clampedEnd);
    } else {
      merged.push([clampedStart, clampedEnd]);
    }
  }

  const gaps = [];
  let cursor = bookableStart;
  for (const [s, e] of merged) {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < bookableEnd) gaps.push([cursor, bookableEnd]);

  return gaps
    .filter(([s, e]) => e - s >= minMinutes)
    .map(([s, e]) => ({
      startTime: minutesToHHmm(s),
      endTime: minutesToHHmm(e),
    }));
}

export function formatWindowLabel(startTime, endTime, isOvernight) {
  if (!startTime || !endTime) return '';
  const overnightSuffix = isOvernight && parseClock(endTime)?.minutes <= parseClock(startTime)?.minutes
    ? ' (+1)'
    : '';
  return `${startTime}–${endTime}${overnightSuffix}`;
}

export function formatDurationLabel(startTime, endTime, venueWindow) {
  const mins = bookingDurationMinutes(startTime, endTime, venueWindow);
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function listTimeOptionsInGap(gap, stepMinutes = SLOT_STEP_MINUTES) {
  if (!gap?.startTime || !gap?.endTime) return [];
  const start = parseClock(gap.startTime)?.minutes;
  const end = parseClock(gap.endTime)?.minutes;
  if (start == null || end == null) return [];
  let t0 = start;
  let t1 = end;
  if (t1 <= t0) t1 += 1440;
  const options = [];
  for (let m = t0; m <= t1; m += stepMinutes) {
    options.push(minutesToHHmm(m));
  }
  return options;
}

export function findGapContainingWindow(gaps, startTime, endTime, venueWindow) {
  const interval = serviceInterval(startTime, endTime, venueWindow);
  if (!interval) return null;
  for (const gap of gaps) {
    const g = serviceInterval(gap.startTime, gap.endTime, venueWindow);
    if (!g) continue;
    if (interval[0] >= g[0] && interval[1] <= g[1]) return gap;
  }
  return null;
}

export function defaultWindowFromGaps(gaps, venueWindow, { defaultDurationMinutes = 120 } = {}) {
  if (!gaps?.length || !venueWindow) return null;
  const gap = gaps[0];
  const g = serviceInterval(gap.startTime, gap.endTime, venueWindow);
  if (!g) return null;
  const startTime = gap.startTime;
  const endM = Math.min(g[0] + defaultDurationMinutes, g[1]);
  if (endM - g[0] < MIN_WINDOW_MINUTES) {
    if (g[1] - g[0] < MIN_WINDOW_MINUTES) return null;
    return { startTime, endTime: minutesToHHmm(g[1]) };
  }
  return { startTime, endTime: minutesToHHmm(endM) };
}

export function validateBookingWindow(value, venueWindow, occupancy = [], { mode = 'host' } = {}) {
  if (!venueWindow?.startTime || !venueWindow?.endTime) {
    return 'No service window configured for today';
  }
  const { startTime, endTime } = value || {};
  if (!startTime || !endTime) return 'Select a start and end time';

  const duration = bookingDurationMinutes(startTime, endTime, venueWindow);
  if (duration == null || duration < MIN_WINDOW_MINUTES) {
    return `Minimum booking is ${MIN_WINDOW_MINUTES} minutes`;
  }

  const latestEnd = latestBookableEndTime(venueWindow);
  const userEndM = toServiceMinutes(endTime, venueWindow);
  const latestEndM = toServiceMinutes(latestEnd, venueWindow);
  if (userEndM != null && latestEndM != null && userEndM > latestEndM) {
    return `Bookings must end by ${latestEnd} (1 hour before service ends)`;
  }

  const gaps = buildAvailableGaps(venueWindow, mode === 'host' ? occupancy : occupancy);
  const inGap = findGapContainingWindow(gaps, startTime, endTime, venueWindow);
  if (!inGap) {
    return mode === 'host'
      ? 'This time overlaps a booking on this table'
      : 'Choose a time that does not overlap an active host session';
  }

  return null;
}

export function isWindowValid(venueWindow, value, occupancy = [], options = {}) {
  return !validateBookingWindow(value, venueWindow, occupancy, options);
}

/** Timeline segments for visual rail: booked, available, selected */
export function buildTimelineSegments(venueWindow, occupancy, selectedWindow, latestEnd) {
  if (!venueWindow) return { segments: [], ticks: [] };

  const bookableStart = toServiceMinutes(venueWindow.startTime, venueWindow);
  const bookableEnd = toServiceMinutes(latestEnd || latestBookableEndTime(venueWindow), venueWindow);
  const total = bookableEnd - bookableStart;
  if (total <= 0) return { segments: [], ticks: [] };

  const toPct = (mins) => ((mins - bookableStart) / total) * 100;

  const segments = [];

  for (const o of occupancy) {
    const iv = serviceInterval(o.startTime, o.endTime, venueWindow);
    if (!iv) continue;
    const left = Math.max(iv[0], bookableStart);
    const right = Math.min(iv[1], bookableEnd);
    if (right <= left) continue;
    segments.push({
      type: 'booked',
      left: toPct(left),
      width: toPct(right) - toPct(left),
      label: `${o.startTime}–${o.endTime}`,
      spotsRemaining: o.spotsRemaining,
    });
  }

  if (selectedWindow?.startTime && selectedWindow?.endTime) {
    const iv = serviceInterval(selectedWindow.startTime, selectedWindow.endTime, venueWindow);
    if (iv) {
      const left = Math.max(iv[0], bookableStart);
      const right = Math.min(iv[1], bookableEnd);
      if (right > left) {
        segments.push({
          type: 'selected',
          left: toPct(left),
          width: toPct(right) - toPct(left),
          label: `${selectedWindow.startTime}–${selectedWindow.endTime}`,
        });
      }
    }
  }

  const ticks = [];
  for (let m = bookableStart; m <= bookableEnd; m += 60) {
    ticks.push({ time: minutesToHHmm(m), pct: toPct(m) });
  }

  return { segments, ticks, bookableStart, bookableEnd, total };
}
