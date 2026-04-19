import React from 'react';

/** Shared section block for in-app legal pages (Privacy, Terms, etc.) */
export function LegalPolicySection({ title, children }) {
  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-base" style={{ color: 'var(--sec-text-primary)' }}>
        {title}
      </h2>
      <div className="text-sm space-y-2" style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  );
}
