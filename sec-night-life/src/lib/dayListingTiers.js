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

/** Group day listing slots by tier for business dashboard cards. */
export function groupDayTablesByTier(dayTables) {
  const tierTables = (dayTables || []).filter((t) => !t.isCustomListing);
  const groups = new Map();

  for (const table of tierTables) {
    const tierIdx = parseDayTierIndex(table.hostingTierKey);
    const key = tierIdx != null ? `tier-${tierIdx}` : `legacy-${table.id}`;
    if (!groups.has(key)) {
      const baseName = table.tierLabel || table.tableName?.replace(/\s#\d+$/, '').trim() || 'Listing';
      groups.set(key, {
        key,
        tierIndex: tierIdx,
        tierName: baseName,
        tables: [],
      });
    }
    groups.get(key).tables.push(table);
  }

  return [...groups.values()]
    .map((group) => {
      const sorted = [...group.tables].sort((a, b) =>
        String(a.tableName || '').localeCompare(String(b.tableName || '')),
      );
      return {
        ...group,
        tables: sorted,
        tableCount: sorted.length,
        inUseCount: sorted.filter((t) => t.inUse).length,
        availableCount: sorted.filter((t) => t.isActive && !t.inUse).length,
        hiddenCount: sorted.filter((t) => !t.isActive && !t.inUse).length,
        canDeleteTier: sorted.some((t) => t.canDeleteTier) && group.tierIndex != null,
        sample: sorted[0],
      };
    })
    .sort((a, b) => {
      const ai = a.tierIndex ?? 999;
      const bi = b.tierIndex ?? 999;
      return ai - bi;
    });
}
