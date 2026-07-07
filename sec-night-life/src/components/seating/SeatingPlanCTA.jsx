import React from 'react';
import { Map, ChevronRight } from 'lucide-react';

export default function SeatingPlanCTA({ plan, planCount = 1, onView, className = '' }) {
  if (!plan?.imageUrl) return null;

  const total = Math.max(planCount, 1);
  const showCount = total > 1;

  return (
    <button
      type="button"
      onClick={onView}
      className={`w-full text-left rounded-2xl overflow-hidden transition-transform active:scale-[0.99] ${className}`}
      style={{
        border: '1px solid rgba(192, 192, 192, 0.35)',
        background:
          'linear-gradient(135deg, rgba(192, 192, 192, 0.12) 0%, rgba(20, 20, 22, 0.95) 55%, rgba(10, 10, 11, 0.98) 100%)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div className="flex items-center gap-4 p-4">
        <div
          className="w-14 h-14 rounded-xl shrink-0 overflow-hidden flex items-center justify-center relative"
          style={{
            border: '1px solid var(--sec-accent-border)',
            background: 'var(--sec-bg-elevated)',
          }}
        >
          <img
            src={plan.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
          {showCount ? (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ background: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
            >
              {total}
            </span>
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Map size={14} style={{ color: 'var(--sec-accent)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sec-accent)' }}>
              Seating plan{showCount ? 's' : ''}
            </span>
          </div>
          <p className="font-semibold truncate" style={{ color: 'var(--sec-text-primary)' }}>
            {plan.name || 'View floor plan'}
          </p>
          {plan.caption ? (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--sec-text-muted)' }}>
              {plan.caption}
            </p>
          ) : (
            <p className="text-xs mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
              {showCount
                ? `${total} floor plans — swipe to browse before you book`
                : 'See where you\'ll be seated before you book'}
            </p>
          )}
        </div>
        <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
      </div>
    </button>
  );
}
