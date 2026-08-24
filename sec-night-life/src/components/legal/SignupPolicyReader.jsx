import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { LegalViewerProvider } from '@/components/legal/LegalViewerContext';
import RoutePageFallback from '@/components/RoutePageFallback';

export const SIGNUP_POLICY_PAGES = ['UserAgreement', 'TermsOfService', 'PrivacyPolicy'];

const POLICY_COMPONENTS = {
  UserAgreement: lazy(() => import('@/pages/UserAgreement')),
  TermsOfService: lazy(() => import('@/pages/TermsOfService')),
  PrivacyPolicy: lazy(() => import('@/pages/PrivacyPolicy')),
};

/**
 * Full-screen reader for Register: no account required, no app navigation,
 * back/close returns to the signup form.
 */
export default function SignupPolicyReader({ page, onClose, onOpen }) {
  const Page = POLICY_COMPONENTS[page];
  const rootRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    rootRef.current?.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onClickCapture = (e) => {
    const anchor = e.target.closest?.('a[href]');
    if (!anchor) return;
    let url;
    try {
      url = new URL(anchor.getAttribute('href'), window.location.origin);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;
    const name = url.pathname.replace(/^\//, '').split('/')[0];
    e.preventDefault();
    e.stopPropagation();
    if (SIGNUP_POLICY_PAGES.includes(name)) onOpen(name);
  };

  if (!Page) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[120] overflow-y-auto"
      style={{ backgroundColor: 'var(--sec-bg-base)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Legal document"
      onClickCapture={onClickCapture}
    >
      <LegalViewerProvider onClose={onClose} onOpen={onOpen}>
        <Suspense fallback={<RoutePageFallback />}>
          <Page />
        </Suspense>
      </LegalViewerProvider>
    </div>
  );
}
