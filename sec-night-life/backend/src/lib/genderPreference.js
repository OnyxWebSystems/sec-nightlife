/** @typedef {'ANY'|'MALE_ONLY'|'FEMALE_ONLY'|'OTHER_ONLY'} GuestGenderPreference */

const PREFS = new Set(['ANY', 'MALE_ONLY', 'FEMALE_ONLY', 'OTHER_ONLY']);

export function normalizeGuestGenderPreference(raw) {
  if (raw == null || raw === '') return 'ANY';
  const s = String(raw).toUpperCase();
  return PREFS.has(s) ? s : 'ANY';
}

/**
 * Map UserProfile.gender (lowercase string) to preference check.
 * @param {string|null|undefined} profileGender
 * @param {GuestGenderPreference} preference
 * @returns {{ ok: boolean, code?: string }}
 */
export function genderMatchesPreference(profileGender, preference) {
  if (!preference || preference === 'ANY') return { ok: true };
  const g = profileGender == null ? '' : String(profileGender).trim().toLowerCase();
  if (!g) return { ok: false, code: 'GENDER_REQUIRED' };
  if (preference === 'MALE_ONLY') return g === 'male' ? { ok: true } : { ok: false, code: 'GENDER_NOT_ALLOWED' };
  if (preference === 'FEMALE_ONLY') return g === 'female' ? { ok: true } : { ok: false, code: 'GENDER_NOT_ALLOWED' };
  if (preference === 'OTHER_ONLY') return g === 'other' ? { ok: true } : { ok: false, code: 'GENDER_NOT_ALLOWED' };
  return { ok: true };
}
