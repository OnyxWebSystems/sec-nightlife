import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { prefetchPage } from '@/pages.config';

const AGE_GATE_KEY = 'sec_age_gate_18_v1';

/**
 * Lightweight 18+ acknowledge for guest browse (registration / ProfileSetup still enforce DOB).
 */
export default function GuestAgeGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(AGE_GATE_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    setOpen(true);
    void prefetchPage('AgeVerificationDeclaration');
    void prefetchPage('TermsOfService');
  }, []);

  if (!open) return null;

  const accept = () => {
    try {
      localStorage.setItem(AGE_GATE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Age confirmation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--sec-border)] p-5 space-y-4"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', color: 'var(--sec-text-primary)' }}
      >
        <h2 className="text-lg font-bold">18+ only</h2>
        <p className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
          SEC Nightlife is for adults. By continuing you confirm you are at least 18 years old. See our{' '}
          <Link to={createPageUrl('TermsOfService')} className="underline" style={{ color: 'var(--sec-accent)' }}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to={createPageUrl('AgeVerificationDeclaration')} className="underline" style={{ color: 'var(--sec-accent)' }}>
            Age Verification Declaration
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="w-full py-3 rounded-xl font-semibold"
          style={{ backgroundColor: 'var(--sec-accent)', color: '#0A0A0B' }}
        >
          I am 18 or older
        </button>
      </div>
    </div>
  );
}
