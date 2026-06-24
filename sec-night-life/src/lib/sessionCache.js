/** Persist last-known session in localStorage so returning users skip auth spinners. */
const SESSION_USER_CACHE_KEY = 'sec_session_user';
const LEGACY_SESSION_CACHE_KEY = 'sec_session_user';

export function readSessionCache() {
  try {
    const raw = localStorage.getItem(SESSION_USER_CACHE_KEY);
    if (raw) return JSON.parse(raw);
    const legacy = sessionStorage.getItem(LEGACY_SESSION_CACHE_KEY);
    if (legacy) {
      localStorage.setItem(SESSION_USER_CACHE_KEY, legacy);
      sessionStorage.removeItem(LEGACY_SESSION_CACHE_KEY);
      return JSON.parse(legacy);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSessionCache(user, profile) {
  if (!user?.id) return;
  const normalizedProfile = profile ?? user.user_profile ?? null;
  try {
    localStorage.setItem(
      SESSION_USER_CACHE_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        verified: user.verified,
        verification_status: user.verification_status,
        identity_verified: user.identity_verified,
        can_admin_dashboard: user.can_admin_dashboard,
        profile: normalizedProfile,
        onboarding_complete: normalizedProfile?.onboarding_complete ?? null,
      }),
    );
  } catch {}
}

export function clearSessionCache() {
  try {
    localStorage.removeItem(SESSION_USER_CACHE_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_CACHE_KEY);
  } catch {}
}

export function userFromSessionCache(cached) {
  if (!cached?.id) return { user: null, profile: null };
  return {
    user: {
      id: cached.id,
      email: cached.email,
      full_name: cached.full_name,
      role: cached.role,
      verified: cached.verified,
      verification_status: cached.verification_status,
      identity_verified: cached.identity_verified,
      can_admin_dashboard: cached.can_admin_dashboard,
    },
    profile: cached.profile ?? null,
  };
}
