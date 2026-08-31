import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, UserX, User, Search, LayoutGrid, MessageCircle, Ban, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { usePreferences } from '@/context/PreferencesContext';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiDelete } from '@/api/client';
import { toast } from 'sonner';

export default function Privacy() {
  const { privacy, setPrivacySetting, t } = usePreferences();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [unblockingId, setUnblockingId] = useState(null);

  const { data: blockedData, isLoading: blockedLoading } = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => apiGet('/api/friends/blocked'),
  });
  const blockedUsers = blockedData?.items || [];

  const onUnblock = async (userId) => {
    setUnblockingId(userId);
    try {
      await apiDelete(`/api/friends/block/${userId}`);
      toast.success('Unblocked');
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
      queryClient.invalidateQueries({ queryKey: ['home-bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
    } catch (e) {
      toast.error(e?.data?.error || 'Could not unblock');
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <PageBackHeader title="Privacy & Security" pageName="Privacy" />

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

        {/* Blocked users */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--sec-text-muted)' }}>
              <Ban className="w-4 h-4" />
              Blocked users
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
              You can still open their profiles. Unblock anytime to restore their posts in your feed.
            </p>
          </div>
          {blockedLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sec-accent)' }} />
            </div>
          ) : blockedUsers.length === 0 ? (
            <p className="px-4 py-6 text-sm" style={{ color: 'var(--sec-text-muted)' }}>
              You haven’t blocked anyone.
            </p>
          ) : (
            blockedUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-4"
                style={{ borderBottom: '1px solid var(--sec-border)' }}
              >
                <button
                  type="button"
                  className="flex items-center gap-3 flex-1 min-w-0 text-left bg-transparent border-none p-0 cursor-pointer"
                  onClick={() => navigate(`${createPageUrl('UserProfile')}?id=${u.id}`)}
                >
                  <div
                    className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: 'var(--sec-bg-elevated, #262629)' }}
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (u.fullName || u.username || '?')[0].toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--sec-text-primary)' }}>
                      {u.fullName || u.username || 'User'}
                    </p>
                    {u.username ? (
                      <p className="text-xs truncate" style={{ color: 'var(--sec-text-muted)' }}>
                        @{u.username}
                      </p>
                    ) : null}
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 min-h-[40px]"
                  disabled={unblockingId === u.id}
                  onClick={() => void onUnblock(u.id)}
                >
                  {unblockingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unblock'}
                </Button>
              </div>
            ))
          )}
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
