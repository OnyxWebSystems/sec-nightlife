import React from 'react';

/**
 * UberEats-style checkout breakdown for table bookings.
 */
export default function CheckoutCart({
  lines = [],
  settlementMode = 'PAY_ON_ARRIVAL',
  onSettlementChange,
  showSettlementOptions = false,
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
      {lines.some((l) => l.code === 'platform_fee') ? (
        <p className="text-[10px] leading-relaxed pt-1" style={{ color: 'var(--sec-text-muted)' }}>
          Venue charges (booking, entrance, menu) are split 85% to the venue and 15% to SEC. Joining fees on hosted tables go 85% to the host.
        </p>
      ) : null}
      {showSettlementOptions && onSettlementChange ? (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium" style={{ color: 'var(--sec-text-muted)' }}>
            Minimum spend
          </p>
          {[
            { value: 'PREPAY_MENU', label: 'Pre-select menu to meet minimum' },
            { value: 'PREPAY_LUMP', label: 'Pay minimum spend now' },
            { value: 'PAY_ON_ARRIVAL', label: 'Pay minimum on arrival (booking fee now)' },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="settlement"
                checked={settlementMode === opt.value}
                onChange={() => onSettlementChange(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
