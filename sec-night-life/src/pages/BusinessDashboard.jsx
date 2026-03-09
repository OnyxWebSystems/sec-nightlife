import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import {
  Calendar, BookOpen, Megaphone, BarChart3,
  Star, Users, ArrowRight, Building2, Plus,
  ChevronRight, AlertCircle, Briefcase
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="sec-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          backgroundColor: 'var(--sec-accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} style={{ color: 'var(--sec-accent)' }} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--sec-text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function QuickAction({ icon: Icon, label, page }) {
  return (
    <Link
      to={createPageUrl(page)}
      className="sec-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', textDecoration: 'none',
        color: 'var(--sec-text-primary)', transition: 'border-color 0.15s',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: 'var(--sec-accent-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: 'var(--sec-accent)' }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--sec-text-muted)' }} />
    </Link>
  );
}

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user.id }),
    enabled: !!user,
  });

  const venue = venues[0];

  const { data: events = [] } = useQuery({
    queryKey: ['biz-events', venue?.id],
    queryFn: () => dataService.Event.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['biz-tables', venue?.id],
    queryFn: () => dataService.Table.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['biz-reviews', venue?.id],
    queryFn: () => dataService.Review.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  if (!user) return null;

  if (venuesLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div style={{ padding: 24, maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
          backgroundColor: 'var(--sec-accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={28} style={{ color: 'var(--sec-accent)' }} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No Venue Registered</h2>
        <p style={{ color: 'var(--sec-text-muted)', fontSize: 14, marginBottom: 24 }}>
          Register your venue to access the full business dashboard with analytics, event management, and more.
        </p>
        <Button
          onClick={() => navigate(createPageUrl('VenueOnboarding'))}
          className="sec-btn sec-btn-primary h-12 px-8 rounded-xl"
        >
          Register Your Venue
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = events
    .filter(e => e.date >= today && e.status === 'published')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const totalBookings = tables.length;
  const activeBookings = tables.filter(t => t.status === 'open' || t.status === 'active').length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '—';
  const totalGuests = tables.reduce((s, t) => s + (t.current_guests || 0), 0);

  return (
    <div style={{ padding: 'var(--space-6) var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {venue.logo_url && (
            <img src={venue.logo_url} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--sec-border)' }} />
          )}
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)' }}>
              {venue.name}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
              {venue.city} &middot; {venue.venue_type?.replace('_', ' ')}
              {' '}&middot;{' '}
              <span style={{
                color: venue.compliance_status === 'approved'
                  ? 'var(--sec-success)'
                  : 'var(--sec-warning)',
              }}>
                {venue.compliance_status || 'Pending'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Compliance Notice */}
      {venue.compliance_status !== 'approved' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderRadius: 12, marginBottom: 20,
          backgroundColor: 'var(--sec-warning-muted)', border: '1px solid rgba(212,160,23,0.2)',
        }}>
          <AlertCircle size={18} style={{ color: 'var(--sec-warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--sec-warning)' }}>
            Your venue compliance is pending review. Some features may be limited until documents are submitted and approved.
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard icon={Calendar} label="Total Events" value={events.length} sub={`${upcomingEvents.length} upcoming`} />
        <StatCard icon={BookOpen} label="Table Bookings" value={totalBookings} sub={`${activeBookings} active`} />
        <StatCard icon={Star} label="Average Rating" value={avgRating} sub={`${reviews.length} reviews`} />
        <StatCard icon={Users} label="Total Guests" value={totalGuests} />
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <QuickAction icon={Plus} label="Create Event" page="BusinessEvents" />
          <QuickAction icon={BookOpen} label="Manage Bookings" page="BusinessBookings" />
          <QuickAction icon={BarChart3} label="View Analytics" page="VenueAnalytics" />
          <QuickAction icon={Megaphone} label="Promotions & AI" page="BusinessPromotions" />
          <QuickAction icon={Briefcase} label="Post Jobs" page="Jobs" />
        </div>
      </div>

      {/* Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="biz-grid-responsive">
        {/* Upcoming Events */}
        <div className="sec-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Upcoming Events</h3>
            <Link to={createPageUrl('BusinessEvents')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none' }}>View all</Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Calendar size={24} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>No upcoming events</p>
              <Link to={createPageUrl('BusinessEvents')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none', marginTop: 6, display: 'inline-block' }}>
                Create your first event
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcomingEvents.map(evt => (
                <div key={evt.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    backgroundColor: 'var(--sec-accent-muted)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sec-accent)', lineHeight: 1 }}>
                      {new Date(evt.date + 'T00:00').toLocaleDateString('en', { day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--sec-text-muted)', textTransform: 'uppercase' }}>
                      {new Date(evt.date + 'T00:00').toLocaleDateString('en', { month: 'short' })}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {evt.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{evt.city}</div>
                  </div>
                  <span className={`sec-badge ${evt.status === 'published' ? 'sec-badge-success' : 'sec-badge-gold'}`}>
                    {evt.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Bookings */}
        <div className="sec-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Recent Bookings</h3>
            <Link to={createPageUrl('BusinessBookings')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none' }}>View all</Link>
          </div>
          {tables.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <BookOpen size={24} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>No table bookings yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tables.slice(0, 5).map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    backgroundColor: 'var(--sec-accent-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Users size={16} style={{ color: 'var(--sec-accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
                      {t.current_guests || 0}/{t.max_guests || '—'} guests
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>
                      Min spend: R{t.min_spend || 0}
                    </div>
                  </div>
                  <span className={`sec-badge ${t.status === 'open' ? 'sec-badge-success' : 'sec-badge-muted'}`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .biz-grid-responsive { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
