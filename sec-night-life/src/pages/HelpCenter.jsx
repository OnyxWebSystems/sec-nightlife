import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Mail, BookOpen } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { usePreferences } from '@/context/PreferencesContext';
import { getHelpCenterLegalNavItems } from '@/legal/legalNavItems';

export default function HelpCenter() {
  const navigate = useNavigate();
  const { t } = usePreferences();
  const legalLinks = getHelpCenterLegalNavItems(t);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">Help Center</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <p className="mb-4" style={{ color: 'var(--sec-text-secondary)' }}>
            If you need help with SEC Nightlife, contact us at:
          </p>
          <a
            href="mailto:support@secnightlife.com"
            className="inline-flex items-center gap-2 font-medium"
            style={{ color: 'var(--sec-accent)' }}
          >
            <Mail className="w-5 h-5" />
            support@secnightlife.com
          </a>
          <p className="mt-4 text-sm" style={{ color: 'var(--sec-text-muted)' }}>
            Our team will respond as soon as possible.
          </p>
        </div>

        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
            <h2 className="font-semibold text-lg">Help articles</h2>
          </div>
          <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
            Step-by-step guides and FAQs are coming soon. In the meantime, review our policies below.
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
