import React, { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Mail, LifeBuoy, BookOpen } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { usePreferences } from '@/context/PreferencesContext';
import { getHelpCenterLegalNavItems } from '@/legal/legalNavItems';
import { SUPPORT_EMAIL, ADMIN_EMAIL } from '@/constants/contactEmails';
import PageBackHeader from '@/components/layout/PageBackHeader';
import SecLogo from '@/components/ui/SecLogo';
import HelpRoleTabs from '@/components/help/HelpRoleTabs';
import HelpSearch from '@/components/help/HelpSearch';
import HelpTopicCard from '@/components/help/HelpTopicCard';
import HelpFaqList from '@/components/help/HelpFaqList';
import { groupArticlesByCategory, resolveDefaultAudience, searchHelp } from '@/help/search';

export default function HelpCenter() {
  const { t } = usePreferences();
  const legalLinks = getHelpCenterLegalNavItems(t);
  const [searchParams, setSearchParams] = useSearchParams();

  const [audience, setAudience] = useState(() => {
    const fromUrl = searchParams.get('audience');
    if (fromUrl === 'venue' || fromUrl === 'partygoer') return fromUrl;
    return resolveDefaultAudience();
  });
  const [query, setQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    const next = new URLSearchParams();
    if (audience === 'venue') next.set('audience', 'venue');
    if (query.trim()) next.set('q', query.trim());
    setSearchParams(next, { replace: true });
  }, [audience, query, setSearchParams]);

  const { articles, faqs, isEmptyQuery } = useMemo(
    () => searchHelp(query, audience),
    [query, audience]
  );

  const groups = useMemo(() => groupArticlesByCategory(audience), [audience]);

  const searching = !isEmptyQuery;

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
          subtitle="Guides, FAQs, and support"
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

          <HelpRoleTabs audience={audience} onChange={setAudience} />

          <HelpSearch value={query} onChange={setQuery} />

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

          {searching ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--sec-text-muted)' }}>
                  <BookOpen className="w-4 h-4" />
                  Guides ({articles.length})
                </h2>
                {articles.length ? (
                  <div className="space-y-3">
                    {articles.map((article) => (
                      <HelpTopicCard key={article.id} article={article} audience={audience} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                    No guides match &ldquo;{query.trim()}&rdquo;. Try another keyword or clear search.
                  </p>
                )}
              </div>
              <div>
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--sec-text-muted)' }}>
                  FAQs ({faqs.length})
                </h2>
                <HelpFaqList faqs={faqs} audience={audience} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--sec-text-muted)' }}>
                  Browse topics
                </h2>
                <div className="space-y-6">
                  {groups.map((group) => (
                    <div key={group.id}>
                      <div className="px-1 mb-2">
                        <p className="text-sm font-semibold" style={{ color: 'var(--sec-text-primary)' }}>
                          {group.label}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
                          {group.description}
                        </p>
                      </div>
                      <div className="space-y-3">
                        {group.articles.map((article) => (
                          <HelpTopicCard key={article.id} article={article} audience={audience} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--sec-text-muted)' }}>
                  Search &amp; FAQs
                </h2>
                <p className="text-xs mb-3 px-1" style={{ color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
                  Use the search box above, or browse common questions for{' '}
                  {audience === 'venue' ? 'venues' : 'party-goers'}.
                </p>
                <HelpFaqList faqs={faqs} audience={audience} />
              </div>
            </>
          )}

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
