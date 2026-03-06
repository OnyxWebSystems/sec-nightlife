import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function PrivacyPolicy() {
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
          <h1 className="text-xl font-bold">Privacy Policy</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-4">
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <p style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>
            SEC Nightlife ("we") respects your privacy. This policy describes how we collect, use, and protect your information when you use our app and services.
          </p>
          <p style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>
            We collect information you provide when you register, create a profile, book tables, or contact us. We use this to provide our services, improve your experience, and communicate with you. We do not sell your personal information.
          </p>
          <p style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>
            We use industry-standard security measures to protect your data. Your payment information is processed by secure third-party providers.
          </p>
          <p style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>
            This is a summary. Our full Privacy Policy will be published shortly. For questions, contact us at support@secnightlife.com.
          </p>
        </div>
      </div>
    </div>
  );
}
