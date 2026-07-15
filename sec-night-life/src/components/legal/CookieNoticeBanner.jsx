import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { createPageUrl } from '@/utils';

const COOKIE_NOTICE_KEY = 'sec_cookie_notice_v1';

/**
 * Minimal first-visit cookie notice for browser only (skipped on native).
 */
export default function CookieNoticeBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (Capacitor.isNativePlatform()) return;
    try {
      if (localStorage.getItem(COOKIE_NOTICE_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-0 inset-x-0 z-[80] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        className="mx-auto max-w-3xl rounded-2xl border border-[var(--sec-border)] p-4 shadow-lg flex flex-col sm:flex-row gap-3 sm:items-center"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', color: 'var(--sec-text-primary)' }}
      >
        <p className="text-sm flex-1" style={{ color: 'var(--sec-text-secondary)' }}>
          We use essential cookies and similar storage to run SEC securely, plus limited session data for the home feed.
          See our{' '}
          <Link to={createPageUrl('CookiePolicy')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
            Cookie Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: 'var(--sec-accent)', color: '#0A0A0B' }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
