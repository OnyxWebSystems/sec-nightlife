/** Mirror of backend template keys for controlled table messaging UI. */

export const VENUE_DECLINE_TEMPLATES = [
  { key: 'decline_increase_min_spend', label: 'Need higher minimum spend' },
  { key: 'decline_add_menu_items', label: 'Add more menu items' },
  { key: 'decline_no_tables_datetime', label: 'No tables for date/time' },
  { key: 'decline_too_many_guests', label: 'Too many guests' },
  { key: 'decline_date_unavailable', label: 'Date unavailable' },
];

export const GUEST_REPLY_TEMPLATES = [
  { key: 'guest_will_increase_spend', label: 'I can increase spend' },
  { key: 'guest_will_reduce_guests', label: 'I can reduce guests' },
  { key: 'guest_will_change_datetime', label: 'I can change date/time' },
  { key: 'guest_will_add_menu_items', label: 'I will add menu items' },
  { key: 'guest_cancel_request', label: 'Cancel my request' },
];

export const VENUE_ARRIVAL_TEMPLATES = [
  { key: 'confirm_arrival_time', label: 'Confirm arrival time' },
  { key: 'running_late', label: 'Running late' },
  { key: 'need_guest_count', label: 'Confirm guest count' },
  { key: 'menu_question', label: 'Menu question' },
  { key: 'see_you_tonight', label: 'See you tonight' },
];

export function formatMenuLines(selectedMenuItems, menuItems = []) {
  if (!Array.isArray(selectedMenuItems) || !selectedMenuItems.length) return [];
  return selectedMenuItems.map((line) => {
    const id = line.menuItemId || line.menu_item_id;
    const row = menuItems.find((m) => m.id === id);
    const qty = Number(line.quantity) || 1;
    const price = row?.price != null ? Number(row.price) : 0;
    return {
      label: row?.name || 'Item',
      qty,
      lineTotal: price * qty,
    };
  });
}
