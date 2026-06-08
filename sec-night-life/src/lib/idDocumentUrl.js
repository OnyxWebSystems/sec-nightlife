/** Client mirror of backend idDocumentUrl normalization. */
export function normalizeIdDocumentUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const path = u.pathname;
    const uploadIdx = path.indexOf('/upload/');
    if (uploadIdx >= 0) {
      const afterUpload = path.slice(uploadIdx + '/upload/'.length);
      return afterUpload.replace(/^v\d+\//, '');
    }
    return path;
  } catch {
    return raw.split('?')[0].split('#')[0];
  }
}

export function idDocumentUrlChanged(prevUrl, nextUrl) {
  const next = String(nextUrl || '').trim();
  if (!next) return false;
  const prev = String(prevUrl || '').trim();
  if (!prev) return true;
  return normalizeIdDocumentUrl(prev) !== normalizeIdDocumentUrl(next);
}
