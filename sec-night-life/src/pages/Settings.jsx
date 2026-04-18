import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useAuth } from '@/lib/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import {
  ChevronLeft,
  ChevronRight,
  User,
  Bell,
  Shield,
  CreditCard,
  HelpCircle,
  FileText,
  LogOut,
  Globe,
  Smartphone,
  Building,
  BadgeCheck,
  Mail,
  Key,
  Trash2,
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t, language } = usePreferences();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [venues, setVenues] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);

      let profiles = [];
      try {
        profiles = await dataService.User.filter({ created_by: currentUser.email });
        if (profiles.length > 0) setUserProfile(profiles[0]);
      } catch {
        profiles = [];
      }

      let userVenues = [];
      try {
        userVenues = await dataService.Venue.mine();
      } catch {
        userVenues = [];
      }
      setVenues(userVenues);
    } catch {
      authService.redirectToLogin();
    }
  };

  const languageLabel = language === 'en' ? 'English' : language;

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteAccount();
      // deleteAccount clears tokens and redirects on success
    } catch {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const settingsSections = [
    {
      title: t('account'),
      items: [
        { icon: User, label: t('editProfile'), page: 'EditProfile' },
        { icon: Bell, label: t('notifications'), description: t('managePushNotifications'), page: 'AppPreferences' },
        { icon: Shield, label: t('privacySecurity'), page: 'Privacy' },
        { icon: CreditCard, label: t('paymentMethods'), page: 'Payments' },
        { icon: Mail, label: t('changeEmail'), page: 'ChangeEmail' },
        { icon: Key, label: t('changePassword'), page: 'ChangePassword' },
        { icon: Trash2, label: t('deleteAccount'), deleteAction: true },
      ],
    },
    {
      title: t('preferences'),
      items: [
        {
          icon: Globe,
          label: t('language'),
          description: languageLabel,
          languageRow: true,
        },
        { icon: Smartphone, label: t('appPreferences'), page: 'AppPreferences' },
      ],
    },
    {
      title: t('support'),
      items: [
        { icon: HelpCircle, label: t('helpCenter'), page: 'HelpCenter' },
        { icon: FileText, label: t('termsOfService'), page: 'TermsOfService' },
        { icon: FileText, label: t('privacyPolicy'), page: 'PrivacyPolicy' },
        { icon: FileText, label: 'Promoter Code of Conduct', page: 'PromoterCodeOfConduct' },
      ],
    },
  ];

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
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
          <h1 className="text-xl font-bold" style={{ color: 'var(--sec-text-primary)' }}>
            {t('settings')}
          </h1>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Profile Summary — SEC logo colors: black + metallic silver */}
        <Link
          to={createPageUrl('Profile')}
          className="flex items-center gap-4 p-4 rounded-2xl transition-colors"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              backgroundColor: '#000000',
              border: '2px solid var(--sec-accent)',
            }}
          >
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span
                className="text-xl font-bold uppercase"
                style={{ color: 'var(--sec-accent)' }}
              >
                {user?.full_name?.[0] || userProfile?.username?.[0] || userProfile?.full_name?.[0] || 'U'}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold" style={{ color: 'var(--sec-text-primary)' }}>
              {userProfile?.username || user?.full_name}
            </p>
            <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
              {user?.email}
            </p>
          </div>
          <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
        </Link>

        {/* Venue Management */}
        {venues.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--sec-text-muted)' }}>
                Your Venues
              </p>
            </div>
            {venues.map((venue) => (
              <Link
                key={venue.id}
                to={createPageUrl(`VenueDashboard?id=${venue.id}`)}
                className="flex items-center gap-4 p-4 transition-colors"
                style={{ borderBottom: '1px solid var(--sec-border)' }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: 'var(--sec-bg-hover)' }}
                >
                  {venue.logo_url ? (
                    <img src={venue.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Building className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                      {venue.name}
                    </p>
                    {venue.is_verified && (
                      <BadgeCheck className="w-4 h-4" style={{ color: 'var(--sec-accent)' }} />
                    )}
                  </div>
                  <p className="text-xs capitalize" style={{ color: 'var(--sec-text-muted)' }}>
                    {venue.compliance_status === 'approved' ? 'Verified' : venue.compliance_status}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
              </Link>
            ))}
          </div>
        )}

        {/* Settings Sections */}
        {settingsSections.map((section) => (
          <div
            key={section.title}
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--sec-text-muted)' }}>
                {section.title}
              </p>
            </div>
            {section.items.map((item, index) => (
              <div
                key={item.label}
                className="flex items-center gap-4 p-4"
                style={
                  index !== section.items.length - 1
                    ? { borderBottom: '1px solid var(--sec-border)' }
                    : {}
                }
              >
                {item.languageRow ? (
                  <div className="flex items-center gap-4 flex-1">
                    <item.icon className="w-5 h-5 shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                        {item.label}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                ) : item.deleteAction ? (
                  <button
                    onClick={() => setDeleteDialogOpen(true)}
                    className="flex items-center gap-4 flex-1 w-full text-left"
                    style={{ color: 'var(--sec-error)' }}
                  >
                    <item.icon className="w-5 h-5" style={{ color: 'var(--sec-error)' }} />
                    <div className="flex-1">
                      <p className="font-medium">{item.label}</p>
                    </div>
                    <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
                  </button>
                ) : item.page ? (
                  <Link
                    to={createPageUrl(item.page)}
                    className="flex items-center gap-4 flex-1"
                  >
                    <item.icon className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                          {item.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
                  </Link>
                ) : (
                  <>
                    <item.icon className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--sec-text-primary)' }}>
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.toggle && <Switch defaultChecked={false} />}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Logout */}
        <Button
          onClick={() => {
            const ok = window.confirm('Sign out of SecNightlife?');
            if (ok) logout(true);
          }}
          variant="ghost"
          className="w-full"
          style={{ color: 'var(--sec-error)' }}
        >
          <LogOut className="w-5 h-5 mr-2" />
          {t('signOut')}
        </Button>

        {/* Version */}
        <p className="text-center text-xs" style={{ color: 'var(--sec-text-muted)' }}>
          Sec v1.0.0
        </p>
      </div>

      {/* Delete Account Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('deleteAccount')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteAccountWarning')} {t('deleteAccountConfirm')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting…' : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}