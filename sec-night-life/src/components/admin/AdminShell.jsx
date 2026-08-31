import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Loader2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet } from '@/api/client';
import { enterPartygoerMode } from '@/lib/activeViewMode';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useIsMobile } from '@/hooks/useIsDesktop';
import {
  ADMIN_TABS,
  getTabLabel,
  getVisibleSections,
} from './adminUtils';

const AdminOverviewPanel = lazy(() => import('./AdminOverviewPanel'));
const AdminAnnouncementsPanel = lazy(() => import('./AdminAnnouncementsPanel'));
const AdminPromotersPanel = lazy(() => import('./AdminPromotersPanel'));
const AdminReportsPanel = lazy(() => import('./AdminReportsPanel'));
const AdminPaymentsPanel = lazy(() => import('./AdminPaymentsPanel'));
const AdminUsersPanel = lazy(() => import('./AdminUsersPanel'));
const AdminVenuesPanel = lazy(() => import('./AdminVenuesPanel'));
const AdminFlaggedReviewsPanel = lazy(() => import('./AdminFlaggedReviewsPanel'));
const AdminComplianceDocumentsPanel = lazy(() => import('./AdminComplianceDocumentsPanel'));

function PanelFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--sec-accent)' }} />
    </div>
  );
}

function TabButton({ tabId, active, flaggedCount, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onClick(tabId)}
      className={`text-sm font-medium capitalize whitespace-nowrap px-3 min-h-[44px] rounded-lg transition-colors ${className}`}
      style={{
        color: active ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
        backgroundColor: active ? 'rgba(212, 175, 55, 0.08)' : 'transparent',
        border: active ? '1px solid rgba(212, 175, 55, 0.25)' : '1px solid transparent',
      }}
    >
      {getTabLabel(tabId, tabId === 'flagged-reviews' ? flaggedCount : undefined)}
    </button>
  );
}

export default function AdminShell() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const requestedVenueId = searchParams.get('venueId');

  const [user, setUser] = useState(null);
  const [complianceAccess, setComplianceAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flaggedCount, setFlaggedCount] = useState(null);

  const tab = searchParams.get('tab') || 'overview';

  const canAdminDashboard = Boolean(user?.can_admin_dashboard) || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const isSuperAdminUser = Boolean(
    complianceAccess?.isSuperAdmin || user?.role === 'SUPER_ADMIN',
  );

  const visibleTabs = useMemo(() => {
    if (!user) return [];
    if (isSuperAdminUser || canAdminDashboard) return ADMIN_TABS;
    if (complianceAccess?.canReview) return ['compliance-documents'];
    return [];
  }, [user, isSuperAdminUser, canAdminDashboard, complianceAccess?.canReview]);

  const visibleSections = useMemo(() => getVisibleSections(visibleTabs), [visibleTabs]);

  const activeSection = useMemo(() => {
    const match = visibleSections.find((section) => section.tabs.includes(tab));
    return match?.id || visibleSections[0]?.id || null;
  }, [visibleSections, tab]);

  useEffect(() => {
    enterPartygoerMode();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);

        let access = null;
        try {
          access = await apiGet('/api/compliance-documents/me/access');
        } catch {
          access = { canReview: false, isSuperAdmin: false };
        }
        setComplianceAccess(access);

        const hasAdminDashboard = Boolean(u?.can_admin_dashboard) || ['ADMIN', 'SUPER_ADMIN'].includes(u?.role);
        const hasComplianceReview = !!access?.canReview;
        if (!hasAdminDashboard && !hasComplianceReview) {
          navigate(createPageUrl('Home'));
          return;
        }

        if (!hasAdminDashboard && hasComplianceReview) {
          const requested = searchParams.get('tab');
          if (!requested || requested !== 'compliance-documents') {
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'compliance-documents');
            setSearchParams(next, { replace: true });
          }
        }
      } catch (e) {
        if (e?.status === 403) navigate(createPageUrl('Home'));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!visibleTabs.length) return;
    const requested = searchParams.get('tab');
    if (requested && visibleTabs.includes(requested)) return;

    const fallback = visibleTabs[0];
    const next = new URLSearchParams(searchParams);
    next.set('tab', fallback);
    setSearchParams(next, { replace: true });
  }, [visibleTabs, searchParams, setSearchParams]);

  const handleTabChange = (newTab) => {
    if (!visibleTabs.includes(newTab)) return;
    const next = new URLSearchParams(searchParams);
    next.set('tab', newTab);
    if (requestedVenueId) next.set('venueId', requestedVenueId);
    setSearchParams(next);
  };

  const handleSectionChange = (sectionId) => {
    const section = visibleSections.find((s) => s.id === sectionId);
    if (!section?.tabs.length) return;
    const currentInSection = section.tabs.includes(tab);
    if (!currentInSection) {
      handleTabChange(section.tabs[0]);
    }
  };

  const renderPanel = () => {
    switch (tab) {
      case 'overview':
        return <AdminOverviewPanel onTabChange={handleTabChange} />;
      case 'announcements':
        return <AdminAnnouncementsPanel />;
      case 'promoters':
        return <AdminPromotersPanel />;
      case 'reports':
        return <AdminReportsPanel />;
      case 'payments':
        return <AdminPaymentsPanel />;
      case 'users':
        return <AdminUsersPanel />;
      case 'venues':
        return <AdminVenuesPanel />;
      case 'flagged-reviews':
        return <AdminFlaggedReviewsPanel onFlaggedCountChange={setFlaggedCount} />;
      case 'compliance-documents':
        return (
          <AdminComplianceDocumentsPanel
            complianceAccess={complianceAccess}
            requestedVenueId={requestedVenueId}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--sec-accent)' }} />
      </div>
    );
  }

  if (!user) return null;

  const activeSectionData = visibleSections.find((s) => s.id === activeSection);

  return (
    <div className="min-h-screen pb-24 lg:pb-10 max-w-[1200px] mx-auto">
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/95 backdrop-blur-xl border-b border-[#262629]">
        {isMobile ? (
          <PageBackHeader
            title="Admin Dashboard"
            subtitle="Suspended accounts, payments & verification"
            pageName="AdminDashboard"
            onBack={() => {
              enterPartygoerMode();
              navigate(createPageUrl('Home'));
            }}
          />
        ) : (
          <div className="px-4 py-4">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <LayoutDashboard size={22} style={{ color: 'var(--sec-accent)' }} />
              Admin Dashboard
            </h1>
            <p className="text-sm text-[var(--sec-text-muted)] mt-1">Suspended accounts, payments & verification</p>
          </div>
        )}

        {isMobile && visibleSections.length > 1 && (
          <div className="px-3 pb-2 flex gap-2 overflow-x-auto">
            {visibleSections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.id)}
                className="px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wide whitespace-nowrap min-h-[44px]"
                style={{
                  color: activeSection === section.id ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                  backgroundColor: activeSection === section.id ? 'rgba(212, 175, 55, 0.12)' : '#141416',
                  border: `1px solid ${activeSection === section.id ? 'rgba(212, 175, 55, 0.35)' : '#262629'}`,
                }}
              >
                {section.label}
              </button>
            ))}
          </div>
        )}

        {isMobile && activeSectionData && activeSectionData.tabs.length > 1 && (
          <div className="px-3 pb-3 flex gap-2 overflow-x-auto border-b border-[#262629]">
            {activeSectionData.tabs.map((t) => (
              <TabButton
                key={t}
                tabId={t}
                active={tab === t}
                flaggedCount={flaggedCount}
                onClick={handleTabChange}
              />
            ))}
          </div>
        )}
      </header>

      <div className="lg:flex lg:gap-6 lg:p-4">
        {!isMobile && visibleSections.length > 0 && (
          <aside className="hidden lg:block w-56 shrink-0">
            <nav className="sticky top-28 space-y-5">
              {visibleSections.map((section) => (
                <div key={section.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--sec-text-muted)] px-2 mb-2">
                    {section.label}
                  </p>
                  <div className="space-y-1">
                    {section.tabs.map((t) => (
                      <TabButton
                        key={t}
                        tabId={t}
                        active={tab === t}
                        flaggedCount={flaggedCount}
                        onClick={handleTabChange}
                        className="w-full text-left px-3 py-2.5"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        )}

        <main className="flex-1 p-4 min-w-0">
          <Suspense fallback={<PanelFallback />}>
            {renderPanel()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
