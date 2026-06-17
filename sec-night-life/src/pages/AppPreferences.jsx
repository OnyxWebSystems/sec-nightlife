import React from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Globe,
  Bell,
  MapPin,
  Ruler,
  Shield,
} from 'lucide-react';
import { createPageUrl } from '@/utils';
import { usePreferences } from '@/context/PreferencesContext';
import { Switch } from '@/components/ui/switch';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { toast } from 'sonner';

function SectionCard({ title, children }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--sec-text-muted)' }}>
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

function SettingRow({ icon: Icon, label, description, children }) {
  return (
    <div
      className="flex items-center gap-4 p-4"
      style={{ borderBottom: '1px solid var(--sec-border)' }}
    >
      {Icon && <Icon className="w-5 h-5 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />}
      <div className="flex-1 min-w-0">
        <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
          {label}
        </p>
        {description && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export default function AppPreferences() {
  const {
    language,
    setLanguage,
    t,
    notifications: notif,
    setNotification,
    setLocation,
    location: loc,
    requestGeoCoords,
  } = usePreferences();

  const radiusKm = Number(loc?.radiusKm) || 25;
  const radiusDisplay = loc?.distanceUnit === 'mi' ? Math.round(radiusKm * 0.621371) : radiusKm;
  const radiusUnit = loc?.distanceUnit === 'mi' ? 'mi' : 'km';

  const onLocationToggle = async (enabled) => {
    setLocation('useLocation', enabled);
    if (enabled) {
      try {
        await requestGeoCoords();
      } catch {
        toast.error('Could not access location — enable permission in your browser');
      }
    }
  };

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <PageBackHeader title={t('appPreferences')} fallbackTo="Settings" pageName="AppPreferences" />

      <div className="px-4 py-6 max-w-xl mx-auto space-y-6">
        {/* Language */}
        <SectionCard title={t('language')}>
          <SettingRow
            icon={Globe}
            label={t('language')}
            description={language === 'en' ? 'English' : language}
          >
            <span className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
              English
            </span>
          </SettingRow>
        </SectionCard>

        {/* Notifications */}
        <SectionCard title={t('notifications')}>
          <SettingRow
            icon={Bell}
            label={t('enableNotifications')}
            description={t('managePushNotifications')}
          >
            <Switch
              checked={notif?.enabled ?? true}
              onCheckedChange={(v) => setNotification('enabled', v)}
            />
          </SettingRow>
          <div className="pl-4 pr-4 pb-3" style={{ borderBottom: '1px solid var(--sec-border)' }}>
            <p className="text-xs font-medium mb-2 pt-2" style={{ color: 'var(--sec-text-muted)' }}>
              {t('pushNotifications')}
            </p>
            {[
              { key: 'eventReminders', label: t('eventReminders') },
              { key: 'tableInvitations', label: t('tableInvitations') },
              { key: 'friendRequests', label: t('friendRequests') },
              { key: 'messages', label: t('messages') },
              { key: 'promotions', label: t('promotionsFromVenues') },
              { key: 'appUpdates', label: t('appUpdates') },
            ].map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between py-2"
                style={{ opacity: notif?.enabled ? 1 : 0.5 }}
              >
                <span className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
                  {label}
                </span>
                <Switch
                  checked={notif?.push?.[key] ?? true}
                  onCheckedChange={(v) => setNotification(`push.${key}`, v)}
                  disabled={!notif?.enabled}
                />
              </div>
            ))}
          </div>
          <div className="pl-4 pr-4 py-3">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--sec-text-muted)' }}>
              {t('emailNotifications')}
            </p>
            {[
              { key: 'eventReminders', label: t('emailEventReminders') },
              { key: 'promotions', label: t('emailPromotions') },
            ].map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between py-2"
                style={{ opacity: notif?.enabled ? 1 : 0.5 }}
              >
                <span className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
                  {label}
                </span>
                <Switch
                  checked={notif?.email?.[key] ?? true}
                  onCheckedChange={(v) => setNotification(`email.${key}`, v)}
                  disabled={!notif?.enabled}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Location */}
        <SectionCard title={t('locationSettings')}>
          <SettingRow
            icon={MapPin}
            label={t('useLocationForVenues')}
            description={t('useLocationForVenuesDesc')}
          >
            <Switch
              checked={loc?.useLocation ?? false}
              onCheckedChange={(v) => void onLocationToggle(v)}
            />
          </SettingRow>
          {loc?.useLocation ? (
            <div className="px-4 pb-4" style={{ borderBottom: '1px solid var(--sec-border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
                  Nearby radius
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--sec-accent)' }}>
                  {radiusDisplay} {radiusUnit}
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={radiusKm}
                onChange={(e) => setLocation('radiusKm', Number(e.target.value))}
                className="w-full accent-[var(--sec-accent)]"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                Home and Map show venues and events within this distance when location is on.
              </p>
            </div>
          ) : null}
          <SettingRow
            icon={Ruler}
            label={t('distanceUnit')}
            description={loc?.distanceUnit === 'mi' ? t('miles') : t('kilometers')}
          >
            <div className="flex gap-2">
              <button
                onClick={() => setLocation('distanceUnit', 'km')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: loc?.distanceUnit === 'km' ? 'var(--sec-accent-muted)' : 'transparent',
                  color: loc?.distanceUnit === 'km' ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                km
              </button>
              <button
                onClick={() => setLocation('distanceUnit', 'mi')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: loc?.distanceUnit === 'mi' ? 'var(--sec-accent-muted)' : 'transparent',
                  color: loc?.distanceUnit === 'mi' ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                mi
              </button>
            </div>
          </SettingRow>
        </SectionCard>

        {/* Quick link to Privacy */}
        <Link
          to={createPageUrl('Privacy')}
          className="flex items-center gap-4 p-4 rounded-2xl transition-colors"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <Shield className="w-5 h-5 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
          <div className="flex-1">
            <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
              {t('privacySecurity')}
            </p>
            <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
              Manage privacy and visibility settings
            </p>
          </div>
          <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
        </Link>
      </div>
    </div>
  );
}
