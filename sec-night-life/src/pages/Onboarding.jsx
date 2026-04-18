import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { User, Building2, ChevronRight } from 'lucide-react';
import SecLogo from '@/components/ui/SecLogo';

const ROLE_INTENT_KEY = 'sec-role-intent';

export default function Onboarding() {
  const navigate = useNavigate();

  const chooseRole = (role) => {
    try {
      localStorage.setItem(ROLE_INTENT_KEY, role);
    } catch {
      // ignore storage failures
    }

    if (role === 'VENUE') {
      authService.redirectToLogin(createPageUrl('VenueOnboarding'));
      return;
    }

    authService.redirectToLogin(createPageUrl('ProfileSetup'));
  };

  return (
    <div className="min-h-screen p-4 flex flex-col" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <div className="flex items-center justify-center pt-10 pb-8 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <SecLogo size={32} variant="full" />
          <span className="text-2xl font-bold" style={{ color: 'var(--sec-text-primary)' }}>
            Sec
          </span>
        </div>
      </div>

      <div className="flex-1 max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--sec-text-primary)' }}>
            Welcome to Sec
          </h1>
          <p style={{ color: 'var(--sec-text-muted)' }}>Choose your account type to get started</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={() => chooseRole('PARTY_GOER')}
            className="p-6 rounded-2xl text-left transition-colors"
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sec-accent-border)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sec-border)'; }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}
              >
                <User className="w-6 h-6" style={{ color: 'var(--sec-accent)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                  Party-Goer
                </h3>
                <p className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
                  Join events, book tables, connect with friends, and experience the nightlife
                </p>
              </div>
              <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
            </div>
          </button>

          <button
            onClick={() => chooseRole('VENUE')}
            className="p-6 rounded-2xl text-left transition-colors"
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sec-accent-border)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sec-border)'; }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}
              >
                <Building2 className="w-6 h-6" style={{ color: 'var(--sec-accent)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                  Business Owner
                </h3>
                <p className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
                  List your venue, create events, manage bookings, and grow your business
                </p>
              </div>
              <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
            </div>
          </button>
        </div>

        <div className="mt-8 text-center">
          <button onClick={() => navigate(createPageUrl('Home'))} className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
