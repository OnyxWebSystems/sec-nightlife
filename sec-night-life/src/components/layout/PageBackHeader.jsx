import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { MOBILE_PAGE_PARENT, mobileBackNavigate } from '@/lib/mobileBackNavigation';
import { useIsMobile } from '@/hooks/useIsDesktop';
import { useStaffVenueOptional } from '@/context/StaffVenueContext';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';

/**
 * Sticky back header for drill-down pages (business tools, settings subpages, messages).
 */
export default function PageBackHeader({
  title,
  subtitle,
  onBack,
  fallbackTo,
  pageName = null,
  rightSlot = null,
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const staffVenueCtx = useStaffVenueOptional();
  const venueScope = useBusinessVenueScope();

  const staffSubtitle =
    venueScope.inStaffSession && venueScope.venueName && !subtitle
      ? `Managing ${venueScope.venueName} · Staff`
      : null;
  const displaySubtitle = subtitle ?? staffSubtitle;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (isMobile && pageName) {
      mobileBackNavigate(navigate, setSearchParams, pageName, searchParams, {
        inStaffSession: venueScope.inStaffSession,
        clearStaffContext: staffVenueCtx?.clearStaffContext,
        staffContextToken: venueScope.staffContextToken,
      });
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    const parent = fallbackTo || (pageName && MOBILE_PAGE_PARENT[pageName]) || 'Home';
    navigate(createPageUrl(parent));
  };

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md pt-[env(safe-area-inset-top)]"
      style={{
        backgroundColor: 'rgba(10, 10, 11, 0.92)',
        borderColor: 'var(--sec-border)',
      }}
    >
      <div className="px-4 py-3 flex items-center gap-3 min-h-[44px]">
        <button
          type="button"
          onClick={handleBack}
          className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0 transition-colors active:ring-2 active:ring-[var(--sec-accent)]/40"
          style={{ backgroundColor: 'var(--sec-bg-elevated)' }}
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
        </button>
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="text-lg font-bold truncate" style={{ color: 'var(--sec-text-primary)' }}>
              {title}
            </h1>
          ) : null}
          {displaySubtitle ? (
            <p className="text-xs truncate" style={{ color: 'var(--sec-text-muted)' }}>
              {displaySubtitle}
            </p>
          ) : null}
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
