import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import {
  LayoutDashboard,
  BarChart3,
  BookOpen,
  Megaphone,
  Calendar,
  UtensilsCrossed,
  Briefcase,
  MessageCircle,
  Building2,
  ChevronRight,
  Loader2,
  Shield,
} from 'lucide-react';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { STAFF_PERMISSIONS } from '@/components/business/AddStaffModal';

const PERM_PAGES = {
  dashboard: { page: 'BusinessDashboard', label: 'Dashboard', icon: LayoutDashboard },
  analytics: { page: 'VenueAnalytics', label: 'Analytics', icon: BarChart3 },
  bookings: { page: 'BusinessBookings', label: 'Bookings', icon: BookOpen },
  promotions: { page: 'BusinessPromotions', label: 'Promotions', icon: Megaphone },
  events: { page: 'BusinessEvents', label: 'Events', icon: Calendar },
  menu: { page: 'BusinessMenu', label: 'Menu', icon: UtensilsCrossed },
  jobs: { page: 'BusinessJobs', label: 'Jobs', icon: Briefcase },
  posts: { page: 'BusinessPromotions', label: 'Posts', icon: Megaphone },
  messages: { page: 'BusinessMessages', label: 'Messages', icon: MessageCircle },
  venue_page: { page: 'VenueProfile', label: 'Venue page', icon: Building2 },
};

function permLabel(key) {
  return STAFF_PERMISSIONS.find((p) => p.key === key)?.label || key;
}

export default function StaffDashboard() {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['staff-venues'],
    queryFn: () => apiGet('/api/staff/venues'),
  });

  return (
    <div className="sec-page max-w-2xl mx-auto pb-24">
      <PageBackHeader
        title="Staff dashboard"
        subtitle="Venues you can help manage and your assigned permissions"
      />
      <div className="px-4 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin" style={{ color: 'var(--sec-accent)' }} />
          </div>
        ) : assignments.length === 0 ? (
          <div
            className="sec-card p-8 text-center"
            style={{ border: '1px solid var(--sec-border)' }}
          >
            <Shield size={32} className="mx-auto mb-3" style={{ color: 'var(--sec-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
              No staff assignments yet. A venue owner can invite you from their business dashboard.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.map((row) => {
              const perms = row.permissions || {};
              const enabledKeys = Object.keys(perms).filter((k) => perms[k]);
              return (
                <div
                  key={row.venueId || row.id}
                  className="sec-card p-5"
                  style={{ border: '1px solid var(--sec-border)' }}
                >
                  <div className="flex items-start gap-3 mb-4">
                    {row.venueLogoUrl ? (
                      <img
                        src={row.venueLogoUrl}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover"
                        style={{ border: '1px solid var(--sec-border)' }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: 'var(--sec-accent-muted)' }}
                      >
                        <Building2 size={20} style={{ color: 'var(--sec-accent)' }} />
                      </div>
                    )}
                    <div>
                      <h2 className="font-semibold text-lg">{row.venueName || 'Venue'}</h2>
                      {row.venueCity ? (
                        <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                          {row.venueCity}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sec-text-muted)' }}>
                    Your permissions
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {enabledKeys.length === 0 ? (
                      <span className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                        No permissions assigned
                      </span>
                    ) : (
                      enabledKeys.map((key) => (
                        <span key={key} className="sec-badge sec-badge-gold text-xs">
                          {permLabel(key)}
                        </span>
                      ))
                    )}
                  </div>

                  {enabledKeys.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--sec-text-muted)' }}>
                        Quick links
                      </p>
                      {enabledKeys.map((key) => {
                        const meta = PERM_PAGES[key];
                        if (!meta) return null;
                        const Icon = meta.icon;
                        return (
                          <Link
                            key={key}
                            to={createPageUrl(meta.page)}
                            className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                            style={{
                              backgroundColor: 'var(--sec-bg-elevated)',
                              border: '1px solid var(--sec-border)',
                              textDecoration: 'none',
                              color: 'var(--sec-text-primary)',
                            }}
                          >
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: 'var(--sec-accent-muted)' }}
                            >
                              <Icon size={16} style={{ color: 'var(--sec-accent)' }} />
                            </div>
                            <span className="flex-1 text-sm font-medium">{meta.label}</span>
                            <ChevronRight size={16} style={{ color: 'var(--sec-text-muted)' }} />
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
