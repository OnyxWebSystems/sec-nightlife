import React from 'react';

/** Lightweight inline spinner while lazy route chunks load — not a full SEC splash. */
export default function RoutePageFallback() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '42vh', padding: '24px 16px' }}
      role="status"
      aria-label="Loading page"
    >
      <div className="sec-spinner" aria-hidden />
    </div>
  );
}
