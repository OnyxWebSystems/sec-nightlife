import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ChevronLeft,
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

const SUPPORT_WHATSAPP_NUMBER = '+27 71 434 3982';
const SUPPORT_WHATSAPP_LINK = 'https://wa.me/27714343982';

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
  const navigate = useNavigate();
  const { t } = usePreferences();
  const legalLinks = getHelpCenterLegalNavItems(t);

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
          <div>
            <h1 className="text-xl font-bold">Help Center</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
              Guides and answers — expanding soon
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
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
          <p className="text-sm mt-3" style={{ color: 'var(--sec-text-secondary)' }}>
            WhatsApp:{' '}
            <a href={SUPPORT_WHATSAPP_LINK} target="_blank" rel="noreferrer" className="font-medium underline" style={{ color: 'var(--sec-accent)' }}>
              {SUPPORT_WHATSAPP_NUMBER}
            </a>
          </p>
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
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
          >
            {legalLinks.map((item, index) => (
              <Link
                key={item.key}
                to={createPageUrl(item.page)}
                className="flex items-center gap-4 p-4 transition-colors"
                style={
                  index !== legalLinks.length - 1
                    ? { borderBottom: '1px solid var(--sec-border)' }
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
  );
}
