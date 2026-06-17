/** Pages that hide the mobile bottom nav entirely (immersive full-screen UX). */
const IMMERSIVE_PAGES = new Set([
  'Messages',
  'EventDetails',
  'TableDetails',
  'JobDetails',
  'ChatRoom',
  'ManageTable',
  'TablePayment',
  'TableJoinOnboarding',
]);

const BUSINESS_MESSAGE_THREAD_PARAMS = ['application', 'thread', 'promoterVenue'];

/**
 * @param {{ pageName: string, searchParams?: URLSearchParams | null }} opts
 * @returns {{ hideBottomNav: boolean }}
 */
export function getMobileNavState({ pageName, searchParams = null }) {
  if (IMMERSIVE_PAGES.has(pageName)) {
    return { hideBottomNav: true };
  }

  if (pageName === 'BusinessMessages' && searchParams) {
    const inThread = BUSINESS_MESSAGE_THREAD_PARAMS.some((key) => {
      const v = searchParams.get(key);
      return v && String(v).trim();
    });
    if (inThread) return { hideBottomNav: true };
  }

  return { hideBottomNav: false };
}
