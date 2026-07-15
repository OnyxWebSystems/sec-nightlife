import React from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Mail,
  Sparkles,
  CreditCard,
  Building2,
  UserCircle,
  LifeBuoy,
} from 'lucide-react';
import { createPageUrl } from '@/utils';
import { usePreferences } from '@/context/PreferencesContext';
import { getHelpCenterLegalNavItems } from '@/legal/legalNavItems';
import { SUPPORT_EMAIL, ADMIN_EMAIL } from '@/constants/contactEmails';
import PageBackHeader from '@/components/layout/PageBackHeader';
import SecLogo from '@/components/ui/SecLogo';

function PlaceholderTopic({ icon: Icon, title, description }) {
  return (
    <div
      className="rounded-2xl p-4 flex gap-3"
      style={{
        backgroundColor: 'var(--sec-bg-card)',
        border: '1px solid var(--sec-border)',
        opacity: 0.92,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}
      >
        <Icon className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm" style={{ color: 'var(--sec-text-primary)' }}>
          {title}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
          {description}
        </p>
        <span
          className="inline-block mt-2 text-[11px] font-medium uppercase tracking-wide"
          style={{ color: 'var(--sec-text-muted)' }}
        >
          Coming soon
        </span>
      </div>
    </div>
  );
}

export default function HelpCenter() {
  const { t } = usePreferences();
  const legalLinks = getHelpCenterLegalNavItems(t);

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
          subtitle="Guides and answers — expanding soon"
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
                  For account issues, payments, or safety concerns, email us and we&apos;ll get back to you.
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

          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--sec-text-muted)' }}>
              Browse topics (placeholders)
            </h2>
            <div className="space-y-3">
              <PlaceholderTopic
                icon={Sparkles}
                title="Getting started"
                description="Account setup, profile, notifications, and finding events. Full articles will appear here."
              />
              <PlaceholderTopic
                icon={CreditCard}
                title="Payments & refunds"
                description="Paystack checkout, tables, tickets, boosts, and how refunds work with venues."
              />
              <PlaceholderTopic
                icon={UserCircle}
                title="Tables, hosts & jobs"
                description="Joining tables, hosting house parties, and promoter applications."
              />
              <PlaceholderTopic
                icon={Building2}
                title="For venues & businesses"
                description="Onboarding, compliance documents, promotions, and your dashboard."
              />
            </div>
          </div>

          <div
            className="rounded-2xl p-5"
            style={{
              backgroundColor: 'var(--sec-bg-elevated)',
              border: '1px dashed var(--sec-border)',
            }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--sec-text-primary)' }}>
              Search & FAQs
            </p>
            <p className="text-xs" style={{ color: 'var(--sec-text-muted)', lineHeight: 1.55 }}>
              A searchable help library and frequently asked questions are not available yet. We&apos;re building this section
              out—check back after the next app update.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--sec-text-muted)' }}>
              {t('legalDocuments')}
            </h2>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'var(--sec-bg-card)',
                border: '1px solid rgba(192, 192, 192, 0.22)',
              }}
            >
              {legalLinks.map((item, index) => (
                <Link
                  key={item.key}
                  to={createPageUrl(item.page)}
                  className="flex items-center gap-4 p-4 transition-colors"
                  style={
                    index !== legalLinks.length - 1
                      ? { borderBottom: '1px solid rgba(192, 192, 192, 0.12)' }
                      : {}
                  }
                >
                  <div className="flex-1">
                    <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                      {item.label}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
