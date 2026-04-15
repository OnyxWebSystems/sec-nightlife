/** @param {object | null} user — from getCurrentUser / AuthContext */
/** @param {object | null} profile — user profile row (verification_status) */
export function isIdentityVerifiedUser(user, profile) {
  if (user?.identity_verified) return true;
  const s = profile?.verification_status;
  return s === 'verified' || s === 'approved';
}
