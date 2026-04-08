import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet } from '@/api/client';
import SecLogo from '@/components/ui/SecLogo';
import CreateActionCenter from '@/components/CreateActionCenter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Home, Users, Plus, MessageCircle, User, Calendar, Briefcase, Bell, Trophy, Crown,
  LayoutDashboard, BarChart3, Building2, Megaphone, BookOpen, Settings, Music2, Shield
} from 'lucide-react';

const iconProps = { size: 22, strokeWidth: 1.5 };

const MODES = [
  { id: 'partygoer', label: 'Party Goer', icon: Music2 },
  { id: 'host', label: 'Host', icon: Crown },
  { id: 'business', label: 'Business', icon: Building2 },
];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [activeMode, setActiveMode] = useState(null);
  const [userRoles, setUserRoles] = useState({ partygoer: true, host: false, business: false });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showModeSwitcher, setShowModeSwitcher] = useState(false);
  const [complianceAccess, setComplianceAccess] = useState({ canReview: false, isSuperAdmin: false });
  const longPressTimerRef = useRef(null);

  useEffect(() => { loadUser(); }, []);
  useEffect(() => {
    if (!user?.id) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const notifs = await dataService.Notification.filter({ user_id: user.id, is_read: false });
        setNotifications(notifs);
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [user?.id]);

  const loadUser = async () => {
    const token = localStorage?.getItem('access_token') || sessionStorage?.getItem('access_token');
    if (!token) return;
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      try {
        const access = await apiGet('/api/compliance-documents/me/access');
        setComplianceAccess({
          canReview: !!access?.canReview,
          isSuperAdmin: !!access?.isSuperAdmin,
        });
      } catch {
        setComplianceAccess({ canReview: false, isSuperAdmin: false });
      }
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      let profile = profiles[0] || null;
      if (profiles.length > 0) setUserProfile(profile);

      const notifs = await dataService.Notification.filter({ user_id: currentUser.id, is_read: false });
      setNotifications(notifs);

      let hasBusiness = currentUser.role === 'VENUE';
      let hasHost = false;
      try {
        const rolesRes = await apiGet('/api/user-roles/me');
        if (rolesRes && (rolesRes.host || rolesRes.business)) {
          hasHost = rolesRes.host;
          hasBusiness = rolesRes.business || hasBusiness;
        }
      } catch {}
      if (!hasBusiness) {
        try {
          const venues = await dataService.Venue.filter({ owner_user_id: currentUser.id });
          hasBusiness = venues.length > 0;
        } catch {}
      }
      if (!hasHost) {
        try {
          const tables = await dataService.Table.filter({ host_user_id: currentUser.id });
          hasHost = tables.length > 0;
        } catch {}
      }
      setUserRoles({ partygoer: true, host: hasHost, business: hasBusiness });

      const saved = localStorage.getItem('sec_active_mode');
      let defaultMode = 'partygoer';
      if (saved && (saved === 'business' ? hasBusiness : saved === 'host' ? hasHost : true)) {
        defaultMode = saved;
      } else if (hasBusiness) defaultMode = 'business';
      else if (hasHost) defaultMode = 'host';
      setActiveMode(defaultMode);
    } catch (e) {}
  };

  const switchMode = (mode) => {
    setActiveMode(mode);
    localStorage.setItem('sec_active_mode', mode);
    window.dispatchEvent(new CustomEvent('sec_active_mode_changed', { detail: { mode } }));
  };

  const hideNav =
    ['Onboarding', 'ProfileSetup', 'VenueOnboarding', 'Welcome', 'Login', 'Register'].includes(currentPageName) ||
    (currentPageName === 'Home' && !user);
  if (hideNav) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
        {children}
      </div>
    );
  }

  const badge = notifications.length;
  const availableModes = MODES.filter(m => userRoles[m.id]);
  const complianceNavItem = complianceAccess.canReview
    ? [{ name: 'Compliance Review', icon: Shield, page: 'AdminDashboard', query: '?tab=compliance-documents' }]
    : [];

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
        ...(userRoles.host ? [{ name: 'Host Dashboard', icon: Crown, page: 'HostDashboard' }] : []),
        ...complianceNavItem,
        ...((['SUPER_ADMIN', 'ADMIN', 'admin'].includes(user?.role)) ? [{ name: 'Admin', icon: LayoutDashboard, page: 'AdminDashboard' }] : []),
      ],
    },
    host: {
      primary: [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'HostDashboard' },
        { name: 'Create Table', icon: Plus, page: 'CreateTable', isCreate: true },
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Jobs', icon: Briefcase, page: 'Jobs' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
      ],
      secondary: [
        { name: 'Profile', icon: User, page: 'Profile' },
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        { name: 'Leaderboard', icon: Trophy, page: 'Leaderboard' },
        ...complianceNavItem,
        { name: 'Settings', icon: Settings, page: 'Settings' },
      ],
    },
    business: {
      primary: [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'BusinessDashboard' },
        { name: 'Analytics', icon: BarChart3, page: 'VenueAnalytics' },
        { name: 'Venue', icon: Building2, page: 'VenueProfile' },
        { name: 'Events', icon: Calendar, page: 'BusinessEvents' },
        { name: 'Bookings', icon: BookOpen, page: 'BusinessBookings' },
      ],
      secondary: [
        { name: 'Post Job', icon: Briefcase, page: 'CreateJob' },
        { name: 'Jobs', icon: Briefcase, page: 'BusinessJobs' },
        { name: 'Promotions', icon: Megaphone, page: 'BusinessPromotions' },
        { name: 'Insights', icon: Users, page: 'FeedbackInsights' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        ...complianceNavItem,
        { name: 'Settings', icon: Settings, page: 'Settings' },
      ],
    },
  };

  const mode = activeMode && userRoles[activeMode] ? activeMode : (userRoles.business ? 'business' : userRoles.host ? 'host' : 'partygoer');
  const { primary: primaryNav, secondary: secondaryNav } = NAV[mode];

  // Mobile: Unified 5-tab bottom nav — Home, Events, Create, Messages, Profile
  const mobileNav = mode === 'business'
    ? [
        { name: 'Home', icon: LayoutDashboard, page: 'BusinessDashboard' },
        { name: 'Events', icon: Calendar, page: 'BusinessEvents' },
        { name: 'Create', icon: Plus, page: null, isCreate: true },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ]
    : mode === 'host'
    ? [
        { name: 'Home', icon: LayoutDashboard, page: 'HostDashboard' },
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Create', icon: Plus, page: null, isCreate: true },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ]
    : [
        { name: 'Home', icon: Home, page: 'Home' },
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Create', icon: Plus, page: null, isCreate: true },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ];

  const isActive = (page) => {
    if (page === 'CreateJob' && currentPageName === 'CreateJob') return true;
    return currentPageName === page;
  };

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
        <div style={{ padding: '22px 20px 20px', borderBottom: '1px solid var(--sec-border)' }}>
          <Link to={createPageUrl('Home')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
            <SecLogo size={48} variant="full" />
          </Link>
        </div>

        {user && availableModes.length > 1 && (
          <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--sec-border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 4, padding: '0 10px' }}>
              Viewing As
            </div>
            {availableModes.map(m => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => switchMode(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', borderRadius: 8,
                    backgroundColor: active ? 'var(--sec-accent-muted)' : 'transparent',
                    border: active ? '1px solid var(--sec-accent-border)' : '1px solid transparent',
                    color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                    cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <m.icon size={15} strokeWidth={1.5} />
                  {m.label}
                </button>
              );
            })}
          </div>
        )}

        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {primaryNav.map((item) =>
            item.isCreate ? (
              <button
                key={item.page + item.name}
                onClick={() => setShowCreateModal(true)}
                className="sec-nav-item"
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', font: 'inherit' }}
              >
                <item.icon {...iconProps} />
                <span>{item.name}</span>
                <span className="sec-badge sec-badge-gold" style={{ marginLeft: 'auto' }}>New</span>
              </button>
            ) : (
              <Link
                key={item.page + item.name}
                to={item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page)}
                className="sec-nav-item"
                style={isActive(item.page) ? { color: 'var(--sec-text-primary)', backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' } : {}}
              >
                <item.icon {...iconProps} />
                <span>{item.name}</span>
              </Link>
            )
          )}
          <div style={{ margin: '10px 2px', height: 1, backgroundColor: 'var(--sec-border)' }} />
          {secondaryNav.map((item) => (
            <Link
              key={item.page + item.name}
              to={item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page)}
              className="sec-nav-item"
              style={{ position: 'relative', ...(isActive(item.page) ? { color: 'var(--sec-text-primary)', backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' } : {}) }}
            >
              <item.icon {...iconProps} />
              <span>{item.name}</span>
              {item.badge > 0 && (
                <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'var(--sec-error)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: '1px solid var(--sec-border)' }}>
          {userProfile ? (
            <Link to={createPageUrl('Profile')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, textDecoration: 'none', color: 'inherit', transition: 'background-color 0.15s' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--sec-bg-card)'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {userProfile.avatar_url ? <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)' }}>{(userProfile.username || user?.full_name || 'U')[0].toUpperCase()}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile.username || user?.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>View profile</div>
              </div>
            </Link>
          ) : (
            <button onClick={() => authService.redirectToLogin()} className="sec-btn sec-btn-primary sec-btn-full">Sign In</button>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        className="lg:ml-[240px] min-h-screen w-full max-w-[480px] lg:max-w-none mx-auto lg:mx-0"
        style={{
          paddingBottom: 'calc(84px + env(safe-area-inset-bottom))',
        }}
      >
        {complianceAccess.canReview && currentPageName !== 'AdminDashboard' && (
          <div className="lg:hidden" style={{ padding: '12px 16px 0' }}>
            <Link
              to={`${createPageUrl('AdminDashboard')}?tab=compliance-documents`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 14,
                textDecoration: 'none',
                color: 'var(--sec-text-primary)',
                backgroundColor: 'var(--sec-accent-muted)',
                border: '1px solid var(--sec-accent-border)',
              }}
            >
              <Shield size={16} style={{ color: 'var(--sec-accent)' }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Open Compliance Review</span>
            </Link>
          </div>
        )}
        {children}
      </main>

      <CreateActionCenter open={showCreateModal} onOpenChange={setShowCreateModal} userRoles={userRoles} activeMode={mode} />

      {/* ── Mobile profile switcher (Instagram-style) ── */}
      <Dialog open={showModeSwitcher} onOpenChange={setShowModeSwitcher}>
        <DialogContent
          className="max-w-sm"
          style={{
            backgroundColor: 'var(--sec-bg-card)',
            borderColor: 'var(--sec-border)',
            color: 'var(--sec-text-primary)',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--sec-text-primary)' }}>Viewing as</DialogTitle>
            <DialogDescription style={{ color: 'var(--sec-text-muted)' }}>
              Switch between your accounts
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {availableModes.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    switchMode(m.id);
                    setShowModeSwitcher(false);
                    // take user to the “home” of that mode
                    const dest = m.id === 'business' ? 'BusinessDashboard' : m.id === 'host' ? 'HostDashboard' : 'Home';
                    navigate(createPageUrl(dest));
                  }}
                  className="sec-card"
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    border: active ? '1px solid var(--sec-accent-border)' : '1px solid var(--sec-border)',
                    backgroundColor: active ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)',
                    color: 'var(--sec-text-primary)',
                  }}
                >
                  <m.icon size={18} strokeWidth={1.5} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                      {active ? 'Current' : 'Tap to switch'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Mobile Bottom Navigation (Instagram-style) ── */}
      <nav
        className="lg:hidden"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          backgroundColor: 'rgba(0,0,0,0.97)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid var(--sec-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-around', height: 64, paddingLeft: 4, paddingRight: 4 }}>
          {mobileNav.map((item) => {
            const isCreate = item.isCreate;
            const active = isCreate ? showCreateModal : isActive(item.page);
            const navContent = (
              <>
                {active && !isCreate && (
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 2, background: 'var(--sec-gradient-silver)', borderRadius: 2 }} />
                )}
                {isCreate ? (
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--sec-gradient-silver)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(192,192,192,0.22)', color: 'var(--sec-bg-base)' }}>
                    <item.icon size={22} strokeWidth={2} />
                  </div>
                ) : (
                  <item.icon size={24} strokeWidth={1.5} />
                )}
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', color: 'inherit' }}>{item.name}</span>
              </>
            );
            // Instagram-style: long-press or double-tap Profile to switch modes (if multiple)
            const isProfile = item.page === 'Profile';
            const openModeSwitcher = () => {
              if (availableModes.length > 1) setShowModeSwitcher(true);
            };

            return isCreate ? (
              <button
                key="create"
                onClick={() => setShowCreateModal(true)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  padding: '12px 8px', flex: 1, minWidth: 0, border: 'none', background: 'none', cursor: 'pointer',
                  color: 'var(--sec-accent)',
                }}
              >
                {navContent}
              </button>
            ) : (
              isProfile ? (
                <button
                  key={item.page}
                  onClick={() => navigate(createPageUrl(item.page))}
                  onDoubleClick={openModeSwitcher}
                  onTouchStart={() => {
                    if (availableModes.length <= 1) return;
                    longPressTimerRef.current = window.setTimeout(() => {
                      setShowModeSwitcher(true);
                    }, 450);
                  }}
                  onTouchEnd={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  onTouchCancel={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: '12px 8px',
                    flex: 1,
                    minWidth: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                  }}
                >
                  {navContent}
                </button>
              ) : (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    padding: '12px 8px', flex: 1, minWidth: 0, textDecoration: 'none',
                    color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                  }}
                >
                  {navContent}
                </Link>
              )
            );
          })}
        </div>
      </nav>
    </div>
  );
}
