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
