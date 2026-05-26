/** Resolve join/host minimum spend from tier JSON (legacy min_spend applies to both). */
export function resolveTierMinSpends(tier) {
  const legacy = parseFloat(String(tier?.min_spend ?? '').replace(',', '.')) || 0;
  const joinRaw = String(tier?.min_spend_join ?? '').trim();
  const hostRaw = String(tier?.min_spend_host ?? '').trim();
  const min_spend_join = joinRaw !== '' ? parseFloat(joinRaw.replace(',', '.')) : legacy;
  const min_spend_host = hostRaw !== '' ? parseFloat(hostRaw.replace(',', '.')) : legacy;
  return {
    min_spend_join: Number.isFinite(min_spend_join) && min_spend_join >= 0 ? min_spend_join : 0,
    min_spend_host: Number.isFinite(min_spend_host) && min_spend_host >= 0 ? min_spend_host : 0,
  };
}

export function tierMinSpendsFromApi(t) {
  const resolved = resolveTierMinSpends(t);
  return {
    min_spend: String(t?.min_spend ?? resolved.min_spend_join ?? ''),
    min_spend_join: String(t?.min_spend_join ?? t?.min_spend ?? ''),
    min_spend_host: String(t?.min_spend_host ?? t?.min_spend ?? ''),
  };
}
