import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from './utils';
import { prefetchPage } from './pages.config';
import * as authService from '@/services/authService';
import { useAuth } from '@/lib/AuthContext';
import { dataService } from '@/services/dataService';
import { apiGet } from '@/api/client';
import { flushPendingLegalAccepts } from '@/lib/pendingLegalAccept';
import SecLogo from '@/components/ui/SecLogo';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useIsMobile } from '@/hooks/useIsDesktop';
import { shouldShowMobileBackHeader, getMobilePageTitle } from '@/lib/mobilePageShell';
import { BUSINESS_PAGE_PERMISSIONS, useVenueStaffAccess } from '@/hooks/useVenueStaffAccess';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { getMobileNavState } from '@/lib/mobileNavVisibility';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Home, Users, Plus, MessageCircle, User, Calendar, Briefcase, Bell, Trophy, Crown,
  LayoutDashboard, BarChart3, Building2, Megaphone, BookOpen, Settings, Music2, Shield
} from 'lucide-react';

const iconProps = { size: 22, strokeWidth: 1.5 };

const MODES = [
  { id: 'partygoer', label: 'Party Goer', icon: Music2 },
  { id: 'business', label: 'Business', icon: Building2 },
];

function filterBusinessNav(items, canAccessPage, can) {
  return items.filter((item) => {
    if (item.isCreate) return can('events');
    if (!item.page) return false;
    if (item.page === 'Settings' || item.page === 'Notifications') return true;
    return canAccessPage(item.page);
  });
}

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile } = useAuth();
  const staffAccess = useVenueStaffAccess();
  const [notificationCount, setNotificationCount] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);
  const [hostUnread, setHostUnread] = useState(0);
  const prevMessageUnreadRef = useRef(null);
  const [activeMode, setActiveMode] = useState(null);
  const [userRoles, setUserRoles] = useState({ partygoer: true, host: false, business: false });
  const [showModeSwitcher, setShowModeSwitcher] = useState(false);
  const [complianceAccess, setComplianceAccess] = useState({ canReview: false, isSuperAdmin: false });
  const [hasStaffAssignments, setHasStaffAssignments] = useState(false);

  function playMessageChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 140);
    } catch {}
  }

  useEffect(() => {
    if (prevMessageUnreadRef.current !== null && messageUnread > prevMessageUnreadRef.current) {
      playMessageChime();
    }
    prevMessageUnreadRef.current = messageUnread;
  }, [messageUnread]);

  const fetchNotificationCounts = useCallback(async () => {
    if (!user?.id) return;
    const msgUrl =
      activeMode === 'business' ? '/api/business/inbox/unread-count' : '/api/messages/unread-total';
    const [unreadRes, msgRes, hostRes] = await Promise.allSettled([
      apiGet('/api/notifications/unread-count'),
      apiGet(msgUrl),
      apiGet('/api/host/notifications/unread-count'),
    ]);
    if (unreadRes.status === 'fulfilled') {
      const u = unreadRes.value;
      setNotificationCount(typeof u?.count === 'number' ? u.count : 0);
    } else {
      setNotificationCount(0);
    }
    if (msgRes.status === 'fulfilled') {
      const m = msgRes.value;
      const n = typeof m?.total === 'number' ? m.total : typeof m?.count === 'number' ? m.count : 0;
      setMessageUnread(n);
    } else {
      setMessageUnread(0);
    }
    if (hostRes.status === 'fulfilled') {
      const h = hostRes.value;
      setHostUnread(typeof h?.count === 'number' ? h.count : 0);
    } else {
      setHostUnread(0);
    }
  }, [user?.id, activeMode]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchNotificationCounts();
    };
    tick();
    const timer = window.setInterval(tick, 90000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user?.id, fetchNotificationCounts]);

  useEffect(() => {
    const onRefresh = () => fetchNotificationCounts();
    window.addEventListener('sec_notifications_refresh', onRefresh);
    return () => window.removeEventListener('sec_notifications_refresh', onRefresh);
  }, [fetchNotificationCounts]);

  useEffect(() => {
    if (!user?.id) {
      setNotificationCount(0);
      setMessageUnread(0);
      setHostUnread(0);
      setUserRoles({ partygoer: true, host: false, business: false });
      setActiveMode(null);
      setComplianceAccess({ canReview: false, isSuperAdmin: false });
      setHasStaffAssignments(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        await flushPendingLegalAccepts();
      } catch {}
      let ownsVenue = user.role === 'VENUE';
      try {
        const rolesRes = await apiGet('/api/user-roles/me');
        if (rolesRes?.business) ownsVenue = true;
      } catch {}
      if (!ownsVenue) {
        try {
          const venues = await dataService.Venue.mine();
          const list = Array.isArray(venues) ? venues : [];
          ownsVenue = list.some((v) => v.is_owner === true || v.isOwner === true);
        } catch {}
      }
      if (cancelled) return;
      setUserRoles({ partygoer: true, host: true, business: ownsVenue });

      const saved = localStorage.getItem('sec_active_mode');
      let defaultMode = 'partygoer';
      if (saved === 'business' && ownsVenue) defaultMode = 'business';
      else if (saved === 'partygoer') defaultMode = 'partygoer';
      else if (ownsVenue) defaultMode = 'business';
      else defaultMode = 'partygoer';
      if (saved === 'business' && !ownsVenue) {
        localStorage.setItem('sec_active_mode', 'partygoer');
      }
      setActiveMode(defaultMode);

      try {
        const access = await apiGet('/api/compliance-documents/me/access');
        if (!cancelled) {
          setComplianceAccess({
            canReview: !!access?.canReview,
            isSuperAdmin: !!access?.isSuperAdmin,
          });
        }
      } catch {
        if (!cancelled) setComplianceAccess({ canReview: false, isSuperAdmin: false });
      }

      try {
        const staffVenues = await apiGet('/api/staff/venues');
        if (!cancelled) {
          const staffList = Array.isArray(staffVenues) ? staffVenues : (staffVenues?.items || []);
          setHasStaffAssignments(staffList.length > 0);
        }
      } catch {
        if (!cancelled) setHasStaffAssignments(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, user?.role]);

  const switchMode = (mode) => {
    setActiveMode(mode);
    localStorage.setItem('sec_active_mode', mode);
    window.dispatchEvent(new CustomEvent('sec_active_mode_changed', { detail: { mode } }));
  };

  useEffect(() => {
    if (!user?.id) return undefined;
    const pages = ['Notifications', 'Friends', 'Profile', 'Messages', 'HostDashboard', 'Events', 'Home'];
    const run = () => {
      pages.forEach((p) => prefetchPage(p));
    };
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(run, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const tid = window.setTimeout(run, 2000);
    return () => clearTimeout(tid);
  }, [user?.id]);

  const prefetchNav = (page) => {
    if (page) prefetchPage(page);
  };

  const modeForGuard =
    activeMode && userRoles[activeMode] ? activeMode : (userRoles.business ? 'business' : 'partygoer');

  useEffect(() => {
    if (!user || !staffAccess.isStaffOnly || staffAccess.venuesLoading) return;
    if (currentPageName === 'BusinessDashboard' && !staffAccess.can('dashboard')) {
      navigate(createPageUrl('StaffDashboard'), { replace: true });
      return;
    }
    if (modeForGuard !== 'business') return;
    const perm = BUSINESS_PAGE_PERMISSIONS[currentPageName];
    if (perm && !staffAccess.can(perm)) {
      navigate(createPageUrl('StaffDashboard'), { replace: true });
    }
  }, [user, modeForGuard, staffAccess.isStaffOnly, staffAccess.venuesLoading, staffAccess.can, currentPageName, navigate]);

  const { hideBottomNav } = getMobileNavState({ pageName: currentPageName, searchParams });
  const navScrollCompact = useScrollDirection({ enabled: !hideBottomNav });
  const isMobile = useIsMobile();
  const showLayoutBackHeader = isMobile && shouldShowMobileBackHeader(currentPageName);

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

  const badge = Math.max(0, Number(notificationCount) || 0);
  const availableModes = MODES.filter(m => userRoles[m.id]);
  const complianceNavItem = complianceAccess.canReview
    ? [{ name: 'Compliance Review', icon: Shield, page: 'AdminDashboard', query: '?tab=compliance-documents' }]
    : [];

  const NAV = {
    partygoer: {
      primary: [
        { name: 'Home', icon: Home, page: 'Home' },
        { name: 'Host', icon: Crown, page: 'HostDashboard' },
        { name: 'Friends', icon: Users, page: 'Friends' },
        { name: 'Create', icon: Plus, page: 'HostDashboard', query: '?create=table' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ],
      secondary: [
        { name: 'Events', icon: Calendar, page: 'Events' },
        { name: 'Jobs', icon: Briefcase, page: 'Jobs' },
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        { name: 'Leaderboard', icon: Trophy, page: 'Leaderboard' },
        ...(hasStaffAssignments ? [{ name: 'Staff Dashboard', icon: Shield, page: 'StaffDashboard' }] : []),
        ...complianceNavItem,
        ...((['SUPER_ADMIN', 'ADMIN', 'admin'].includes(user?.role)) ? [{ name: 'Admin', icon: LayoutDashboard, page: 'AdminDashboard' }] : []),
      ],
    },
    business: {
      primary: [
        { name: 'Dashboard', icon: LayoutDashboard, page: 'BusinessDashboard' },
        { name: 'Analytics', icon: BarChart3, page: 'VenueAnalytics' },
        { name: 'Venue', icon: Building2, page: 'VenueProfile' },
        { name: 'Events', icon: Calendar, page: 'BusinessEvents' },
        { name: 'Bookings', icon: BookOpen, page: 'BusinessBookings' },
        { name: 'Menu', icon: BookOpen, page: 'BusinessMenu' },
      ],
      secondary: [
        { name: 'Post Job', icon: Briefcase, page: 'CreateJob' },
        { name: 'Jobs', icon: Briefcase, page: 'BusinessJobs' },
        { name: 'Promotions', icon: Megaphone, page: 'BusinessPromotions' },
        { name: 'Messages', icon: MessageCircle, page: 'BusinessMessages' },
        { name: 'Notifications', icon: Bell, page: 'Notifications', badge },
        ...complianceNavItem,
        { name: 'Settings', icon: Settings, page: 'Settings' },
      ],
    },
  };

  const mode = modeForGuard;
  const { primary: primaryNav, secondary: secondaryNav } = NAV[mode];

  const filterNavForStaff = (items) =>
    mode === 'business' && staffAccess.isStaffOnly
      ? filterBusinessNav(items, staffAccess.canAccessPage, staffAccess.can)
      : items;

  const withMessageBadge = (items) =>
    items.map((item) => {
      if ((item.page === 'Messages' || item.page === 'BusinessMessages') && messageUnread > 0) {
        return { ...item, badge: messageUnread };
      }
      if (item.page === 'HostDashboard' && hostUnread > 0) return { ...item, badge: hostUnread };
      return item;
    });
  const primaryNavB = withMessageBadge(filterNavForStaff(primaryNav));
  const secondaryNavB = withMessageBadge(filterNavForStaff(secondaryNav));

  // Mobile: Unified 5-tab bottom nav — Home, Events, Create, Messages, Profile
  let mobileNav = mode === 'business'
    ? [
        { name: 'Home', icon: LayoutDashboard, page: 'BusinessDashboard' },
        { name: 'Events', icon: Calendar, page: 'BusinessEvents' },
        { name: 'Create', icon: Plus, page: null, isCreate: true },
        { name: 'Messages', icon: MessageCircle, page: 'BusinessMessages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ]
    : [
        { name: 'Home', icon: Home, page: 'Home' },
        { name: 'Host', icon: Crown, page: 'HostDashboard' },
        { name: 'Create', icon: Plus, page: 'HostDashboard', query: '?create=table' },
        { name: 'Messages', icon: MessageCircle, page: 'Messages' },
        { name: 'Profile', icon: User, page: 'Profile' },
      ];
  mobileNav = withMessageBadge(filterNavForStaff(mobileNav));

  const isActive = (page) => {
    if (page === 'CreateJob' && currentPageName === 'CreateJob') return true;
    return currentPageName === page;
  };

  if (currentPageName === 'TicketVerify') {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
        {children}
      </div>
    );
  }

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
          <Link to={createPageUrl('Home')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }} onMouseEnter={() => prefetchNav('Home')} onFocus={() => prefetchNav('Home')}>
            <SecLogo size={48} variant="full" />
          </Link>
        </div>

        {user && mode === 'business' && (
          <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--sec-border)' }}>
            <VenueSwitcher className="w-full" />
          </div>
        )}

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
          {primaryNavB.map((item) => (
              <Link
                key={item.page + item.name + (item.query || '')}
                to={item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page)}
                className="sec-nav-item"
                onMouseEnter={() => prefetchNav(item.page)}
                onFocus={() => prefetchNav(item.page)}
                style={{ position: 'relative', ...(isActive(item.page) ? { color: 'var(--sec-text-primary)', backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' } : {}) }}
              >
                <item.icon {...iconProps} />
                <span>{item.name}</span>
                {item.page === 'HostDashboard' && item.query === '?create=table' && (
                  <span className="sec-badge sec-badge-gold" style={{ marginLeft: 'auto' }}>New</span>
                )}
                {item.badge > 0 && (
                  <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'var(--sec-accent)', color: '#000', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
          ))}
          <div style={{ margin: '10px 2px', height: 1, backgroundColor: 'var(--sec-border)' }} />
          {secondaryNavB.map((item) => (
            <Link
              key={item.page + item.name}
              to={item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page)}
              className="sec-nav-item"
              onMouseEnter={() => prefetchNav(item.page)}
              onFocus={() => prefetchNav(item.page)}
              style={{ position: 'relative', ...(isActive(item.page) ? { color: 'var(--sec-text-primary)', backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' } : {}) }}
            >
              <item.icon {...iconProps} />
              <span>{item.name}</span>
              {item.badge > 0 && (
                <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: item.page === 'Messages' ? 'var(--sec-accent)' : 'var(--sec-error)', color: item.page === 'Messages' ? '#000' : '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div style={{ padding: 10, borderTop: '1px solid var(--sec-border)' }}>
          {userProfile ? (
            <Link to={createPageUrl('Profile')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, textDecoration: 'none', color: 'inherit', transition: 'background-color 0.15s' }} onMouseEnter={(e) => { prefetchNav('Profile'); e.currentTarget.style.backgroundColor = 'var(--sec-bg-card)'; }} onFocus={() => prefetchNav('Profile')} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
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
        className={`lg:ml-[240px] min-h-screen w-full lg:w-[calc(100%-240px)] max-w-app md:max-w-app-md lg:max-w-none mx-auto lg:mx-0 px-4 sm:px-6 box-border min-w-0 lg:pb-10 ${
          hideBottomNav ? 'pb-[env(safe-area-inset-bottom)]' : 'pb-[calc(88px+env(safe-area-inset-bottom))]'
        }`}
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
        {showLayoutBackHeader ? (
          <PageBackHeader
            title={getMobilePageTitle(currentPageName)}
            pageName={currentPageName}
          />
        ) : null}
        {children}
      </main>


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
                    const dest = m.id === 'business' ? 'BusinessDashboard' : 'Home';
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

      {!hideBottomNav ? (
        <MobileBottomNav
          items={mobileNav}
          isActive={isActive}
          compact={navScrollCompact}
          availableModes={availableModes}
          onOpenModeSwitcher={() => setShowModeSwitcher(true)}
          onPrefetch={prefetchNav}
        />
      ) : null}
    </div>
  );
}
