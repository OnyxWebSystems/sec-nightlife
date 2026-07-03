import {
  buildAvailableGaps,
  isOvernightWindow,
  latestBookableEndTime,
} from '@/lib/dayBookingSlotUtils';

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const WEEKDAY_FULL = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

const WEEKDAY_LABELS = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
};

export function weekdayKeySast(date = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long',
  }).format(date instanceof Date ? date : new Date(date));
  return String(label || '').toLowerCase();
}

export function isDayBookingVenueTable(table) {
  if (!table || table.eventId) return false;
  if (table.isDayBooking === true) return true;
  const key = String(table.hostingTierKey || '');
  return key.startsWith('day:') || Boolean(table.isCustomListing);
}

function normalizeServiceSchedule(table) {
  const raw = table?.serviceSchedule ?? table?.service_schedule;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      day: String(row?.day || '').toLowerCase(),
      startTime: row?.startTime || row?.start_time || null,
      endTime: row?.endTime || row?.end_time || null,
    }))
    .filter((row) => WEEKDAY_KEYS.includes(row.day) && row.startTime && row.endTime);
}

export function venueWindowFromSchedule(table, refDate = new Date()) {
  const schedule = normalizeServiceSchedule(table);
  if (!schedule.length) {
    const startTime = table?.startTime || table?.start_time;
    const endTime = table?.endTime || table?.end_time;
    if (startTime && endTime) return { startTime: String(startTime), endTime: String(endTime) };
    return null;
  }
  const dayKey = weekdayKeySast(refDate);
  const entry = schedule.find((e) => e.day === dayKey);
  if (!entry) return null;
  return { startTime: entry.startTime, endTime: entry.endTime };
}

export function formatOpenDaysSummary(table) {
  const schedule = normalizeServiceSchedule(table);
  if (!schedule.length) return null;
  const dayPart = schedule.map((r) => WEEKDAY_LABELS[r.day] || r.day).join(', ');
  const windows = new Set(schedule.map((r) => `${r.startTime}–${r.endTime}`));
  if (windows.size === 1) {
    return `${dayPart} · ${[...windows][0]}`;
  }
  return schedule.map((r) => `${WEEKDAY_LABELS[r.day] || r.day} ${r.startTime}–${r.endTime}`).join(' · ');
}

export function findTierSlotByVenueTableId(tierData, venueTableId) {
  if (!tierData?.tiers || !venueTableId) return null;
  for (const tier of tierData.tiers) {
    const slot = (tier.slots || []).find((s) => s.venueTableId === venueTableId);
    if (slot) return { tier, slot };
  }
  return null;
}

function mapOccupancyFromSlot(slot) {
  if (!slot) return [];
  if (Array.isArray(slot.occupancy) && slot.occupancy.length) {
    return slot.occupancy.map((o) => ({
      startTime: o.startTime,
      endTime: o.endTime,
      hostedTableId: o.hostedTableId,
      spotsRemaining: o.spotsRemaining,
      hostName: o.hostedTable?.host?.username || o.hostedTable?.host?.fullName || o.hostName || null,
    }));
  }
  if (slot.isHosted && slot.hostedTable) {
    const ht = slot.hostedTable;
    const startTime = ht.windowStartTime || slot.startTime;
    const endTime = ht.windowEndTime || slot.endTime;
    if (startTime && endTime) {
      return [
        {
          startTime,
          endTime,
          hostedTableId: ht.id,
          spotsRemaining: ht.spotsRemaining,
          hostName: ht.host?.username || ht.host?.fullName || null,
        },
      ];
    }
  }
  return [];
}

/**
 * Resolve day-booking UI context from venue table API record + optional tier slot.
 */
export function resolveDayBookingContext(venueTable, { tierSlot = null, tierData = null, refDate = new Date() } = {}) {
  const isDayBooking = isDayBookingVenueTable(venueTable);
  if (!isDayBooking) {
    return {
      isDayBooking: false,
      isOpenToday: false,
      venueWindow: null,
      serviceDay: null,
      latestBookableEnd: null,
      isOvernight: false,
      dayOccupancy: [],
      availableGaps: [],
      openDaysSummary: null,
    };
  }

  const venueWindow = venueTable?.venueWindow || venueWindowFromSchedule(venueTable, refDate);
  const dayKey = weekdayKeySast(refDate);
  const serviceDay = venueTable?.serviceDay || {
    key: dayKey,
    label: WEEKDAY_FULL[dayKey] || dayKey,
  };

  const slotFromTiers =
    tierSlot ||
    (tierData && venueTable?.id ? findTierSlotByVenueTableId(tierData, venueTable.id)?.slot : null);

  const dayOccupancy =
    (Array.isArray(venueTable?.dayOccupancy) && venueTable.dayOccupancy.length
      ? venueTable.dayOccupancy
      : null) || mapOccupancyFromSlot(slotFromTiers);

  const availableGaps =
    (Array.isArray(venueTable?.availableGaps) && venueTable.availableGaps.length
      ? venueTable.availableGaps
      : null) || (venueWindow ? buildAvailableGaps(venueWindow, dayOccupancy, { now: new Date() }) : []);

  const latestBookableEnd =
    venueTable?.latestBookableEnd || (venueWindow ? latestBookableEndTime(venueWindow) : null);
  const isOvernight =
    venueTable?.isOvernight ??
    (venueWindow ? isOvernightWindow(venueWindow.startTime, venueWindow.endTime) : false);

  return {
    isDayBooking: true,
    isOpenToday: Boolean(venueWindow),
    venueWindow,
    serviceDay,
    latestBookableEnd,
    isOvernight,
    dayOccupancy,
    availableGaps,
    openDaysSummary: formatOpenDaysSummary(venueTable),
  };
}

export function resolveVenueWindowFromTierData(tierData, sampleTable = null) {
  if (tierData?.venueWindow) return tierData.venueWindow;
  if (sampleTable) return venueWindowFromSchedule(sampleTable);
  const firstSlot = tierData?.tiers?.[0]?.slots?.[0];
  if (firstSlot?.venueTableId && sampleTable) return venueWindowFromSchedule(sampleTable);
  return null;
}
