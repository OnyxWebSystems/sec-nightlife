import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Shield, Lock, Eye, UserX } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
      >
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">Privacy & Security</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
        <div
          className="rounded-2xl p-6 space-y-6"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div>
            <h2 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--sec-text-primary)' }}>
              <Shield className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
              Your data is protected
            </h2>
            <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              We use industry-standard encryption to protect your personal information and payment data. Your account is secured with authentication measures to prevent unauthorized access.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--sec-text-primary)' }}>
              <Eye className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
              Profile visibility
            </h2>
            <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Control who can see your profile and activity. Visit Edit Profile to adjust your visibility settings and choose what information you share with other users.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--sec-text-primary)' }}>
              <Lock className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
              Account security
            </h2>
            <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Use a strong, unique password and avoid sharing your login details. We will never ask for your password via email or phone.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--sec-text-primary)' }}>
              <UserX className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
              Data and privacy
            </h2>
            <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              For details on how we collect, use, and protect your data, see our{' '}
              <Link to={createPageUrl('PrivacyPolicy')} className="font-medium" style={{ color: 'var(--sec-accent)' }}>
                Privacy Policy
              </Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
