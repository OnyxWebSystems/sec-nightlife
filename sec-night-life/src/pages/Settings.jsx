import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useAuth } from '@/lib/AuthContext';
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
  Moon,
  Globe,
  Smartphone,
  Building,
  BadgeCheck,
  ExternalLink
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [venues, setVenues] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        setUserProfile(profiles[0]);
      }

      const userVenues = await dataService.Venue.filter({ owner_user_id: profiles[0]?.id });
      setVenues(userVenues);
    } catch (e) {
      authService.redirectToLogin();
    }
  };

  const settingsSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Edit Profile', page: 'EditProfile' },
        { icon: Bell, label: 'Notifications', description: 'Manage push notifications', toggle: true },
        { icon: Shield, label: 'Privacy & Security', page: 'Privacy' },
        { icon: CreditCard, label: 'Payment Methods', page: 'Payments' },
      ]
    },
    {
      title: 'Preferences',
      items: [
        { icon: Moon, label: 'Dark Mode', description: 'Always on', toggle: true, defaultOn: true },
        { icon: Globe, label: 'Language', description: 'English', page: 'Language' },
        { icon: Smartphone, label: 'App Preferences', page: 'AppPreferences' },
      ]
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Center', external: true },
        { icon: FileText, label: 'Terms of Service', external: true },
        { icon: FileText, label: 'Privacy Policy', external: true },
      ]
    }
  ];

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-[#141416] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Profile Summary */}
        <Link 
          to={createPageUrl('Profile')}
          className="flex items-center gap-4 p-4 glass-card rounded-2xl"
        >
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] overflow-hidden">
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                {user?.full_name?.[0] || 'U'}
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{userProfile?.username || user?.full_name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </Link>

        {/* Venue Management */}
        {venues.length > 0 && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#262629]">
              <p className="text-sm font-semibold text-gray-400">Your Venues</p>
            </div>
            {venues.map((venue) => (
              <Link
                key={venue.id}
                to={createPageUrl(`VenueDashboard?id=${venue.id}`)}
                className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFD700]/20 to-[#FF8C00]/20 flex items-center justify-center overflow-hidden">
                  {venue.logo_url ? (
                    <img src={venue.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Building className="w-5 h-5 text-[#FFD700]" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{venue.name}</p>
                    {venue.is_verified && (
                      <BadgeCheck className="w-4 h-4 text-[#FFD700]" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 capitalize">
                    {venue.compliance_status === 'approved' ? 'Verified' : venue.compliance_status}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </Link>
            ))}
          </div>
        )}

        {/* Register Venue Link */}
        <Link
          to={createPageUrl('VenueOnboarding')}
          className="flex items-center gap-4 p-4 glass-card rounded-2xl hover:bg-white/5 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF3366]/20 to-[#7C3AED]/20 flex items-center justify-center">
            <Building className="w-5 h-5 text-[#FF3366]" />
          </div>
          <div className="flex-1">
            <p className="font-medium">Register a Venue</p>
            <p className="text-sm text-gray-500">List your nightclub or event company</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </Link>

        {/* Settings Sections */}
        {settingsSections.map((section) => (
          <div key={section.title} className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#262629]">
              <p className="text-sm font-semibold text-gray-400">{section.title}</p>
            </div>
            {section.items.map((item, index) => (
              <div
                key={item.label}
                className={`flex items-center gap-4 p-4 ${
                  index !== section.items.length - 1 ? 'border-b border-[#262629]' : ''
                }`}
              >
                {item.page ? (
                  <Link
                    to={createPageUrl(item.page)}
                    className="flex items-center gap-4 flex-1"
                  >
                    <item.icon className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="font-medium">{item.label}</p>
                      {item.description && (
                        <p className="text-sm text-gray-500">{item.description}</p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </Link>
                ) : item.external ? (
                  <a
                    href="#"
                    className="flex items-center gap-4 flex-1"
                  >
                    <item.icon className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="font-medium">{item.label}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-600" />
                  </a>
                ) : (
                  <>
                    <item.icon className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="font-medium">{item.label}</p>
                      {item.description && (
                        <p className="text-sm text-gray-500">{item.description}</p>
                      )}
                    </div>
                    {item.toggle && (
                      <Switch defaultChecked={item.defaultOn} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Logout */}
        <Button
          onClick={() => logout(false)}
          variant="ghost"
          className="w-full text-red-500 hover:text-red-400 hover:bg-red-500/10"
        >
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </Button>

        {/* Version */}
        <p className="text-center text-xs text-gray-600">
          Sec v1.0.0
        </p>
      </div>
    </div>
  );
}