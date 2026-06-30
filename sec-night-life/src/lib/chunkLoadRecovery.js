/**
 * After a new Vercel deploy, browsers can still run an old bundle that tries to
 * import chunk files that no longer exist (different content hashes).
 * Recover by forcing a single full reload so index.html pulls the fresh asset map.
 */
const RELOAD_SESSION_KEY = 'sec_vite_chunk_reload_attempted';

export function isStaleChunkLoadError(reason) {
  const msg =
    typeof reason === 'string'
      ? reason
      : reason?.message || String(reason?.toString?.() || reason || '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Loading CSS chunk [\d]+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /valid JavaScript MIME/i.test(msg) ||
    /text\/html.*MIME/i.test(msg) ||
    reason?.name === 'ChunkLoadError'
  );
}

export function scheduleChunkReloadOnce() {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(RELOAD_SESSION_KEY) === '1') return false;
    sessionStorage.setItem(RELOAD_SESSION_KEY, '1');
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_chunk', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export function clearChunkReloadAttemptFlag() {
  try {
    sessionStorage.removeItem(RELOAD_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
