/** Whether a ticket tier offers paid venue-menu add-ons at checkout. */
export function ticketTierAllowsMenuAddons(tier, event = null) {
  if (tier && typeof tier === 'object') {
    if (tier.allows_menu_addons === true || tier.allowsMenuAddons === true) return true;
    if (tier.allows_menu_addons === false || tier.allowsMenuAddons === false) return false;
  }
  return Boolean(event?.allows_ticket_menu_addons || event?.allowsTicketMenuAddons);
}
