export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const WEEKDAY_OPTIONS = [
  { key: 'monday', label: 'Mon', full: 'Monday' },
  { key: 'tuesday', label: 'Tue', full: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', full: 'Wednesday' },
  { key: 'thursday', label: 'Thu', full: 'Thursday' },
  { key: 'friday', label: 'Fri', full: 'Friday' },
  { key: 'saturday', label: 'Sat', full: 'Saturday' },
  { key: 'sunday', label: 'Sun', full: 'Sunday' },
];

export function emptyServiceScheduleMap() {
  return Object.fromEntries(
    WEEKDAY_KEYS.map((day) => [day, { enabled: false, startTime: '19:00', endTime: '23:00' }]),
  );
}

export function scheduleMapFromApi(schedule) {
  const map = emptyServiceScheduleMap();
  const rows = Array.isArray(schedule) ? schedule : [];
  for (const row of rows) {
    const day = String(row?.day || '').toLowerCase();
    if (!map[day]) continue;
    map[day] = {
      enabled: true,
      startTime: row.startTime || row.start_time || '19:00',
      endTime: row.endTime || row.end_time || '23:00',
    };
  }
  return map;
}

export function scheduleMapToApi(scheduleMap) {
  if (!scheduleMap || typeof scheduleMap !== 'object') return [];
  return WEEKDAY_KEYS.filter((day) => scheduleMap[day]?.enabled).map((day) => ({
    day,
    startTime: scheduleMap[day].startTime || '19:00',
    endTime: scheduleMap[day].endTime || '23:00',
  }));
}

export function formatServiceScheduleSummary(schedule) {
  const rows = Array.isArray(schedule) ? schedule : [];
  if (!rows.length) return null;
  const labels = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
  const dayPart = rows.map((r) => labels[r.day] || r.day).join(', ');
  const windows = new Set(rows.map((r) => `${r.startTime}–${r.endTime}`));
  if (windows.size === 1) return `${dayPart} · ${[...windows][0]}`;
  return rows.map((r) => `${labels[r.day] || r.day} ${r.startTime}–${r.endTime}`).join(' · ');
}
