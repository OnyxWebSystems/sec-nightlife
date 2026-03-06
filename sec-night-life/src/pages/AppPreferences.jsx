import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Globe, Bell, Smartphone } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function AppPreferences() {
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
          <h1 className="text-xl font-bold">App Preferences</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--sec-text-muted)' }}>
              Preferences
            </p>
          </div>
          <Link
            to={createPageUrl('Settings')}
            className="flex items-center gap-4 p-4"
            style={{ borderBottom: '1px solid var(--sec-border)' }}
          >
            <Globe className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
            <div className="flex-1">
              <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                Language
              </p>
              <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                English
              </p>
            </div>
            <ChevronLeft className="w-5 h-5 rotate-180" style={{ color: 'var(--sec-text-muted)' }} />
          </Link>
          <Link
            to={createPageUrl('Settings')}
            className="flex items-center gap-4 p-4"
          >
            <Bell className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
            <div className="flex-1">
              <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                Notifications
              </p>
              <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                Manage push notifications
              </p>
            </div>
            <ChevronLeft className="w-5 h-5 rotate-180" style={{ color: 'var(--sec-text-muted)' }} />
          </Link>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-accent)' }} />
            <div>
              <h2 className="font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                SEC Nightlife App
              </h2>
              <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                SEC Nightlife is designed with a premium dark theme that matches our brand identity. Your preferences for language and notifications can be managed from Settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
