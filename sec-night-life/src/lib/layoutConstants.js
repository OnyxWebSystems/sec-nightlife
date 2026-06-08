/** Height of the mobile bottom tab bar in Layout.jsx */
export const MOBILE_NAV_HEIGHT = 64;

/** CSS bottom offset so fixed footers sit above the mobile nav */
export const MOBILE_NAV_BOTTOM_OFFSET = `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;

/** Page content padding-bottom clearing a fixed footer above mobile nav */
export function mobileFooterPadding(extraPx = 160) {
  return `calc(${extraPx}px + ${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;
}
