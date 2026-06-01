/** Controlled venue ↔ guest table messages (no free text). */
export const VENUE_TABLE_MESSAGE_TEMPLATES = {
  confirm_arrival_time: 'Can you confirm your expected arrival time?',
  running_late: 'We received your message — please let us know if you are running late.',
  need_guest_count: 'Please confirm the final guest count for your table.',
  menu_question: 'For menu questions, ask our staff on arrival or use your SEC order QR.',
  see_you_tonight: 'See you tonight — show your SEC QR to our team when you arrive.',
};

const BANNED_SUBSTRINGS = ['deposit', 'pay outside', 'eft', 'cash upfront', 'off-app'];

export function getTemplateLabel(templateKey) {
  return VENUE_TABLE_MESSAGE_TEMPLATES[templateKey] || null;
}

export function assertSafeDisplayText(text) {
  const lower = String(text || '').toLowerCase();
  for (const bad of BANNED_SUBSTRINGS) {
    if (lower.includes(bad)) return false;
  }
  return true;
}

export const MESSAGABLE_VENUE_MEMBER_STATUSES = ['APPROVED', 'PENDING_PAYMENT', 'CONFIRMED'];
