import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * @param {{ value: string, onChange: (v: string) => void, placeholder?: string }} props
 */
export default function HelpSearch({ value, onChange, placeholder = 'Search guides & FAQs' }) {
  return (
    <div
      className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
      style={{
        backgroundColor: 'var(--sec-bg-card)',
        border: '1px solid rgba(192, 192, 192, 0.22)',
      }}
    >
      <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm outline-none"
        style={{ color: 'var(--sec-text-primary)' }}
        aria-label="Search help"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="p-1 rounded-lg"
          aria-label="Clear search"
          style={{ color: 'var(--sec-text-muted)' }}
        >
          <X className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  );
}
