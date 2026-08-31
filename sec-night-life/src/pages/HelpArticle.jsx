import React, { useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { createPageUrl } from '@/utils';
import PageBackHeader from '@/components/layout/PageBackHeader';
import SecLogo from '@/components/ui/SecLogo';
import HelpArticleBody from '@/components/help/HelpArticleBody';
import { getHelpArticle } from '@/help/catalog';

export default function HelpArticle() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id') || '';
  const audienceParam = searchParams.get('audience');
  const audience =
    audienceParam === 'venue' || audienceParam === 'partygoer' ? audienceParam : 'partygoer';

  const article = useMemo(() => getHelpArticle(id), [id]);

  const backTo = `${createPageUrl('HelpGuides')}?audience=${audience}`;
  const goBack = useCallback(() => {
    navigate(backTo);
  }, [navigate, backTo]);

  if (!article) {
    return (
      <div className="min-h-screen" style={{ color: 'var(--sec-text-primary)' }}>
        <PageBackHeader title="Guide not found" pageName="HelpArticle" onBack={goBack} />
        <div className="px-4 py-8 max-w-xl mx-auto text-center space-y-4">
          <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
            We couldn&apos;t find that help article.
          </p>
          <Link to={backTo} className="text-sm font-semibold" style={{ color: 'var(--sec-accent)' }}>
            Back to Help &amp; Guides
          </Link>
        </div>
      </div>
    );
  }

  const audienceLabel =
    article.audience === 'venue'
      ? 'Venue'
      : article.audience === 'partygoer'
        ? 'Party-Goer'
        : 'Everyone';

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
            radial-gradient(ellipse 70% 40% at 50% -8%, rgba(192, 192, 192, 0.1), transparent 50%),
            linear-gradient(180deg, #0a0a0b 0%, #000000 60%, #050505 100%)
          `,
        }}
      />

      <div className="relative z-10">
        <PageBackHeader
          title="Guide"
          subtitle={article.title}
          pageName="HelpArticle"
          onBack={goBack}
        />

        <article className="px-4 py-6 max-w-xl mx-auto pb-16">
          <div className="flex items-center gap-2 mb-4">
            <SecLogo asset="transparent" size={28} variant="mark" />
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-medium px-2.5 py-1 rounded-full"
              style={{
                color: 'var(--sec-accent)',
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
              }}
            >
              {audienceLabel}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[11px] ml-auto"
              style={{ color: 'var(--sec-text-muted)' }}
            >
              <Clock className="w-3 h-3" />
              {article.readMinutes} min
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--sec-text-primary)' }}>
            {article.title}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--sec-text-muted)', lineHeight: 1.55 }}>
            {article.summary}
          </p>

          <HelpArticleBody sections={article.sections} audience={audience} />

          <div className="mt-10 pt-6" style={{ borderTop: '1px solid rgba(192, 192, 192, 0.12)' }}>
            <Link
              to={backTo}
              className="text-sm font-semibold"
              style={{ color: 'var(--sec-accent)' }}
            >
              ← All guides for {audience === 'venue' ? 'venues' : 'party-goers'}
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
