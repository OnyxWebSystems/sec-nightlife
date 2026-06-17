/** Build venue scope query string for business API calls. */
export function businessVenueQuery({ staffCtx = null, venueId = null } = {}) {
  if (staffCtx) return `staff_ctx=${encodeURIComponent(staffCtx)}`;
  if (venueId) return `venue_id=${encodeURIComponent(venueId)}`;
  return '';
}

export function appendBusinessVenueQuery(url, { staffCtx = null, venueId = null } = {}) {
  const q = businessVenueQuery({ staffCtx, venueId });
  if (!q) return url;
  return url.includes('?') ? `${url}&${q}` : `${url}?${q}`;
}
