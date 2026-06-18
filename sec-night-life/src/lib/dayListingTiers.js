export function parseDayTierIndex(hostingTierKey) {
  const parts = String(hostingTierKey || '').split(':');
  if (parts[0] !== 'day') return null;
  const idx = Number(parts[1]);
  return Number.isFinite(idx) ? idx : null;
}

export function countTierSlotsInList(dayTables, tierIndex) {
  return dayTables.filter((t) => {
    const idx = parseDayTierIndex(t.hostingTierKey);
    return idx === tierIndex && !t.isCustomListing;
  }).length;
}

export function totalSpotsForTier(tierTableSlots, maxGuests) {
  const tables = Math.max(1, parseInt(String(tierTableSlots), 10) || 1);
  const guests = Math.max(1, parseInt(String(maxGuests), 10) || 1);
  return tables * guests;
}
