import { normalizeHostingConfig } from './hostingConfig.js';

/** Door / entrance fee for an event (ZAR), or 0. */
export function getEventEntranceZar(event) {
  if (!event?.hasEntranceFee || event.entranceFeeAmount == null) return 0;
  const n = Number(event.entranceFeeAmount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Resolve tier max guests (and optional min spend) for general/vip hosting config.
 * @param {'GENERAL'|'VIP'} hostingCategory
 * @param {number|null|undefined} hostingTierIndex — index into tiers[] when tiers exist
 */
export function resolveHostingTierCaps(hostingRaw, hostingCategory, hostingTierIndex) {
  const hosting = normalizeHostingConfig(hostingRaw);
  const cat = hostingCategory === 'VIP' ? 'vip' : 'general';
  const slot = hosting[cat];
  const tiers = Array.isArray(slot?.tiers) ? slot.tiers : [];

  if (tiers.length === 0) {
    const cap = slot?.max_tables != null ? Number(slot.max_tables) : null;
    const maxGuests = cap != null && Number.isFinite(cap) && cap > 0 ? Math.min(cap, 500) : 500;
    return { maxGuests, minSpend: null, tierIndex: null };
  }

  const idx =
    hostingTierIndex != null && Number.isFinite(Number(hostingTierIndex))
      ? Number(hostingTierIndex)
      : 0;
  const tier = tiers[idx];
  if (!tier || tier.max_guests == null) {
    const err = new Error('Invalid hosting tier for this event');
    err.status = 400;
    throw err;
  }
  const maxGuests = Number(tier.max_guests);
  if (!Number.isFinite(maxGuests) || maxGuests < 1) {
    const err = new Error('Invalid tier guest limit');
    err.status = 400;
    throw err;
  }
  const minSpend =
    tier.min_spend != null && tier.min_spend !== '' ? Number(tier.min_spend) : null;
  return {
    maxGuests: Math.min(maxGuests, 500),
    minSpend: minSpend != null && Number.isFinite(minSpend) ? minSpend : null,
    tierIndex: idx,
  };
}

/** Host-table fee ZAR for category from hosting config. */
export function getHostTableFeeZar(hostingRaw, hostingCategory) {
  const hosting = normalizeHostingConfig(hostingRaw);
  const cat = hostingCategory === 'VIP' ? 'vip' : 'general';
  const n = Number(hosting[cat]?.host_table_fee_zar || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
