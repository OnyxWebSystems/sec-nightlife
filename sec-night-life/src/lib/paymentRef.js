/** Normalize Paystack/payment refs for comparison (strip ledger suffix and ticket index). */
export function normalizePaymentRef(ref) {
  const s = String(ref || '');
  const colon = s.indexOf(':');
  const base = colon >= 0 ? s.slice(0, colon) : s;
  return base.replace(/-\d+$/, '');
}

export function paymentRefMatchesEligible(ticketRef, eligibleRef) {
  if (!ticketRef || !eligibleRef) return false;
  return normalizePaymentRef(ticketRef) === normalizePaymentRef(eligibleRef);
}
