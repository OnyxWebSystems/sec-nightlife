import { MOBILE_NAV_ROOT_PAGES } from '@/lib/mobilePageShell';

/**
 * @param {{ pageName: string, searchParams?: URLSearchParams | null }} opts
 * @returns {{ hideBottomNav: boolean }}
 */
export function getMobileNavState({ pageName }) {
  if (MOBILE_NAV_ROOT_PAGES.has(pageName)) {
    return { hideBottomNav: false };
  }
  return { hideBottomNav: true };
}
