import { MOBILE_NAV_HIDDEN_PAGES } from '@/lib/mobilePageShell';

const MESSAGE_THREAD_PARAMS = ['dm', 'group', 'venueTableThread', 'promoterVenue'];
const BUSINESS_THREAD_PARAMS = ['application', 'thread', 'promoterVenue'];

function isInMessageThread(pageName, searchParams) {
  if (!searchParams) return false;
  if (pageName === 'Messages') {
    return MESSAGE_THREAD_PARAMS.some((key) => Boolean(searchParams.get(key)));
  }
  if (pageName === 'BusinessMessages') {
    return BUSINESS_THREAD_PARAMS.some((key) => Boolean(searchParams.get(key)));
  }
  return false;
}

/**
 * @param {{ pageName: string, searchParams?: URLSearchParams | null }} opts
 * @returns {{ hideBottomNav: boolean }}
 */
export function getMobileNavState({ pageName, searchParams }) {
  if (!pageName) return { hideBottomNav: false };
  if (MOBILE_NAV_HIDDEN_PAGES.has(pageName)) {
    return { hideBottomNav: true };
  }
  if (isInMessageThread(pageName, searchParams)) {
    return { hideBottomNav: true };
  }
  return { hideBottomNav: false };
}
