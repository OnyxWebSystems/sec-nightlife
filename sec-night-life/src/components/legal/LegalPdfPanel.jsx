import React from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * In-app PDF viewer + open-in-new-tab fallback.
 */
export default function LegalPdfPanel({
  title,
  pdfSrc,
  intro,
  effectiveDate,
}) {
  return (
    <div className="space-y-4">
      {effectiveDate ? (
        <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
          Effective {effectiveDate}
        </p>
      ) : null}
      {intro ? (
        <p style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>{intro}</p>
      ) : null}

      <div
        className="rounded-xl overflow-hidden border"
        style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-elevated)' }}
      >
        <iframe
          title={title}
          src={pdfSrc}
          className="w-full min-h-[70vh] border-0"
        />
      </div>

      <a
        href={pdfSrc}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium"
        style={{ color: 'var(--sec-accent)' }}
      >
        <ExternalLink className="w-4 h-4" />
        Open {title} in a new tab
      </a>
    </div>
  );
}
