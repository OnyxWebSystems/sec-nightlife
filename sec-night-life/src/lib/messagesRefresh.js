/** Notify Layout to refresh notification / message badge counts immediately. */
export function dispatchMessagesRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sec_notifications_refresh'));
  }
}
