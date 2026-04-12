import React from 'react';
import { Star } from 'lucide-react';

/** Visual star row with partial fill (e.g. 4.3 → 4 full + partial). */
export function StarRatingDisplay({ value = 0, size = 18, className = '' }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${v.toFixed(1)} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, v - i));
        return (
          <span key={i} className="relative inline-block shrink-0" style={{ width: size, height: size }}>
            <Star
              className="absolute left-0 top-0 text-zinc-600"
              strokeWidth={1.5}
              style={{ width: size, height: size }}
            />
            <span
              className="absolute left-0 top-0 overflow-hidden text-amber-400 pointer-events-none"
              style={{ width: `${fill * 100}%` }}
            >
              <Star className="fill-amber-400 text-amber-400" strokeWidth={1.5} style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Tappable star input (1–5). */
export function StarRatingInput({ value, onChange, size = 44 }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="p-0 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg hover:bg-white/5"
          onClick={() => onChange(n)}
          aria-pressed={value >= n}
        >
          <Star
            className={value >= n ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}
            strokeWidth={1.5}
            style={{ width: size * 0.45, height: size * 0.45 }}
          />
        </button>
      ))}
    </div>
  );
}
