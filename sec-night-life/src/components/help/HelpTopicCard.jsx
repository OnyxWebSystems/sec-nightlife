import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * @param {{ article: { id: string, title: string, summary: string, readMinutes: number }, audience: string }} props
 */
export default function HelpTopicCard({ article, audience }) {
  const to = `${createPageUrl('HelpArticle')}?id=${encodeURIComponent(article.id)}&audience=${audience}`;

  return (
    <Link
      to={to}
      className="block rounded-2xl p-4 transition-transform active:scale-[0.99]"
      style={{
        backgroundColor: 'var(--sec-bg-card)',
        border: '1px solid rgba(192, 192, 192, 0.22)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm" style={{ color: 'var(--sec-text-primary)' }}>
            {article.title}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
            {article.summary}
          </p>
          <span
            className="inline-flex items-center gap-1 mt-2 text-[11px]"
            style={{ color: 'var(--sec-text-muted)' }}
          >
            <Clock className="w-3 h-3" />
            {article.readMinutes} min read
          </span>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-text-muted)' }} />
      </div>
    </Link>
  );
}
