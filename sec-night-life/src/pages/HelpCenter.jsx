import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Mail, LifeBuoy, BookOpen } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { SUPPORT_EMAIL, ADMIN_EMAIL } from '@/constants/contactEmails';
import PageBackHeader from '@/components/layout/PageBackHeader';
import SecLogo from '@/components/ui/SecLogo';

/**
 * Contact / Support hub (App Store Support URL).
 * Interactive guides live at HelpGuides ("Help & Guides").
 */
export default function HelpCenter() {
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ color: 'var(--sec-text-primary)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(192, 192, 192, 0.12), transparent 55%),
            linear-gradient(180deg, #0a0a0b 0%, #000000 50%, #050505 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        style={{ opacity: 0.035 }}
      >
        <SecLogo asset="transparent" size={380} variant="mark" />
      </div>

      <div className="relative z-10">
        <PageBackHeader
          title="Help Center"
          subtitle="Contact support and find policies"
          pageName="HelpCenter"
        />

        <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
          <div className="flex items-center gap-3 px-1">
            <SecLogo asset="transparent" size={32} variant="mark" />
            <p
              className="text-[10px] uppercase tracking-[0.16em] font-medium"
              style={{ color: 'var(--sec-accent)' }}
            >
              SEC Support
            </p>
          </div>

          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid rgba(192, 192, 192, 0.22)',
              boxShadow: '0 0 0 1px rgba(192, 192, 192, 0.05)',
            }}
          >
            <div className="flex items-start gap-3 mb-2">
              <LifeBuoy className="w-6 h-6 shrink-0" style={{ color: 'var(--sec-accent)' }} />
              <div>
                <p className="font-semibold">Contact support</p>
                <p className="text-sm mt-1" style={{ color: 'var(--sec-text-secondary)' }}>
                  For account issues, payments, or safety concerns, email us and we&apos;ll get back to
                  you.
                </p>
              </div>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 font-medium mt-3"
              style={{ color: 'var(--sec-accent)' }}
            >
              <Mail className="w-5 h-5" />
              {SUPPORT_EMAIL}
            </a>
            <a
              href={`mailto:${ADMIN_EMAIL}`}
              className="inline-flex items-center gap-2 font-medium mt-2"
              style={{ color: 'var(--sec-accent)' }}
            >
              <Mail className="w-5 h-5" />
              {ADMIN_EMAIL}
            </a>
          </div>

          <Link
            to={createPageUrl('HelpGuides')}
            className="rounded-2xl p-6 flex items-start gap-3 transition-colors"
            style={{
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid rgba(192, 192, 192, 0.22)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <BookOpen className="w-6 h-6 shrink-0" style={{ color: 'var(--sec-accent)' }} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Help &amp; Guides</p>
              <p className="text-sm mt-1" style={{ color: 'var(--sec-text-secondary)' }}>
                How-tos, FAQs, and step-by-step guides for party-goers and venues.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
          </Link>

          <div
            className="rounded-2xl p-5"
            style={{
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid rgba(192, 192, 192, 0.22)',
            }}
          >
            <p className="font-semibold mb-2">Safety</p>
            <p className="text-sm" style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.55 }}>
              Report or block abusive users from their profile. Blocks notify our safety team and
              remove their content from your feed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
