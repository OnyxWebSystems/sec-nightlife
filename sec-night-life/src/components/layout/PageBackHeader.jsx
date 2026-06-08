import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * Sticky back header for drill-down pages (business tools, settings subpages).
 */
export default function PageBackHeader({ title, subtitle, onBack, fallbackTo = 'BusinessDashboard' }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    if (fallbackTo) {
      navigate(createPageUrl(fallbackTo));
      return;
    }
    navigate(-1);
  };

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'rgba(10, 10, 11, 0.92)',
        borderColor: 'var(--sec-border)',
      }}
    >
      <div className="px-4 py-3 flex items-center gap-3 min-h-[44px]">
        <button
          type="button"
          onClick={handleBack}
          className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0 transition-colors hover:ring-1 hover:ring-[var(--sec-accent)]/30"
          style={{ backgroundColor: 'var(--sec-bg-card)' }}
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
        </button>
        <div className="min-w-0">
          {title ? (
            <h1 className="text-lg font-bold truncate" style={{ color: 'var(--sec-text-primary)' }}>
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="text-xs truncate" style={{ color: 'var(--sec-text-muted)' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
