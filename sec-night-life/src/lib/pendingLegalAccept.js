const STORAGE_KEY = 'sec-pending-legal-accept';

/** Call after successful registration (before redirect to login). */
export function setPendingLegalAcceptFromRegister({ termsVersion = '1.0', privacyVersion = '1.0' } = {}) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ termsVersion, privacyVersion, at: Date.now() })
    );
  } catch {}
}

/** After login, record Terms + Privacy acceptance server-side. Safe to call multiple times. */
export async function flushPendingLegalAccepts() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return;
  }

  const termsVersion = parsed.termsVersion || '1.0';
  const privacyVersion = parsed.privacyVersion || '1.0';

  try {
    const { dataService } = await import('@/services/dataService');
    const status = await dataService.Legal.acceptanceStatus();
    const latest = status?.latest || {};
    const termsOk = latest.TERMS_OF_SERVICE?.version === termsVersion;
    const privacyOk = latest.PRIVACY_POLICY?.version === privacyVersion;

    if (!termsOk) {
      await dataService.Legal.acceptDocument({
        document_key: 'terms_of_service',
        version: termsVersion,
      });
    }
    if (!privacyOk) {
      await dataService.Legal.acceptDocument({
        document_key: 'privacy_policy',
        version: privacyVersion,
      });
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  } catch {
    /* Keep STORAGE_KEY so a later session can retry */
  }
}
