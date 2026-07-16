import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { getHelpArticle } from '@/help/catalog';
import HelpScreenshot from './HelpScreenshot';

function Callout({ variant, title, text }) {
  const icon =
    variant === 'warning' ? AlertTriangle : variant === 'tip' ? Lightbulb : Info;
  const Icon = icon;
  const accent =
    variant === 'warning'
      ? 'var(--sec-error, #f87171)'
      : variant === 'tip'
        ? 'var(--sec-accent)'
        : 'rgba(192, 192, 192, 0.85)';

  return (
    <div
      className="rounded-2xl p-4 my-4 flex gap-3"
      style={{
        backgroundColor: 'var(--sec-bg-elevated)',
        border: `1px solid ${variant === 'warning' ? 'rgba(248, 113, 113, 0.35)' : 'var(--sec-border)'}`,
      }}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: accent }} />
      <div className="min-w-0">
        {title ? (
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--sec-text-primary)' }}>
            {title}
          </p>
        ) : null}
        <p className="text-sm" style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.55 }}>
          {text}
        </p>
      </div>
    </div>
  );
}

/**
 * @param {{ sections: import('@/help/types').HelpSection[], audience: string }} props
 */
export default function HelpArticleBody({ sections, audience }) {
  return (
    <div className="space-y-1">
      {sections.map((section, index) => {
        const key = `${section.type}-${index}`;

        if (section.type === 'heading') {
          return (
            <h2
              key={key}
              className="text-base font-semibold pt-5 pb-2"
              style={{ color: 'var(--sec-text-primary)' }}
            >
              {section.text}
            </h2>
          );
        }

        if (section.type === 'p') {
          return (
            <p
              key={key}
              className="text-sm"
              style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.65 }}
            >
              {section.text}
            </p>
          );
        }

        if (section.type === 'steps') {
          return (
            <ol key={key} className="my-4 space-y-3 list-none pl-0">
              {section.items.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--sec-bg-elevated)',
                      border: '1px solid var(--sec-border)',
                      color: 'var(--sec-accent)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <p
                    className="text-sm pt-1"
                    style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.55 }}
                  >
                    {item}
                  </p>
                </li>
              ))}
            </ol>
          );
        }

        if (section.type === 'image') {
          return (
            <HelpScreenshot
              key={key}
              src={section.src}
              alt={section.alt}
              caption={section.caption}
              path={section.path}
              illustrative={section.illustrative}
            />
          );
        }

        if (section.type === 'callout' || section.type === 'tip' || section.type === 'warning') {
          return (
            <Callout
              key={key}
              variant={section.type === 'callout' ? 'info' : section.type}
              title={section.title}
              text={section.text}
            />
          );
        }

        if (section.type === 'related') {
          const related = (section.ids || []).map((id) => getHelpArticle(id)).filter(Boolean);

          if (!related.length) return null;

          return (
            <div key={key} className="pt-6 mt-6" style={{ borderTop: '1px solid rgba(192, 192, 192, 0.12)' }}>
              <p
                className="text-xs font-semibold uppercase tracking-wide mb-3"
                style={{ color: 'var(--sec-text-muted)' }}
              >
                Related guides
              </p>
              <div className="space-y-2">
                {related.map((article) => (
                  <Link
                    key={article.id}
                    to={`${createPageUrl('HelpArticle')}?id=${encodeURIComponent(article.id)}&audience=${audience}`}
                    className="block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--sec-bg-elevated)',
                      color: 'var(--sec-text-primary)',
                      border: '1px solid var(--sec-border)',
                    }}
                  >
                    {article.title}
                  </Link>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
