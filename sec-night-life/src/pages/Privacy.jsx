import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Shield, Lock, Eye, UserX, User, Search, LayoutGrid, MessageCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { usePreferences } from '@/context/PreferencesContext';
import { Switch } from '@/components/ui/switch';

export default function Privacy() {
  const navigate = useNavigate();
  const { privacy, setPrivacySetting, t } = usePreferences();

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
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
        {/* Informational content - DO NOT REMOVE */}
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
              Control who can see your profile and activity. Use the settings below to adjust your visibility.
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
              </Link>
              . All legal documents are listed in{' '}
              <Link to={createPageUrl('Settings')} className="font-medium" style={{ color: 'var(--sec-accent)' }}>
                Settings
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Privacy Settings - User controls */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--sec-text-muted)' }}>
              Privacy Settings
            </p>
          </div>
          {[
            { key: 'profilePublic', icon: User, label: t('makeProfilePublic'), description: t('profileVisibility') },
            { key: 'searchVisible', icon: Search, label: t('showInSearchResults'), description: t('searchVisibility') },
            { key: 'tablesVisible', icon: LayoutGrid, label: t('allowViewMyTables'), description: t('tableVisibility') },
            { key: 'allowMessages', icon: MessageCircle, label: t('allowPeopleToMessage'), description: t('messagingPermissions') },
          ].map(({ key, icon: Icon, label, description }) => (
            <div
              key={key}
              className="flex items-center gap-4 p-4"
              style={{ borderBottom: '1px solid var(--sec-border)' }}
            >
              <Icon className="w-5 h-5 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>{label}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>{description}</p>
              </div>
              <Switch
                checked={privacy[key] ?? true}
                onCheckedChange={(v) => setPrivacySetting(key, v)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
