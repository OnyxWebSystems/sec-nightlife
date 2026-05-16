/**
 * Event hosting_config JSON: venue-defined table/ticket tier groups.
 * Backward compatible with legacy { general, vip } shape.
 */

function emptyLegacyCat() {
  return { max_tables: null, tiers: [], host_table_fee_zar: null };
}

function normalizeLegacySlot(slot) {
  if (!slot || typeof slot !== 'object') return emptyLegacyCat();
  const out = emptyLegacyCat();
  if ('max_tables' in slot && slot.max_tables !== undefined) {
    out.max_tables = slot.max_tables === null ? null : Number(slot.max_tables);
  }
  if (Array.isArray(slot.tiers)) out.tiers = slot.tiers;
  if (slot.host_table_fee_zar != null && slot.host_table_fee_zar !== '') {
    const n = Number(slot.host_table_fee_zar);
    out.host_table_fee_zar = Number.isFinite(n) && n > 0 ? n : null;
  }
  return out;
}

/** Legacy { general, vip } — still used by host dashboard until fully migrated. */
export function normalizeHostingConfig(raw) {
  const base = { general: emptyLegacyCat(), vip: emptyLegacyCat() };
  if (!raw || typeof raw !== 'object') return base;
  if (Array.isArray(raw.tier_groups)) {
    return legacyFromTierGroups(raw.tier_groups);
  }
  for (const k of ['general', 'vip']) {
    if (raw[k]) base[k] = normalizeLegacySlot(raw[k]);
  }
  return base;
}

function legacyFromTierGroups(groups) {
  const base = { general: emptyLegacyCat(), vip: emptyLegacyCat() };
  for (const g of groups) {
    const key = String(g.category_key || g.label || 'general').toLowerCase().includes('vip')
      ? 'vip'
      : 'general';
    base[key] = {
      max_tables: g.max_tables ?? null,
      host_table_fee_zar: g.host_table_fee_zar ?? null,
      tiers: Array.isArray(g.table_slots) ? g.table_slots : g.tiers || [],
    };
  }
  return base;
}

/** Venue-defined tier groups (preferred shape). */
export function normalizeHostingConfigV2(raw) {
  if (!raw || typeof raw !== 'object') {
    return { tier_groups: [], ticket_tiers: [] };
  }
  if (Array.isArray(raw.tier_groups) && raw.tier_groups.length > 0) {
    return {
      tier_groups: raw.tier_groups.map((g, gi) => ({
        id: g.id || `group_${gi}`,
        label: String(g.label || g.category_key || `Tier ${gi + 1}`).trim(),
        max_tables: g.max_tables != null ? Number(g.max_tables) : null,
        host_table_fee_zar:
          g.host_table_fee_zar != null && g.host_table_fee_zar !== ''
            ? Number(g.host_table_fee_zar) || null
            : null,
        allows_custom_requests: Boolean(g.allows_custom_requests),
        table_slots: (Array.isArray(g.table_slots) ? g.table_slots : g.tiers || []).map((t, ti) => ({
          tier_name: String(t.tier_name || t.name || `Option ${ti + 1}`).trim(),
          max_guests: Number(t.max_guests) || 0,
          min_spend: Number(t.min_spend) || 0,
          booking_fee_zar: Number(t.booking_fee_zar ?? t.booking_fee ?? 0) || 0,
          tier_table_slots: Number(t.tier_table_slots) || 1,
          included_items: t.included_items || [],
          is_custom: Boolean(t.is_custom),
        })),
      })),
      ticket_tiers: Array.isArray(raw.ticket_tiers) ? raw.ticket_tiers : [],
    };
  }
  const legacy = normalizeHostingConfig(raw);
  const tier_groups = [];
  for (const [category_key, slot] of Object.entries(legacy)) {
    if (!slot?.tiers?.length && slot.max_tables == null) continue;
    tier_groups.push({
      id: category_key,
      label: category_key === 'vip' ? 'VIP' : 'General',
      category_key,
      max_tables: slot.max_tables,
      host_table_fee_zar: slot.host_table_fee_zar,
      allows_custom_requests: false,
      table_slots: (slot.tiers || []).map((t) => ({
        ...t,
        booking_fee_zar: Number(t.booking_fee_zar ?? 0) || 0,
      })),
    });
  }
  return { tier_groups, ticket_tiers: Array.isArray(raw.ticket_tiers) ? raw.ticket_tiers : [] };
}

export function mergeHostingConfigPatch(existing, patch) {
  const cur = normalizeHostingConfig(existing);
  if (!patch || typeof patch !== 'object') return cur;
  if (patch.tier_groups) {
    return legacyFromTierGroups(patch.tier_groups);
  }
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
    if ('host_table_fee_zar' in p) {
      if (p.host_table_fee_zar === null || p.host_table_fee_zar === undefined || p.host_table_fee_zar === '') {
        cur[k].host_table_fee_zar = null;
      } else {
        const n = Number(p.host_table_fee_zar);
        cur[k].host_table_fee_zar = Number.isFinite(n) && n > 0 ? n : null;
      }
    }
  }
  return cur;
}

export function mergeHostingConfigPatchV2(existing, patch) {
  const cur = normalizeHostingConfigV2(existing);
  if (!patch || typeof patch !== 'object') return cur;
  if (patch.tier_groups) {
    return normalizeHostingConfigV2({ ...cur, tier_groups: patch.tier_groups });
  }
  return normalizeHostingConfigV2({ ...cur, ...patch });
}
