/** Controlled venue refund rejection messages (no free text). */

export const REFUND_REJECT_TEMPLATES = {
  refund_outside_policy: 'This request falls outside our refund policy.',
  refund_event_proceeded: 'The event proceeded as scheduled — refunds are not available for this reason.',
  refund_no_show: 'No-shows are not eligible for a refund under our venue policy.',
  refund_insufficient_proof: 'We could not verify the issue described — please contact the venue directly.',
  refund_already_used_qr: 'This ticket or QR was already used for entry.',
  refund_partial_service_delivered: 'Partial service was delivered — a full refund is not applicable.',
};

export const REFUND_REJECT_TEMPLATE_KEYS = Object.keys(REFUND_REJECT_TEMPLATES);

export function getRefundRejectLabel(templateKey) {
  return REFUND_REJECT_TEMPLATES[templateKey] || null;
}

export function formatRefundRejectMessage(templateKey) {
  return getRefundRejectLabel(templateKey) || 'Your refund request was declined by the venue.';
}

export function validateRefundRejectPayload({ templateKeys }) {
  const keys = Array.isArray(templateKeys) ? templateKeys : [];
  if (keys.length === 0) return { ok: false, error: 'At least one rejection reason is required' };
  for (const key of keys) {
    if (!REFUND_REJECT_TEMPLATE_KEYS.includes(key)) {
      return { ok: false, error: 'Invalid rejection template' };
    }
  }
  return { ok: true, keys };
}

export function formatRefundRejectMessages(templateKeys = []) {
  return templateKeys.map((k) => formatRefundRejectMessage(k)).filter(Boolean);
}
