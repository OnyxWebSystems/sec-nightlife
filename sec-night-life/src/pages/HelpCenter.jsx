import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Mail } from 'lucide-react';

export default function HelpCenter() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">Help Center</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <p className="mb-4" style={{ color: 'var(--sec-text-secondary)' }}>
            If you need help with SEC Nightlife, contact us at:
          </p>
          <a
            href="mailto:support@secnightlife.com"
            className="inline-flex items-center gap-2 font-medium"
            style={{ color: 'var(--sec-accent)' }}
          >
            <Mail className="w-5 h-5" />
            support@secnightlife.com
          </a>
          <p className="mt-4 text-sm" style={{ color: 'var(--sec-text-muted)' }}>
            Our team will respond as soon as possible.
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--sec-text-muted)' }}>
            This is temporary until a real support system exists.
          </p>
        </div>
      </div>
    </div>
  );
}
