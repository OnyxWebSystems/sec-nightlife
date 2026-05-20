/** SEC platform fee rate — taken from gross (not added on top). */
export const PLATFORM_FEE_RATE = 0.15;
export const RECIPIENT_SHARE_RATE = 0.85;

/**
 * Split a customer payment: 15% SEC, 85% venue or host.
 * secAmount + recipientAmount always equals gross (within rounding).
 */
export function splitPlatformGross(grossZar) {
  const gross = Math.round((Number(grossZar) || 0) * 100) / 100;
  if (gross <= 0) {
    return { gross: 0, secAmount: 0, recipientAmount: 0 };
  }
  const secAmount = Math.round(gross * PLATFORM_FEE_RATE * 100) / 100;
  const recipientAmount = Math.round((gross - secAmount) * 100) / 100;
  return { gross, secAmount, recipientAmount };
}

/** @deprecated alias */
export const splitSecPlatform = splitPlatformGross;
