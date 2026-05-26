/** Infer join/host booking fee toggles from tier form/API data. */
export function tierFeeTogglesFromTier(t) {
  const joinAmt = parseFloat(String(t?.booking_fee_zar ?? '').replace(',', '.')) || 0;
  const hostAmt = parseFloat(String(t?.host_table_fee_zar ?? '').replace(',', '.')) || 0;
  return {
    include_join_booking_fee:
      t?.include_join_booking_fee === false
        ? false
        : t?.include_join_booking_fee === true || joinAmt > 0,
    include_host_booking_fee:
      t?.include_host_booking_fee === false
        ? false
        : t?.include_host_booking_fee === true || hostAmt > 0,
  };
}

export function resolveTierFeesForSave(t) {
  const { include_join_booking_fee, include_host_booking_fee } = tierFeeTogglesFromTier(t);
  const bfRaw = String(t.booking_fee_zar ?? '').trim();
  const hfRaw = String(t.host_table_fee_zar ?? '').trim();
  const bookingFee = include_join_booking_fee && bfRaw ? parseFloat(bfRaw.replace(',', '.')) : 0;
  const hostFee = include_host_booking_fee && hfRaw ? parseFloat(hfRaw.replace(',', '.')) : 0;
  return {
    include_join_booking_fee,
    include_host_booking_fee,
    booking_fee_zar: Number.isFinite(bookingFee) && bookingFee >= 0 ? bookingFee : 0,
    host_table_fee_zar: Number.isFinite(hostFee) && hostFee >= 0 ? hostFee : 0,
  };
}
