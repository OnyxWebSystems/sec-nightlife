import { Capacitor } from '@capacitor/core';

/** @typedef {'denied' | 'timeout' | 'unavailable' | 'insecure' | 'unsupported'} LocationErrorCode */

export class LocationError extends Error {
  /** @param {LocationErrorCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function messageForCode(/** @type {LocationErrorCode} */ code) {
  const native = isNative();
  switch (code) {
    case 'denied':
      return native
        ? 'Location permission denied — enable it in Settings → SEC Nightlife → Location.'
        : 'Location permission denied — enable it in your browser site settings.';
    case 'timeout':
      return 'Location timed out — try again outdoors or with a stronger GPS/Wi‑Fi signal.';
    case 'insecure':
      return 'Location needs a secure connection (HTTPS). Open the app from https://secnightlife.com.';
    case 'unsupported':
      return 'Geolocation is not supported on this device.';
    case 'unavailable':
    default:
      return native
        ? 'Could not access location — check that Location Services are on for SEC Nightlife.'
        : 'Could not access location — enable permission in your browser site settings.';
  }
}

function mapBrowserError(err) {
  const codeNum = err?.code;
  /** @type {LocationErrorCode} */
  let code = 'unavailable';
  if (codeNum === 1) code = 'denied';
  else if (codeNum === 2) code = 'unavailable';
  else if (codeNum === 3) code = 'timeout';
  return new LocationError(code, messageForCode(code));
}

async function getNativePosition(options) {
  const { Geolocation } = await import('@capacitor/geolocation');
  let status = await Geolocation.checkPermissions();
  if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
    status = await Geolocation.requestPermissions();
  }
  if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
    throw new LocationError('denied', messageForCode('denied'));
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: options.enableHighAccuracy,
    timeout: options.timeout,
    maximumAge: options.maximumAge,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
}

function getWebPosition(options) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return Promise.reject(new LocationError('insecure', messageForCode('insecure')));
  }
  if (!navigator?.geolocation) {
    return Promise.reject(new LocationError('unsupported', messageForCode('unsupported')));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      (err) => reject(mapBrowserError(err)),
      {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge,
      },
    );
  });
}

/**
 * Cross-platform current position (Capacitor Geolocation on native, browser otherwise).
 * @param {{ enableHighAccuracy?: boolean, timeout?: number, maximumAge?: number }} [opts]
 * @returns {Promise<{ lat: number, lng: number, accuracy: number | null }>}
 */
export async function getCurrentLocation(opts = {}) {
  const options = {
    enableHighAccuracy: opts.enableHighAccuracy ?? false,
    timeout: opts.timeout ?? 15000,
    maximumAge: opts.maximumAge ?? 300000,
  };

  try {
    if (isNative()) {
      return await getNativePosition(options);
    }
    return await getWebPosition(options);
  } catch (err) {
    if (err instanceof LocationError) throw err;
    // Capacitor plugin may throw plain Errors / permission strings
    const msg = String(err?.message || err || '');
    if (/denied|permission/i.test(msg)) {
      throw new LocationError('denied', messageForCode('denied'));
    }
    if (/timeout/i.test(msg)) {
      throw new LocationError('timeout', messageForCode('timeout'));
    }
    if (/secure|https/i.test(msg)) {
      throw new LocationError('insecure', messageForCode('insecure'));
    }
    throw new LocationError('unavailable', messageForCode('unavailable'));
  }
}

/** User-facing message for any thrown location error. */
export function locationErrorMessage(err) {
  if (err instanceof LocationError) return err.message;
  return messageForCode('unavailable');
}
