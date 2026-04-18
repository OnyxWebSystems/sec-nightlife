/**
 * Event hosting_config JSON: separate General vs VIP table caps and pricing tiers.
 */
export function normalizeHostingConfig(raw) {
  const emptyCat = () => ({ max_tables: null, tiers: [] });
  const base = { general: emptyCat(), vip: emptyCat() };
  if (!raw || typeof raw !== 'object') return base;
  for (const k of ['general', 'vip']) {
    const slot = raw[k];
    if (slot && typeof slot === 'object') {
      if ('max_tables' in slot && slot.max_tables !== undefined) {
        base[k].max_tables =
          slot.max_tables === null ? null : Number(slot.max_tables);
      }
      if (Array.isArray(slot.tiers)) {
        base[k].tiers = slot.tiers;
      }
    }
  }
  return base;
}

export function mergeHostingConfigPatch(existing, patch) {
  const cur = normalizeHostingConfig(existing);
  if (!patch || typeof patch !== 'object') return cur;
  for (const k of ['general', 'vip']) {
    if (patch[k] == null || typeof patch[k] !== 'object') continue;
    const p = patch[k];
    if ('max_tables' in p) {
      cur[k].max_tables =
        p.max_tables === null || p.max_tables === undefined ? null : Number(p.max_tables);
    }
    if ('tiers' in p) {
      cur[k].tiers = Array.isArray(p.tiers) ? p.tiers : [];
    }
  }
  return cur;
}
