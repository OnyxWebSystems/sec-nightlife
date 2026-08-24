const INSTAGRAM_HOST = /(^|\.)instagram\.com$/i;
const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'accounts',
  'direct',
  'tv',
]);

function firstPathSegment(pathname) {
  return String(pathname || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)[0] || '';
}

/**
 * Extract an Instagram username from a handle or pasted profile URL.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function instagramHandle(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  let candidate = trimmed;

  const looksLikeUrl = /instagram\.com/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
  if (looksLikeUrl) {
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/\//, '')}`;
      const url = new URL(withProtocol);
      if (INSTAGRAM_HOST.test(url.hostname)) {
        const path = firstPathSegment(url.pathname);
        if (/^https?:$/i.test(path)) {
          candidate = String(url.pathname).replace(/^\/+/, '');
        } else {
          candidate = path;
        }
      }
    } catch {
      candidate = trimmed.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '');
    }
  }

  candidate = candidate.replace(/^@+/, '').trim();
  if (/instagram\.com/i.test(candidate)) {
    candidate = candidate.replace(/^(https?:\/\/)?(www\.)?instagram\.com\/?/i, '');
  }
  candidate = candidate.split(/[/?#]/)[0].trim();
  if (!candidate || INSTAGRAM_RESERVED.has(candidate.toLowerCase())) return null;
  if (!/^[A-Za-z0-9._]{1,30}$/.test(candidate)) return null;
  return candidate;
}

/** @param {unknown} raw */
export function instagramProfileUrl(raw) {
  const handle = instagramHandle(raw);
  return handle ? `https://instagram.com/${handle}` : null;
}

/** Open an absolute http(s) URL in a new tab; fall back to same-tab if popups are blocked. */
export function openExternalUrl(event, url) {
  if (!url) return;
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}

/** Absolute http(s) href, or null if the value cannot be opened as a website. */
export function websiteHref(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol)) return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}
