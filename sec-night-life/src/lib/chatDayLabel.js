import { format, isSameYear, isToday, isYesterday } from 'date-fns';

export function parseMessageDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day key, e.g. 2026-09-09. */
export function messageDayKey(value) {
  const d = parseMessageDate(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

/** WhatsApp-style day label for a message timestamp. */
export function chatDayLabel(value) {
  const d = parseMessageDate(value);
  if (!d) return '';
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  if (isSameYear(d, new Date())) return format(d, 'd MMMM');
  return format(d, 'd MMMM yyyy');
}
