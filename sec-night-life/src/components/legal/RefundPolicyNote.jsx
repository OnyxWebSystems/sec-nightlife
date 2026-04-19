import React from 'react';
import LegalDocLink from '@/components/legal/LegalDocLink';

/** One-line disclosure for checkout / paid actions */
export default function RefundPolicyNote({ className = '', style = {} }) {
  return (
    <p className={`text-xs ${className}`} style={{ color: 'var(--sec-text-muted)', ...style }}>
      See our{' '}
      <LegalDocLink pageName="RefundPolicy">Refund Policy</LegalDocLink> for how payments and refunds work.
    </p>
  );
}
