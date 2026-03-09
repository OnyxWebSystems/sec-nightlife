import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import SecLogo from '@/components/ui/SecLogo';
import {
  Home, Users, Plus, MessageCircle, User, Calendar, Briefcase, Bell, Trophy, Crown,
  LayoutDashboard, BarChart3, Building2, Megaphone, BookOpen, Settings, Music2
} from 'lucide-react';

const iconProps = { size: 20, strokeWidth: 1.5 };

const MODES = [
  { id: 'partygoer', label: 'Party Goer', icon: Music2 },
  { id: 'host', label: 'Host', icon: Crown },
  { id: 'business', label: 'Business', icon: Building2 },
];

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [activeMode, setActiveMode] = useState(null);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    const token = localStorage?.getItem('access_token') || sessionStorage?.getItem('access_token');
    if (!token) return;
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) setUserProfile(profiles[0]);
      const notifs = await dataService.Notification.filter({ user_id: currentUser.id, is_read: false });
      setNotifications(notifs);

      const saved = localStorage.getItem('sec_active_mode');
      setActiveMode(saved || (currentUser.role === 'VENUE' ? 'business' : 'partygoer'));
    } catch (e) {}
  };

  const switchMode = (mode) => {
    setActiveMode(mode);
    localStorage.setItem('sec_active_mode', mode);
  };

  const hideNav = ['Onboarding', 'ProfileSetup', 'VenueOnboarding', 'Welcome'].includes(currentPageName);
  if (hideNav) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
        {children}
      </div>
    );
  }

  const badge = notifications.length;

  const NAV = {
    partygoer: {
      primary: [
        { name: 'Home', icon: Home, page: 'Home' },
        { name: 'Friends', icon: Users, page: 'Friends' },
        { name: 'Create', icon: Plus, page: 'CreateTable', isCreate: true },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ],
      secondary: [
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Jobs', icon: Briefcase, page: 'Jobs' },
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        { name: 'Leaderboard', icon: Trophy, page: 'Leaderboard' },
        { name: 'Host Dashboard', icon: Crown, page: 'HostDashboard' },
      ],
    },
    host: {
      primary: [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'HostDashboard' },
        { name: 'Create Table', icon: Plus, page: 'CreateTable', isCreate: true },
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ],
      secondary: [
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        { name: 'Leaderboard', icon: Trophy, page: 'Leaderboard' },
        { name: 'Settings', icon: Settings, page: 'Settings' },
      ],
    },
    business: {
      primary: [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'BusinessDashboard' },
        { name: 'Analytics', icon: BarChart3, page: 'VenueAnalytics' },
        { name: 'Venue Profile', icon: Building2, page: 'VenueProfile' },
        { name: 'Events', icon: Calendar, page: 'BusinessEvents' },
        { name: 'Bookings', icon: BookOpen, page: 'BusinessBookings' },
      ],
      secondary: [
        { name: 'Promotions', icon: Megaphone, page: 'BusinessPromotions' },
        { name: 'Insights', icon: Users, page: 'FeedbackInsights' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        { name: 'Settings', icon: Settings, page: 'Settings' },
      ],
    },
  };

  const mode = activeMode || 'partygoer';
  const { primary: primaryNav, secondary: secondaryNav } = NAV[mode];

  const mobileNav = mode === 'business'
    ? [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'BusinessDashboard' },
        { name: 'Events', icon: Calendar, page: 'BusinessEvents' },
        { name: 'Bookings', icon: BookOpen, page: 'BusinessBookings' },
        { name: 'Analytics', icon: BarChart3, page: 'VenueAnalytics' },
        { name: 'More', icon: Settings, page: 'Settings' },
      ]
    : mode === 'host'
    ? [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'HostDashboard' },
        { name: 'Create', icon: Plus, page: 'CreateTable', isCreate: true },
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ]
    : [
        { name: 'Home', icon: Home, page: 'Home' },
        { name: 'Friends', icon: Users, page: 'Friends' },
        { name: 'Create', icon: Plus, page: 'CreateTable', isCreate: true },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ];

  const isActive = (page) => currentPageName === page;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden lg:flex"
        style={{
          position: 'fixed', left: 0, top: 0, height: '100vh', width: 240,
          backgroundColor: 'var(--sec-bg-base)',
          borderRight: '1px solid var(--sec-border)',
          flexDirection: 'column', zIndex: 50,
        }}
      >
        {/* Logo */}
        <div style={{ padding: '22px 20px 20px', borderBottom: '1px solid var(--sec-border)' }}>
          <Link to={createPageUrl('Home')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
            <SecLogo size={48} variant="full" />
          </Link>
        </div>

        {/* Mode Switcher */}
        {user && (
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--sec-border)' }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--sec-text-muted)',
              marginBottom: 4, padding: '0 10px',
            }}>
              Account Mode
            </div>
            {MODES.map(m => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => switchMode(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 10px', borderRadius: 8,
                    backgroundColor: active ? 'var(--sec-accent-muted)' : 'transparent',
                    border: active ? '1px solid var(--sec-accent-border)' : '1px solid transparent',
                    color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                    cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                    transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <m.icon size={15} strokeWidth={1.5} />
                  {m.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {primaryNav.map((item) => (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className="sec-nav-item"
              style={isActive(item.page) ? {
                color: 'var(--sec-text-primary)',
                backgroundColor: 'var(--sec-bg-card)',
                borderColor: 'var(--sec-border)',
              } : {}}
            >
              <item.icon {...iconProps} />
              <span>{item.name}</span>
              {item.isCreate && (
                <span className="sec-badge sec-badge-gold" style={{ marginLeft: 'auto' }}>New</span>
              )}
            </Link>
          ))}

          <div style={{ margin: '10px 2px', height: 1, backgroundColor: 'var(--sec-border)' }} />

          {secondaryNav.map((item) => (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className="sec-nav-item"
              style={{
                position: 'relative',
                ...(isActive(item.page) ? {
                  color: 'var(--sec-text-primary)',
                  backgroundColor: 'var(--sec-bg-card)',
                  borderColor: 'var(--sec-border)',
                } : {}),
              }}
            >
              <item.icon {...iconProps} />
              <span>{item.name}</span>
              {item.badge > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  minWidth: 18, height: 18, borderRadius: 9,
                  backgroundColor: 'var(--sec-error)', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px',
                }}>
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* User Footer */}
        <div style={{ padding: 10, borderTop: '1px solid var(--sec-border)' }}>
          {userProfile ? (
            <Link
              to={createPageUrl('Profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 10, borderRadius: 8, textDecoration: 'none', color: 'inherit',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sec-bg-card)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                overflow: 'hidden', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {userProfile.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)' }}>
                    {(userProfile.username || user?.full_name || 'U')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userProfile.username || user?.full_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>View profile</div>
              </div>
            </Link>
          ) : (
            <button onClick={() => authService.redirectToLogin()} className="sec-btn sec-btn-primary sec-btn-full">
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="lg:ml-[240px] min-h-screen pb-24 lg:pb-0">
        {children}
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav
        className="lg:hidden"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          backgroundColor: 'rgba(0,0,0,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid var(--sec-border)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          height: 64,
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 4, paddingRight: 4,
        }}>
          {mobileNav.map((item) => {
            const active = isActive(item.page);
            const isCreate = item.isCreate;

            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '8px 10px', borderRadius: 10, textDecoration: 'none',
                  flex: 1, position: 'relative',
                  color: isCreate
                    ? 'var(--sec-bg-base)'
                    : active
                      ? 'var(--sec-text-primary)'
                      : 'var(--sec-text-muted)',
                }}
              >
                {active && !isCreate && (
                  <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 20, height: 2,
                    background: 'var(--sec-gradient-silver)',
                    borderRadius: 2,
                  }} />
                )}

                {isCreate ? (
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'var(--sec-gradient-silver)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 12px rgba(192,192,192,0.22)',
                  }}>
                    <item.icon size={20} strokeWidth={2} />
                  </div>
                ) : (
                  <item.icon {...iconProps} />
                )}

                <span style={{
                  fontSize: 9, fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: isCreate
                    ? 'var(--sec-text-secondary)'
                    : active
                      ? 'var(--sec-text-primary)'
                      : 'var(--sec-text-muted)',
                }}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
