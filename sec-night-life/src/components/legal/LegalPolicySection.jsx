import React from 'react';

/** Shared section block for in-app legal pages (Privacy, Terms, etc.) */
export function LegalPolicySection({ title, children }) {
  return (
    <section className="space-y-2.5 pt-1">
      <h2
        className="font-semibold text-base flex items-center gap-2"
        style={{ color: 'var(--sec-text-primary)' }}
      >
        <span
          aria-hidden
          className="inline-block w-1 h-4 rounded-full shrink-0"
          style={{ background: 'linear-gradient(180deg, var(--sec-silver, #C0C0C0), rgba(192, 192, 192, 0.35))' }}
        />
        {title}
      </h2>
      <div
        className="text-sm space-y-2 pl-3"
        style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.7 }}
      >
        {children}
      </div>
    </section>
  );
}
