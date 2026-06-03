/** Controlled venue ↔ guest table messages (no free text). */

export const VENUE_TABLE_MESSAGE_TEMPLATES = {
  confirm_arrival_time: 'Can you confirm your expected arrival time?',
  running_late: 'We received your message — please let us know if you are running late.',
  need_guest_count: 'Please confirm the final guest count for your table.',
  menu_question: 'For menu questions, ask our staff on arrival or use your SEC order QR.',
  see_you_tonight: 'See you tonight — show your SEC QR to our team when you arrive.',
  decline_increase_min_spend: 'We need a higher minimum spend to accept this request.',
  decline_add_menu_items: 'Please add more items from our menu to meet minimum spend.',
  decline_no_tables_datetime: 'No tables are available for that date and time.',
  decline_too_many_guests: 'Guest count exceeds what we can seat for this request.',
  decline_date_unavailable: 'We are closed or fully booked on that date.',
  guest_will_increase_spend: 'I can increase my minimum spend — please review again.',
  guest_will_reduce_guests: 'I can reduce the guest count — please review again.',
  guest_will_change_datetime: 'I can change the date or time — please review again.',
  guest_will_add_menu_items: 'I will add more menu items to my request.',
  guest_cancel_request: 'Please cancel my table request.',
};

export const VENUE_DECLINE_TEMPLATE_KEYS = [
  'decline_increase_min_spend',
  'decline_add_menu_items',
  'decline_no_tables_datetime',
  'decline_too_many_guests',
  'decline_date_unavailable',
];

export const GUEST_REPLY_TEMPLATE_KEYS = [
  'guest_will_increase_spend',
  'guest_will_reduce_guests',
  'guest_will_change_datetime',
  'guest_will_add_menu_items',
  'guest_cancel_request',
];

export const VENUE_ARRIVAL_TEMPLATE_KEYS = [
  'confirm_arrival_time',
  'running_late',
  'need_guest_count',
  'menu_question',
  'see_you_tonight',
];

export function getTemplateLabel(templateKey) {
  return VENUE_TABLE_MESSAGE_TEMPLATES[templateKey] || null;
}

const MAX_DECLINE_AMOUNT_ZAR = 500_000;

export function formatZarAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toLocaleString('en-ZA', { maximumFractionDigits: 0 });
}

/** Build decline copy with optional venue-specified amounts. */
export function formatDeclineMessage(templateKey, params = {}) {
  const spend = formatZarAmount(params.preferredMinimumSpend);
  const menuTotal = formatZarAmount(params.preferredMenuTotal);
  const maxGuests = parseInt(String(params.maxGuestCount ?? ''), 10);
  if (templateKey === 'decline_increase_min_spend' && spend != null) {
    return `We need a minimum spend of R${spend} to accept this request.`;
  }
  if (templateKey === 'decline_add_menu_items' && menuTotal != null) {
    return `Please add menu items totaling at least R${menuTotal}.`;
  }
  if (templateKey === 'decline_no_tables_datetime') {
    const date = String(params.availableDate || '').trim();
    const time = String(params.availableTime || '').trim();
    if (date && time) {
      return `No tables are available for your requested date and time. We can offer ${date} at ${time}.`;
    }
    if (date) {
      return `No tables are available for your requested date and time. We can offer ${date}.`;
    }
  }
  if (templateKey === 'decline_too_many_guests' && Number.isFinite(maxGuests) && maxGuests >= 1) {
    return `Guest count exceeds what we can seat. We can accept up to ${maxGuests} guests for this request.`;
  }
  return getTemplateLabel(templateKey);
}

function isValidIsoDate(s) {
  if (!s || typeof s !== 'string') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function isValidTime(s) {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s.trim());
}

export function validateDeclinePayload({ templateKeys, params = {} }) {
  const keys = Array.isArray(templateKeys) ? templateKeys : [];
  if (!keys.length) return { ok: false, error: 'Select at least one decline reason' };
  for (const key of keys) {
    if (!VENUE_DECLINE_TEMPLATE_KEYS.includes(key)) {
      return { ok: false, error: 'Invalid decline template' };
    }
  }
  const spend = params.preferredMinimumSpend;
  const menuTotal = params.preferredMenuTotal;
  if (keys.includes('decline_increase_min_spend')) {
    const n = Number(spend);
    if (!Number.isFinite(n) || n < 0 || n > MAX_DECLINE_AMOUNT_ZAR) {
      return { ok: false, error: 'Enter a valid preferred minimum spend' };
    }
  }
  if (keys.includes('decline_add_menu_items')) {
    const n = Number(menuTotal);
    if (!Number.isFinite(n) || n < 0 || n > MAX_DECLINE_AMOUNT_ZAR) {
      return { ok: false, error: 'Enter a valid menu items total' };
    }
  }
  if (keys.includes('decline_no_tables_datetime')) {
    const date = params.availableDate;
    const time = params.availableTime;
    if (!isValidIsoDate(date)) {
      return { ok: false, error: 'Enter a valid available date' };
    }
    if (!isValidTime(time)) {
      return { ok: false, error: 'Enter a valid available time' };
    }
  }
  if (keys.includes('decline_too_many_guests')) {
    const n = parseInt(String(params.maxGuestCount ?? ''), 10);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      return { ok: false, error: 'Enter a valid maximum guest count (1–500)' };
    }
  }
  const messages = keys.map((key) =>
    formatDeclineMessage(key, {
      preferredMinimumSpend: keys.includes('decline_increase_min_spend') ? spend : undefined,
      preferredMenuTotal: keys.includes('decline_add_menu_items') ? menuTotal : undefined,
      availableDate: keys.includes('decline_no_tables_datetime') ? params.availableDate : undefined,
      availableTime: keys.includes('decline_no_tables_datetime') ? params.availableTime : undefined,
      maxGuestCount: keys.includes('decline_too_many_guests') ? params.maxGuestCount : undefined,
    }),
  );
  for (const msg of messages) {
    if (!msg || !assertSafeDisplayText(msg)) {
      return { ok: false, error: 'Decline message contains disallowed wording' };
    }
  }
  return { ok: true, messages, combinedLabel: messages.join(' ') };
}

export function getTemplatesForSender({ isOwner, memberStatus }) {
  if (isOwner) {
    if (memberStatus === 'DECLINED') return VENUE_DECLINE_TEMPLATE_KEYS;
    return [...VENUE_DECLINE_TEMPLATE_KEYS, ...VENUE_ARRIVAL_TEMPLATE_KEYS];
  }
  if (memberStatus === 'DECLINED') return GUEST_REPLY_TEMPLATE_KEYS;
  return [];
}

export function assertSafeDisplayText(text) {
  const lower = String(text || '').toLowerCase();
  const banned = ['deposit', 'pay outside', 'eft', 'cash upfront', 'off-app'];
  for (const bad of banned) {
    if (lower.includes(bad)) return false;
  }
  return true;
}

/** Statuses where controlled messaging is allowed */
export const MESSAGABLE_VENUE_MEMBER_STATUSES = [
  'APPROVED',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'DECLINED',
];
