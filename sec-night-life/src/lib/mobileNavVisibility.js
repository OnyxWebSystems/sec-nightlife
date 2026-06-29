import { MOBILE_NAV_HIDDEN_PAGES } from '@/lib/mobilePageShell';

const MESSAGE_PAGES = new Set(['Messages', 'BusinessMessages']);
const THREAD_PARAMS = ['dm', 'group', 'venueTableThread', 'promoterVenue'];

function hasActiveThread(searchParams) {
  if (!searchParams) return false;
  return THREAD_PARAMS.some((key) => Boolean(searchParams.get(key)));
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
  if (MESSAGE_PAGES.has(pageName) || hasActiveThread(searchParams)) {
    return { hideBottomNav: true };
  }
  return { hideBottomNav: false };
}
