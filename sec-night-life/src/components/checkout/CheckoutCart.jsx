import React from 'react';

export const CHECKOUT_FOOTNOTES = {
  venue:
    'Your total includes everything due now. SEC retains 15% of that amount; the venue receives 85%.',
  venueHost:
    'Your total includes everything due now. SEC retains 15%; the venue receives 85%. After payment you can set table rules in Host Dashboard.',
  hostedJoin:
    'Your total includes entrance (if any), joining fee, and menu items due now.',
  hostedMenu:
    'Menu orders are split 85% to the venue and 15% to SEC.',
};

/**
 * Checkout breakdown for table bookings.
 * SEC's 15% is taken from the total — not shown as a separate line item.
 */
export default function CheckoutCart({
  lines = [],
  settlementMode = 'PREPAY_MENU',
  onSettlementChange,
  showSettlementOptions = false,
  minimumSpendZar = 0,
  footnote,
}) {
  const total = lines.reduce((s, l) => s + Number(l.amount_zar || 0), 0);

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--sec-text-primary)' }}>
        Order summary
      </h3>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.code} className="flex justify-between text-sm">
            <span style={{ color: 'var(--sec-text-secondary)' }}>{l.label}</span>
            <span style={{ color: 'var(--sec-text-primary)' }}>R{Number(l.amount_zar).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      {lines.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>No charges yet.</p>
      ) : null}
      <div className="border-t pt-2 flex justify-between font-semibold text-sm" style={{ borderColor: 'var(--sec-border)' }}>
        <span>Total due now</span>
        <span style={{ color: 'var(--sec-accent)' }}>R{total.toFixed(2)}</span>
      </div>
      {lines.length > 0 && footnote ? (
        <p className="text-[10px] leading-relaxed pt-1" style={{ color: 'var(--sec-text-muted)' }}>
          {footnote}
        </p>
      ) : null}
      {showSettlementOptions && Number(minimumSpendZar) > 0 ? (
        <p className="text-xs pt-2" style={{ color: 'var(--sec-text-muted)' }}>
          Select menu items to meet the minimum spend (R{Number(minimumSpendZar).toFixed(0)}) before checkout.
        </p>
      ) : null}
    </div>
  );
}
