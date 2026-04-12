const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

export function validateUsernameFormat(username) {
  const u = normalizeUsername(username);
  if (!u) return { ok: false, message: 'Username is required.' };
  if (u.length < 3 || u.length > 30) {
    return { ok: false, message: 'Username must be between 3 and 30 characters.' };
  }
  if (!USERNAME_RE.test(u)) {
    return { ok: false, message: 'Username may only contain letters, numbers, and underscores.' };
  }
  return { ok: true, username: u };
}
