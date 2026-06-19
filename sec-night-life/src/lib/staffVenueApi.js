/** Build menu API base path for owner venue vs staff session. */
export function menuApiBase({ inStaffSession, staffContextToken, venueId } = {}) {
  if (inStaffSession && staffContextToken) {
    return `/api/staff/context/${encodeURIComponent(staffContextToken)}/menu`;
  }
  if (venueId) return `/api/business/venues/${venueId}`;
  return null;
}

/** Append staff_ctx query param for promotion create when in staff session. */
export function promotionsApiQuery({ inStaffSession, staffContextToken } = {}) {
  if (inStaffSession && staffContextToken) {
    return `staff_ctx=${encodeURIComponent(staffContextToken)}`;
  }
  return '';
}

/** Staff-context venue profile endpoint. */
export function staffVenueApiBase(staffContextToken) {
  if (!staffContextToken) return null;
  return `/api/staff/context/${encodeURIComponent(staffContextToken)}/venue`;
}

/** Staff-context promotions list endpoint. */
export function staffPromotionsListUrl(staffContextToken) {
  if (!staffContextToken) return null;
  return `/api/staff/context/${encodeURIComponent(staffContextToken)}/promotions`;
}
