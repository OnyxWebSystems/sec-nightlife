const NOMINATIM_UA = 'SECNightlife/1.0 (https://secnightlife.com; support@secnightlife.com)';

export async function nominatimFetch(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_UA,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Map Nominatim address object into the app’s structured address shape. */
export function structuredFromNominatim(item) {
  const addr = item?.address || {};
  const formattedAddress = typeof item?.display_name === 'string' ? item.display_name.trim() : '';
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);

  const suburb =
    addr.suburb ||
    addr.neighbourhood ||
    addr.neighborhood ||
    addr.city_district ||
    addr.quarter ||
    '';
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    '';
  const province = addr.state || addr.region || '';
  const countryRaw = addr.country_code || 'za';
  const country = String(countryRaw).toUpperCase() === 'ZA' ? 'ZA' : String(countryRaw).toUpperCase();
  const street = [addr.house_number, addr.road].filter(Boolean).join(' ').trim() || formattedAddress;

  return {
    formattedAddress,
    street,
    suburb,
    city,
    province,
    country,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
  };
}
