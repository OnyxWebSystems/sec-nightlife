import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { ChevronRight, Search, SlidersHorizontal, BadgeCheck, Trophy, Bell, Users } from 'lucide-react';

import FeaturedEventCard from '@/components/home/FeaturedEventCard';
import VenueCard from '@/components/home/VenueCard';
import QuickActions from '@/components/home/QuickActions';
import SecLogo from '@/components/ui/SecLogo';
import { getEventImage } from '@/lib/placeholders';

function getOrCreateSessionId() {
  try {
    const existing = localStorage.getItem('sec_session_id');
    if (existing) return existing;
    const generated = crypto?.randomUUID ? crypto.randomUUID() : `sec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('sec_session_id', generated);
    return generated;
  } catch {
    return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Fixed width for horizontal snap row; fits small screens without overflowing. */
const PROMO_CARD_OUTER_WIDTH = 'min(320px, calc(100vw - 56px))';

const HomePromotionCard = React.memo(function HomePromotionCard({ promotion: p, onOpen }) {
  const boosted = Boolean(p.boosted);
  return (
    <div
      className="sec-card"
      role="link"
      tabIndex={0}
      aria-label={`Open ${p.venueName}`}
      onClick={() => onOpen(p)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(p);
        }
      }}
      style={{
        flex: 1,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        minHeight: 0,
        boxSizing: 'border-box',
        padding: 12,
        cursor: 'pointer',
        border: boosted ? '1px solid var(--sec-accent-border)' : '1px solid var(--sec-border)',
        background: boosted ? 'var(--sec-bg-elevated)' : 'var(--sec-bg-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {boosted && (
        <span
          style={{
            display: 'inline-block',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--sec-text-primary)',
            background: 'var(--sec-success-muted)',
            border: '1px solid var(--sec-border-strong)',
            borderRadius: 999,
            padding: '3px 8px',
            marginBottom: 8,
            flexShrink: 0,
          }}
        >
          Sponsored
        </span>
      )}
      {p.imageUrl ? (
        <div
          style={{
            width: '100%',
            maxWidth: '100%',
            aspectRatio: '16 / 9',
            maxHeight: 120,
            flexShrink: 0,
            overflow: 'hidden',
            borderRadius: 10,
            marginBottom: 10,
            background: 'var(--sec-bg-hover)',
          }}
        >
          <img
            src={p.imageUrl}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : null}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', flexShrink: 0 }}>{p.venueName} · {p.venueType}</p>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginTop: 4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {p.title}
        </h3>
        <p
          style={{
            fontSize: 13,
            color: 'var(--sec-text-secondary)',
            marginTop: 6,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {p.body}
        </p>
        <p style={{ fontSize: 12, marginTop: 6, minHeight: '2.6em', color: 'var(--sec-text-secondary)', flexShrink: 0 }}>
          {p.eventName ? `Event: ${p.eventName}` : '\u00a0'}
        </p>
        <p style={{ fontSize: 11, marginTop: 6, color: 'var(--sec-text-muted)', flexShrink: 0 }}>
          {p.targetCity || 'Nationwide'} · Offer ends {new Date(p.endsAt).toLocaleDateString()}
        </p>
      </div>
      <p style={{ fontSize: 13, color: 'var(--sec-text-secondary)', paddingTop: 10, fontWeight: 600, flexShrink: 0 }}>
        View {p.venueName}
        <ChevronRight size={14} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 4 }} />
      </p>
    </div>
  );
});

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedVenueType, setSelectedVenueType] = useState('all');
  const [promotionPage, setPromotionPage] = useState(1);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [hasMorePromotions, setHasMorePromotions] = useState(false);
  const [sessionId] = useState(() => getOrCreateSessionId());

  const { logout } = useAuth();

  useEffect(() => { loadUser(); }, []);

  /**
   * Promotions feed city: only when the user picks a city in Home filters.
   * When "All Cities" is selected we send scope=all so the API does not apply profile-based
   * city filtering (which hid promos that target another city or only the venue's city).
   */
  const promotionsExplicitCity = useMemo(() => {
    if (selectedCity && selectedCity !== 'all') return String(selectedCity).trim();
    return '';
  }, [selectedCity]);

  const loadPromotions = useCallback(async (page, append = true) => {
    setPromotionLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (promotionsExplicitCity) {
        params.set('city', promotionsExplicitCity);
      } else {
        params.set('scope', 'all');
      }
      params.set('sessionId', sessionId);
      const data = await apiGet(`/api/promotions/feed?${params.toString()}`, { headers: { 'x-session-id': sessionId } });
      const incoming = data?.results || [];
      setPromotions((prev) => (append ? [...prev, ...incoming] : incoming));
      setPromotionPage(page);
      const total = typeof data?.total === 'number' ? data.total : 0;
      setHasMorePromotions(page * 10 < total);
      incoming.forEach((promo) => {
        void apiPost(`/api/promotions/${promo.id}/track`, { type: 'VIEW', sessionId }, { skipAuth: false }).catch(() => {});
      });
    } catch {
      if (!append) setPromotions([]);
    } finally {
      setPromotionLoading(false);
    }
  }, [promotionsExplicitCity, sessionId]);

  useEffect(() => {
    if (!user && loading) return;
    void loadPromotions(1, false);
  }, [user, loading, promotionsExplicitCity, loadPromotions]);

  const handlePromotionClick = async (promotion) => {
    void apiPost(`/api/promotions/${promotion.id}/track`, { type: 'CLICK', sessionId }).catch(() => {});
    navigate(createPageUrl(`VenueProfile?id=${promotion.venueId}`));
  };

  const joinHostedTable = async (tableId) => {
    try {
      const r = await apiPost(`/api/host/tables/${tableId}/join`, {});
      queryClient.invalidateQueries(['host-tables-available']);
      if (r?.pending) {
        window.alert('Request sent. The host will approve your join.');
      }
    } catch (e) {
      window.alert(e?.message || 'Could not join table');
    }
  };

  const joinHouseParty = async (partyId) => {
    try {
      await apiPost(`/api/host/parties/${partyId}/join`, {});
      queryClient.invalidateQueries(['host-parties-public-home']);
    } catch (e) {
      window.alert(e?.message || 'Could not join party');
    }
  };

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) setUserProfile(profiles[0]);
    } catch (e) { setUser(null); }
    finally { setLoading(false); }
  };

  const { data: events = [] } = useQuery({
    queryKey: ['featured-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }, '-date', 10),
  });

  const { data: hostTablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ['host-tables-available'],
    queryFn: () => apiGet('/api/host/tables/available?limit=10&page=1'),
  });
  const hostTables = hostTablesData?.items || [];
  const { data: venueTablesData } = useQuery({
    queryKey: ['venue-tables-available'],
    queryFn: () => apiGet('/api/venue-tables/available?limit=10&page=1'),
  });
  const venueTables = venueTablesData?.items || [];

  const { data: hostPartiesData } = useQuery({
    queryKey: ['host-parties-public-home'],
    queryFn: () => apiGet('/api/host/parties/public?limit=10&page=1'),
  });
  const hostParties = hostPartiesData?.items || [];

  const { data: venues = [] } = useQuery({
    queryKey: ['all-venues'],
    queryFn: () => dataService.Venue.list(),
  });

  const cities = [...new Set(venues.map(v => v.city).filter(Boolean))];
  const followedVenueSet = new Set(userProfile?.followed_venues || []);
  const sortByFollowedVenueFirst = (items, getVenueId, tieBreaker) => {
    const withIndex = items.map((item, idx) => ({ item, idx }));
    withIndex.sort((a, b) => {
      const aFollowed = followedVenueSet.has(getVenueId(a.item));
      const bFollowed = followedVenueSet.has(getVenueId(b.item));
      if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
      const tie = tieBreaker ? tieBreaker(a.item, b.item) : 0;
      if (tie !== 0) return tie;
      return a.idx - b.idx;
    });
    return withIndex.map((x) => x.item);
  };

  const prioritizedEvents = sortByFollowedVenueFirst(
    events,
    (e) => e.venue_id,
    (a, b) => {
      const ad = a?.date ? new Date(a.date).getTime() : 0;
      const bd = b?.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    }
  );
  const filteredVenues = venues.filter(venue => {
    const matchesSearch = venue.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         venue.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCity = selectedCity === 'all' || venue.city === selectedCity;
    const matchesType = selectedVenueType === 'all' || venue.venue_type === selectedVenueType;
    return matchesSearch && matchesCity && matchesType;
  });

  const verifiedVenues = filteredVenues.filter(v => v.is_verified);
  const otherVenues = filteredVenues.filter(v => !v.is_verified);
  const featuredEvents = prioritizedEvents.filter(e => e.is_featured).slice(0, 5);
  const upcomingEvents = prioritizedEvents.slice(0, 6);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ marginBottom: 40, display: 'flex', justifyContent: 'center' }}>
            <SecLogo size={128} variant="full" />
          </div>
          <h1 className="sec-display" style={{ fontSize: 38, fontWeight: 700, marginBottom: 8 }}>SEC</h1>
          <p style={{ color: 'var(--sec-text-muted)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 24 }}>
            Your Night. Simplified.
          </p>
          <p style={{ color: 'var(--sec-text-secondary)', fontSize: 15, lineHeight: 1.65, marginBottom: 40 }}>
            Discover events, book and join tables, and connect with the nightlife community.
          </p>
          <button
            onClick={() => navigate(createPageUrl('Onboarding'))}
            className="sec-btn sec-btn-primary sec-btn-full"
            style={{ fontSize: 15 }}
          >
            Enter
          </button>
          <p style={{ marginTop: 14, color: 'var(--sec-text-muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Members only
          </p>
        </div>
      </div>
    );
  }

  const greeting = userProfile?.username || user?.full_name?.split(' ')[0] || 'there';

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40, backgroundColor: 'var(--sec-bg-base)' }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--sec-border)',
        padding: '0 20px',
        height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
            Good evening, {greeting}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', margin: 0, marginTop: 1 }}>
            What&apos;s happening tonight
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to={createPageUrl('Leaderboard')} className="sec-nav-icon" style={{ color: 'var(--sec-accent)' }}>
            <Trophy size={18} strokeWidth={1.5} />
          </Link>
          <Link to={createPageUrl('Notifications')} className="sec-nav-icon">
            <Bell size={18} strokeWidth={1.5} />
          </Link>
          <button
            onClick={() => {
              const ok = window.confirm('Sign out of SecNightlife?');
              if (ok) logout();
            }}
            className="sec-btn sec-btn-ghost"
            style={{ height: 36, padding: '0 14px', fontSize: 12, borderRadius: 'var(--radius-pill)' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ padding: '24px 20px 0' }}>

        {/* ── Quick Actions ── */}
        <div style={{ marginBottom: 32 }}>
          <QuickActions />
        </div>

        {/* ── House Parties (public) ── */}
        {hostParties.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div>
                <span className="sec-label">Community</span>
                <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                  House Parties
                </h2>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {hostParties.map((p) => (
                <div key={p.id} className="sec-card" style={{ padding: 14, borderRadius: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 8 }}>
                    {p.location} · {p.startTime && format(parseISO(p.startTime), 'EEE d MMM · HH:mm')}
                  </div>
                  {p.boosted && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--sec-success-muted)', fontSize: 10 }}>Boosted</span>
                  )}
                  <button
                    type="button"
                    className="sec-btn sec-btn-primary sec-btn-full"
                    style={{ marginTop: 12 }}
                    onClick={() => joinHouseParty(p.id)}
                  >
                    I&apos;m Going
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Featured Events ── */}
        {featuredEvents.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div>
                <span className="sec-label">Featured</span>
                <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                  Tonight&apos;s Events
                </h2>
              </div>
              <Link to={createPageUrl('Events')} className="sec-see-all">
                See all <ChevronRight size={14} strokeWidth={2} />
              </Link>
            </div>
            <div
              style={{ display: 'flex', gap: 14, overflowX: 'auto', marginLeft: -20, paddingLeft: 20, paddingRight: 20, paddingBottom: 4 }}
              className="scrollbar-hide"
            >
              {featuredEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  style={{ flexShrink: 0, width: 288 }}
                >
                  <FeaturedEventCard event={event} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ── Open Tables ── */}
        <section style={{ marginBottom: 36 }}>
          <div className="sec-section-header">
            <div>
              <span className="sec-label">Now Open</span>
              <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                Available Tables
              </h2>
            </div>
            <Link to={createPageUrl('Tables')} className="sec-see-all">
              See all <ChevronRight size={14} strokeWidth={2} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hostTables.slice(0, 8).map((table, i) => (
              <motion.div key={table.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="sec-card" style={{ padding: 14, borderRadius: 14 }}>
                  <div style={{ fontWeight: 600 }}>{table.tableName || table.venueName}</div>
                  <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                    {table.eventDate && format(parseISO(table.eventDate), 'EEE d MMM')} · {table.eventTime}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Host: {table.host?.username || '—'}
                    {table.host?.averageRating != null && ` · ★ ${Number(table.host.averageRating).toFixed(1)}`}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{table.spotsRemaining} spots left</div>
                  {table.boosted && (
                    <span style={{ fontSize: 10, marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: 'var(--sec-success-muted)' }}>Boosted</span>
                  )}
                  <button
                    type="button"
                    className="sec-btn sec-btn-secondary sec-btn-full"
                    style={{ marginTop: 12 }}
                    onClick={() => joinHostedTable(table.id)}
                  >
                    Join Table
                  </button>
                </div>
              </motion.div>
            ))}
            {venueTables.slice(0, 8).map((table, i) => (
              <motion.div key={`venue-${table.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="sec-card" style={{ padding: 14, borderRadius: 14 }}>
                  <div style={{ fontWeight: 600 }}>{table.tableName}</div>
                  <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                    Posted by {table.venue?.name || 'Venue'} · {table.spotsRemaining} spots left
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Min spend: R{Number(table.minimumSpend || 0).toFixed(0)} · Progress {Number(table.progressPercentage || 0).toFixed(1)}%
                  </div>
                  <button
                    type="button"
                    className="sec-btn sec-btn-secondary sec-btn-full"
                    style={{ marginTop: 12 }}
                    onClick={() => navigate(createPageUrl(`TableDetails?id=${table.id}&source=venue`))}
                  >
                    View & Join
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {hostTables.length === 0 && venueTables.length === 0 && !tablesLoading && (
            <div className="sec-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Users size={24} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
              </div>
              <p style={{ color: 'var(--sec-text-muted)', fontSize: 14, marginBottom: 20 }}>No open tables right now</p>
              <Link to={`${createPageUrl('HostDashboard')}?create=table`} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', padding: '10px 24px', textDecoration: 'none' }}>
                Host a Table
              </Link>
            </div>
          )}
        </section>

        {/* ── Upcoming Events (list rows) ── */}
        {upcomingEvents.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div>
                <span className="sec-label">Upcoming</span>
                <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                  Events
                </h2>
              </div>
              <Link to={createPageUrl('Events')} className="sec-see-all">
                See all <ChevronRight size={14} strokeWidth={2} />
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {upcomingEvents.map((event, i) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Link
                    to={createPageUrl(`EventDetails?id=${event.id}`)}
                    className="sec-list-row"
                  >
                    {/* Square thumbnail — list row avatar variant */}
                    <div className="sec-list-row__avatar-sq">
                      <img
                        src={getEventImage(event.cover_image_url)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div className="sec-list-row__body">
                      <div className="sec-list-row__title">{event.title}</div>
                      <div className="sec-list-row__subtitle" style={{ display: 'flex', gap: 10 }}>
                        {event.date && (
                          <span>
                            {isToday(parseISO(event.date)) ? 'Tonight' :
                             isTomorrow(parseISO(event.date)) ? 'Tomorrow' :
                             format(parseISO(event.date), 'EEE, MMM d')}
                          </span>
                        )}
                        {event.city && <span>{event.city}</span>}
                      </div>
                    </div>
                    <div className="sec-list-row__action">
                      <ChevronRight size={16} strokeWidth={1.5} />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ── Promotions (empty state until feed returns items) ── */}
        <section style={{ marginBottom: 30 }}>
          <div className="sec-section-header">
            <div>
              <span className="sec-label">Sponsored & Offers</span>
              <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                Promotions
              </h2>
            </div>
          </div>

          {promotionLoading && promotions.length === 0 && (
            <div
              style={{
                display: 'flex',
                gap: 14,
                overflowX: 'auto',
                marginLeft: -20,
                paddingLeft: 20,
                paddingRight: 20,
                paddingBottom: 4,
              }}
              className="scrollbar-hide"
            >
              {[1, 2, 3].map((x) => (
                <div
                  key={x}
                  className="sec-card"
                  style={{
                    flexShrink: 0,
                    width: PROMO_CARD_OUTER_WIDTH,
                    height: 280,
                    opacity: 0.55,
                    scrollSnapAlign: 'start',
                  }}
                />
              ))}
            </div>
          )}

          {!promotionLoading && promotions.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
              No promotions available in your area right now.
            </p>
          )}

          {promotions.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 14,
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                marginLeft: -20,
                marginTop: 4,
                paddingLeft: 20,
                paddingRight: 20,
                paddingBottom: 8,
              }}
              className="scrollbar-hide"
            >
              {promotions.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  style={{
                    flexShrink: 0,
                    width: PROMO_CARD_OUTER_WIDTH,
                    scrollSnapAlign: 'start',
                    display: 'flex',
                    flexDirection: 'column',
                    alignSelf: 'stretch',
                  }}
                >
                  <HomePromotionCard promotion={p} onOpen={handlePromotionClick} />
                </motion.div>
              ))}
            </div>
          )}

          {promotions.length > 0 && hasMorePromotions && (
            <button className="sec-btn sec-btn-secondary sec-btn-full" disabled={promotionLoading} onClick={() => loadPromotions(promotionPage + 1, true)} style={{ marginTop: 12 }}>
              {promotionLoading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </section>

        {/* ── Explore Venues ── */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <span className="sec-label">Directory</span>
            <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 16px', letterSpacing: '-0.02em' }}>
              Venues
            </h2>

            {/* Search bar — pill style */}
            <div style={{ display: 'flex', gap: 8, marginBottom: showFilters ? 0 : 0 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }}>
                  <Search size={16} strokeWidth={1.5} />
                </div>
                <input
                  className="sec-input"
                  style={{ paddingLeft: 40 }}
                  placeholder="Search venues or cities…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-pill)', flexShrink: 0,
                  backgroundColor: showFilters ? 'var(--sec-bg-hover)' : 'transparent',
                  border: `1px solid ${showFilters ? 'var(--sec-border-strong)' : 'var(--sec-border)'}`,
                  color: showFilters ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <SlidersHorizontal size={16} strokeWidth={1.5} />
              </button>
            </div>

            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
              >
                <div>
                  <label className="sec-label" style={{ marginBottom: 6 }}>City</label>
                  <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}
                    className="sec-input-rect" style={{ height: 40, paddingTop: 0, paddingBottom: 0 }}>
                    <option value="all">All Cities</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sec-label" style={{ marginBottom: 6 }}>Type</label>
                  <select value={selectedVenueType} onChange={(e) => setSelectedVenueType(e.target.value)}
                    className="sec-input-rect" style={{ height: 40, paddingTop: 0, paddingBottom: 0 }}>
                    <option value="all">All Types</option>
                    <option value="nightclub">Nightclub</option>
                    <option value="lounge">Lounge</option>
                    <option value="bar">Bar</option>
                    <option value="rooftop">Rooftop</option>
                    <option value="beach_club">Beach Club</option>
                  </select>
                </div>
              </motion.div>
            )}
          </div>

          {verifiedVenues.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <BadgeCheck size={13} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                <span className="sec-label" style={{ display: 'inline' }}>Verified Venues</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {verifiedVenues.slice(0, 6).map(v => <VenueCard key={v.id} venue={v} />)}
              </div>
            </div>
          )}

          {otherVenues.length > 0 && (
            <div>
              <span className="sec-label" style={{ marginBottom: 12 }}>Other Venues</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {otherVenues.slice(0, 6).map(v => <VenueCard key={v.id} venue={v} />)}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
