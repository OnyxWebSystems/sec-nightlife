/** Inner height of the floating pill nav bar */
export const MOBILE_NAV_HEIGHT = 56;

/** Bottom margin below the floating pill nav */
export const MOBILE_NAV_FLOATING_MARGIN = 12;

/** Total vertical space used by floating nav (bar + margin + safe area) */
export const MOBILE_NAV_FLOATING_HEIGHT = MOBILE_NAV_HEIGHT + MOBILE_NAV_FLOATING_MARGIN;

/** CSS bottom offset so fixed footers sit above the mobile nav */
export const MOBILE_NAV_BOTTOM_OFFSET = `calc(${MOBILE_NAV_FLOATING_HEIGHT}px + env(safe-area-inset-bottom))`;

/** Main content padding-bottom when floating nav is visible */
export const MOBILE_MAIN_PADDING_BOTTOM = `calc(${MOBILE_NAV_FLOATING_HEIGHT + 16}px + env(safe-area-inset-bottom))`;

/** Page content padding-bottom clearing a fixed footer above mobile nav */
export function mobileFooterPadding(extraPx = 160) {
  return `calc(${extraPx}px + ${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;
}
