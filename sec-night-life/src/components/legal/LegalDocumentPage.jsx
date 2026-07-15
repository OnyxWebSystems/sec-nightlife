import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import SecLogo from '@/components/ui/SecLogo';

/**
 * Standard shell: back header + branded document surface for legal / policy pages.
 */
export default function LegalDocumentPage({ title, effectiveDate, children }) {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ color: 'var(--sec-text-primary)' }}
    >
      {/* Silver / black atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(192, 192, 192, 0.14), transparent 55%),
            radial-gradient(ellipse 60% 40% at 100% 80%, rgba(192, 192, 192, 0.06), transparent 50%),
            linear-gradient(180deg, #0a0a0b 0%, #000000 45%, #050505 100%)
          `,
        }}
      />

      {/* Watermark logo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ opacity: 0.04 }}
      >
        <SecLogo asset="transparent" size={420} variant="mark" />
      </div>

      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{
          backgroundColor: 'rgba(10, 10, 11, 0.85)',
          borderColor: 'rgba(192, 192, 192, 0.18)',
        }}
      >
        <div className="px-4 py-3.5 flex items-center gap-3 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors"
            style={{
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid rgba(192, 192, 192, 0.2)',
            }}
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] uppercase tracking-[0.16em] font-medium truncate"
              style={{ color: 'var(--sec-accent)' }}
            >
              SEC Legal
            </p>
            <h1 className="text-lg font-bold truncate leading-tight">{title}</h1>
          </div>
          <SecLogo asset="transparent" size={28} variant="mark" className="shrink-0 opacity-90" />
        </div>
      </header>

      <div className="relative z-10 px-4 py-8 max-w-2xl mx-auto">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background:
              'linear-gradient(145deg, rgba(28, 28, 30, 0.95) 0%, rgba(14, 14, 16, 0.98) 100%)',
            border: '1px solid rgba(192, 192, 192, 0.22)',
            boxShadow:
              '0 0 0 1px rgba(192, 192, 192, 0.06), 0 24px 48px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Silver accent edge */}
          <div
            aria-hidden
            style={{
              height: 2,
              background: 'linear-gradient(90deg, transparent, var(--sec-silver, #C0C0C0), transparent)',
            }}
          />

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <SecLogo asset="transparent" size={36} variant="mark" />
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
                  {effectiveDate ? (
                    <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                      {effectiveDate}
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                aria-hidden
                style={{
                  height: 1,
                  background:
                    'linear-gradient(90deg, var(--sec-silver, #C0C0C0), rgba(192, 192, 192, 0.15), transparent)',
                  opacity: 0.55,
                }}
              />
            </div>

            <div className="space-y-6">{children}</div>
          </div>
        </div>

        <p
          className="text-center text-[11px] mt-6 tracking-wide"
          style={{ color: 'var(--sec-text-muted)' }}
        >
          Social Entertainment Collective
        </p>
      </div>
    </div>
  );
}
