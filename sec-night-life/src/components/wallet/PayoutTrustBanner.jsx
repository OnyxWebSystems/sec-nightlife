import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

/**
 * Shared trust strip for payout bank-detail forms (onboarding + profile wallet).
 */
export default function PayoutTrustBanner({ className = '', compact = false }) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: compact ? '12px 14px' : 16,
        borderRadius: 'var(--radius-xl, 12px)',
        backgroundColor: 'rgba(192, 192, 192, 0.06)',
        border: '1px solid rgba(192, 192, 192, 0.2)',
      }}
    >
      <ShieldCheck
        size={compact ? 18 : 20}
        strokeWidth={1.75}
        style={{ color: 'var(--sec-accent)', flexShrink: 0, marginTop: 1 }}
      />
      <div className="min-w-0 flex-1">
        <p
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            color: 'var(--sec-text-primary)',
            margin: '0 0 4px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          Secure payouts powered by Paystack
          <Lock size={12} style={{ color: 'var(--sec-accent-muted, var(--sec-accent))' }} />
        </p>
        <p
          style={{
            fontSize: compact ? 12 : 13,
            color: 'var(--sec-text-muted)',
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          Your bank details are encrypted and used only to send earnings to your account via Paystack.
          SEC does not use them for any other purpose.
        </p>
      </div>
    </div>
  );
}
