/** Native deep link routing — registered from React Router inside App. */
let navigateFn = null;

export function registerDeepLinkNavigate(fn) {
  navigateFn = typeof fn === 'function' ? fn : null;
}

export function handleDeepLinkPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return;
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (navigateFn) {
    navigateFn(path);
    return;
  }
  window.location.assign(path);
}

/** Parse https://secnightlife.com/Path?query from a Capacitor appUrlOpen event. */
export function pathFromAppUrl(url) {
  try {
    const parsed = new URL(url);
    const allowedHosts = new Set(['secnightlife.com', 'www.secnightlife.com']);
    if (!allowedHosts.has(parsed.hostname)) return null;
    const path = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    return path === '/' ? null : path;
  } catch {
    return null;
  }
}
