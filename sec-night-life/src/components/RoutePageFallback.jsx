import React from 'react';

/** Inline route loading — keeps Layout visible while lazy chunks load. */
export default function RoutePageFallback() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ minHeight: '42vh', paddingTop: 24, paddingBottom: 24 }}
    >
      <div
        className="h-9 w-9 rounded-full border-2 animate-spin"
        style={{
          borderColor: 'var(--sec-border)',
          borderTopColor: 'var(--sec-accent, #e5e5e5)',
        }}
        aria-hidden
      />
      <span className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
        Loading…
      </span>
    </div>
  );
}
