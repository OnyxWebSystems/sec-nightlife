/** Pages that skip onboarding / auth gate (camelCase from pages.config). */
export const ONBOARDING_EXEMPT_PAGES = new Set([
  'Onboarding',
  'ProfileSetup',
  'VenueOnboarding',
  'Welcome',
  'Home',
  'Login',
  'Register',
  'ResetPassword',
  'VerifyEmail',
  'ForgotPassword',
  'PaymentSuccess',
  'TicketSuccess',
  'TicketVerify',
]);

/** Kebab-case URLs used in email links and dedicated routes. */
const KEBAB_PUBLIC_SEGMENTS = new Set([
  'verify-email',
  'forgot-password',
  'reset-password',
]);

/** Auth flows that should not block on session restore (work logged-out). */
const AUTH_BOOTSTRAP_SKIP_SEGMENTS = new Set([
  'verify-email',
  'forgot-password',
  'reset-password',
  'login',
  'register',
]);

function firstPathSegment(pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') return '';
  return normalized.replace(/^\//, '').split('/')[0];
}

export function isPublicAppPath(pathname) {
  const normalized = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized === '/' || normalized === '/Home') return true;

  const segment = firstPathSegment(pathname);
  if (!segment) return true;

  if (KEBAB_PUBLIC_SEGMENTS.has(segment)) return true;

  if (ONBOARDING_EXEMPT_PAGES.has(segment)) return true;

  const lower = segment.toLowerCase();
  for (const page of ONBOARDING_EXEMPT_PAGES) {
    if (page.toLowerCase() === lower) return true;
  }

  return false;
}

export function shouldSkipAuthBootstrap(pathname) {
  const segment = firstPathSegment(pathname).toLowerCase();
  return AUTH_BOOTSTRAP_SKIP_SEGMENTS.has(segment);
}
