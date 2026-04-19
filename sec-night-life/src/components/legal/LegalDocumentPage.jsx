import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Standard shell: back header + max-width column + optional effective date + card body.
 */
export default function LegalDocumentPage({ title, effectiveDate, children }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
      >
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        {effectiveDate ? (
          <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
            {effectiveDate}
          </p>
        ) : null}
        <div
          className="rounded-2xl p-6 space-y-6"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
