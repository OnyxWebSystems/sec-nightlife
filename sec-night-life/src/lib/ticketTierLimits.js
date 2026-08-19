/** Integer >= 1, or null when the venue left the cap blank / unlimited. */
export function parseMaxPerUser(tier) {
  const raw = tier?.max_per_user;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

export function ownedCountForTier(event, tierName) {
  const counts = event?.my_ticket_counts;
  if (!counts || !tierName) return 0;
  return Number(counts[tierName]) || 0;
}

/** Max qty selectable this checkout: inventory, per-user remaining, and the 10-ticket ceiling. */
export function maxTicketQuantity({ tier, ownedCount = 0, checkoutCeiling = 10 }) {
  if (!tier) return 1;
  const inventory = Math.max(0, Number(tier.quantity) - (Number(tier.sold) || 0));
  const cap = parseMaxPerUser(tier);
  const remainingForUser = cap != null ? Math.max(0, cap - ownedCount) : inventory;
  return Math.max(0, Math.min(inventory, remainingForUser, checkoutCeiling));
}
