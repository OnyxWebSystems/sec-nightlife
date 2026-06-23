import { MOBILE_NAV_HIDDEN_PAGES } from '@/lib/mobilePageShell';

/**
 * @param {{ pageName: string, searchParams?: URLSearchParams | null }} opts
 * @returns {{ hideBottomNav: boolean }}
 */
export function getMobileNavState({ pageName }) {
  if (!pageName) return { hideBottomNav: false };
  if (MOBILE_NAV_HIDDEN_PAGES.has(pageName)) {
    return { hideBottomNav: true };
  }
  return { hideBottomNav: false };
}
