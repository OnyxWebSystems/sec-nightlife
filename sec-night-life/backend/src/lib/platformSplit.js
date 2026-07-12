/** SEC platform fee rate — taken from gross (not added on top). */
export const PLATFORM_FEE_RATE = 0.15;
export const RECIPIENT_SHARE_RATE = 0.85;

/** Ticket-tier only: 4% SEC / 96% venue (menu add-ons still use PLATFORM_FEE_RATE). */
export const TICKET_PLATFORM_FEE_RATE = 0.04;
export const TICKET_RECIPIENT_SHARE_RATE = 0.96;

/**
 * Split a customer payment: 15% SEC, 85% venue or host.
 * secAmount + recipientAmount always equals gross (within rounding).
 */
export function splitPlatformGross(grossZar) {
  return splitGrossAtRate(grossZar, PLATFORM_FEE_RATE);
}

/**
 * Split ticket-tier gross: 4% SEC, 96% venue.
 */
export function splitTicketGross(grossZar) {
  return splitGrossAtRate(grossZar, TICKET_PLATFORM_FEE_RATE);
}

function splitGrossAtRate(grossZar, rate) {
  const gross = Math.round((Number(grossZar) || 0) * 100) / 100;
  if (gross <= 0) {
    return { gross: 0, secAmount: 0, recipientAmount: 0 };
  }
  const secAmount = Math.round(gross * rate * 100) / 100;
  const recipientAmount = Math.round((gross - secAmount) * 100) / 100;
  return { gross, secAmount, recipientAmount };
}

/**
 * Combined ticket checkout split: ticket subtotal at 4%, menu add-ons at 15%.
 */
export function splitTicketCheckoutAmounts(ticketSubtotalZar, menuTotalZar = 0) {
  const ticketSplit = splitTicketGross(ticketSubtotalZar);
  const menuSplit = Number(menuTotalZar) > 0 ? splitPlatformGross(menuTotalZar) : { secAmount: 0, recipientAmount: 0 };
  const gross = Math.round((ticketSplit.gross + (Number(menuTotalZar) > 0 ? menuSplit.gross : 0)) * 100) / 100;
  const secAmount = Math.round((ticketSplit.secAmount + menuSplit.secAmount) * 100) / 100;
  const recipientAmount = Math.round((ticketSplit.recipientAmount + menuSplit.recipientAmount) * 100) / 100;
  return { gross, secAmount, recipientAmount, ticketSplit, menuSplit };
}

/** @deprecated alias */
export const splitSecPlatform = splitPlatformGross;
