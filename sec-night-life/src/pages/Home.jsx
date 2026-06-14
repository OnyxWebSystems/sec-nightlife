import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { format, isToday, isTomorrow, isValid, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { ChevronRight, Search, SlidersHorizontal, BadgeCheck, Trophy, Bell, Users, RefreshCw } from 'lucide-react';

import FeaturedEventCard from '@/components/home/FeaturedEventCard';
import VenueCard from '@/components/home/VenueCard';
import TableOfferingCard from '@/components/home/TableOfferingCard';
import QuickActions from '@/components/home/QuickActions';
import PlatformAnnouncementBanner from '@/components/home/PlatformAnnouncementBanner';
import SecLogo from '@/components/ui/SecLogo';
import { getEventImage } from '@/lib/placeholders';
import { toast } from 'sonner';
import { launchPaystackInline } from '@/lib/paystackInline';
import { completePaystackCheckout } from '@/lib/completePaystackCheckout';
import { isEventEnded } from '@/lib/eventLifecycle';
import { usePreferences } from '@/context/PreferencesContext';

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


function getPromotionLabel(promotion) {
  if (promotion?.boosted) return 'Sponsored';
  if (!promotion?.promotionType) return 'Promotion';
  return String(promotion.promotionType)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

const HomePromotionCard = React.memo(function HomePromotionCard({ promotion: p, onOpen, compact = false }) {
  const boosted = Boolean(p?.boosted);
  const label = getPromotionLabel(p);
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
        flex: compact ? '0 0 min(88vw, 320px)' : '1 1 auto',
        width: compact ? 'min(88vw, 320px)' : '100%',
        maxWidth: '100%',
        minWidth: 0,
        minHeight: compact ? 300 : 320,
        boxSizing: 'border-box',
        padding: 14,
        cursor: 'pointer',
        border: boosted ? '1px solid var(--sec-accent-border)' : '1px solid var(--sec-border)',
        background: boosted
          ? 'linear-gradient(160deg, var(--sec-bg-elevated) 0%, var(--sec-bg-card) 100%)'
          : 'var(--sec-bg-card)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: boosted ? 'var(--shadow-card)' : undefined,
        scrollSnapAlign: compact ? 'start' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: boosted ? 'var(--sec-accent-bright)' : 'var(--sec-text-muted)',
            margin: 0,
          }}
        >
          {label}
        </p>
        {boosted ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--sec-warning-muted)',
              color: 'var(--sec-warning)',
              border: '1px solid rgba(212, 160, 23, 0.35)',
            }}
          >
            Sponsored
          </span>
        ) : null}
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          aspectRatio: '16 / 10',
          minHeight: 132,
          flexShrink: 0,
          overflow: 'hidden',
          borderRadius: 10,
          marginBottom: 10,
          background: 'var(--sec-bg-hover)',
        }}
      >
        {p.imageUrl ? (
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
        ) : null}
      </div>
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

const PromoWithImpression = React.memo(function PromoWithImpression({ promotion, sessionId, onOpen, compact = false }) {
  const wrapRef = useRef(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || fired.current) return undefined;
    const ob = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired.current) {
            fired.current = true;
            void apiPost(`/api/promotions/${promotion.id}/track`, { type: 'VIEW', sessionId }, { skipAuth: false }).catch(() => {});
            ob.disconnect();
          }
        }
      },
      { threshold: 0.35, rootMargin: '48px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [promotion.id, sessionId]);
  return (
    <div ref={wrapRef} style={{ width: compact ? 'auto' : '100%', maxWidth: '100%', minWidth: 0, flexShrink: compact ? 0 : undefined }}>
      <HomePromotionCard promotion={promotion} onOpen={onOpen} compact={compact} />
    </div>
  );
});

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, userProfile, isLoadingAuth, logout } = useAuth();
  const { location: locPrefs, geoCoords } = usePreferences();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedVenueType, setSelectedVenueType] = useState('all');
  const [sessionId] = useState(() => getOrCreateSessionId());
  const pullCooldownRef = useRef(0);

  const refreshHomeData = useCallback(
    async (showToast = true) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['home-promotions-feed'] }),
        queryClient.invalidateQueries({ queryKey: ['home-feed'] }),
        queryClient.invalidateQueries({ queryKey: ['featured-events'] }),
        queryClient.invalidateQueries({ queryKey: ['featured-events-details'] }),
        queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] }),
        queryClient.invalidateQueries({ queryKey: ['host-parties-public-home'] }),
        queryClient.invalidateQueries({ queryKey: ['all-venues'] }),
        queryClient.invalidateQueries({ queryKey: ['home-platform-announcements'] }),
        queryClient.invalidateQueries({ queryKey: ['home-followed-promoters'] }),
      ]);
      if (showToast) toast.success('Feed refreshed');
    },
    [queryClient],
  );

  useEffect(() => {
    let armed = false;
    let startY = 0;
    const onTouchStart = (e) => {
      if (window.scrollY > 8) return;
      armed = true;
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e) => {
      if (!armed) return;
      const y = e.touches[0]?.clientY ?? 0;
      if (y - startY > 72) {
        armed = false;
        const t = Date.now();
        if (t - pullCooldownRef.current < 2500) return;
        pullCooldownRef.current = t;
        void refreshHomeData(false);
      }
    };
    const onTouchEnd = () => {
      armed = false;
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [refreshHomeData]);

  /** Feed scope: location off → nationwide; location on → geo radius; else city fallback. */
  const homeFeedCity = useMemo(() => {
    if (locPrefs?.useLocation) return '';
    if (selectedCity && selectedCity !== 'all') return String(selectedCity).trim();
    if (userProfile?.city) return String(userProfile.city).trim();
    return '';
  }, [selectedCity, userProfile?.city, locPrefs?.useLocation]);
  const homeFeedScopeAll = !locPrefs?.useLocation && !homeFeedCity;
  const homeFeedGeoKey = locPrefs?.useLocation && geoCoords
    ? `${geoCoords.lat.toFixed(3)},${geoCoords.lng.toFixed(3)},${locPrefs.radiusKm ?? 25}`
    : null;

  const handlePromotionClick = async (promotion) => {
    void apiPost(`/api/promotions/${promotion.id}/track`, { type: 'CLICK', sessionId }).catch(() => {});
    navigate(createPageUrl(`VenueProfile?id=${promotion.venueId}`));
  };

  const joinHostedTable = async (tableId) => {
    if (!user?.id || !user?.email) {
      const returnUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      navigate(`${createPageUrl('Login')}?returnUrl=${returnUrl}`);
      toast.message('Sign in to join a table');
      return;
    }
    try {
      const r = await apiPost(`/api/host/tables/${tableId}/join`, {});
      queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
      if (r?.pending) {
        toast.success('Request sent. The host will approve your join.');
        return;
      }
      if (r?.pendingPayment && r?.reference && r?.access_code) {
        const amount = Number(r.amount_zar ?? 0);
        launchPaystackInline({
          email: user.email,
          amount,
          reference: r.reference,
          accessCode: r.access_code,
          onSuccess: async (payload) => {
            await completePaystackCheckout({ reference: r.reference, payload, queryClient });
            queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
            queryClient.invalidateQueries({ queryKey: ['home-feed'] });
          },
          onCancel: () => {
            toast.message('Checkout closed', {
              description: 'No charge was completed. Open the table again to retry.',
            });
          },
        });
        return;
      }
      toast.success('You are on the guest list.');
    } catch (e) {
      toast.error(e?.message || 'Could not join table');
    }
  };

  const listStale = 120_000;

  const {
    data: feedPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: feedLoading,
  } = useInfiniteQuery({
    queryKey: ['home-feed', sessionId, homeFeedScopeAll ? 'all' : homeFeedGeoKey || homeFeedCity],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        cursor: String(pageParam ?? 0),
        limit: '12',
        sessionId,
      });
      if (homeFeedScopeAll) params.set('scope', 'all');
      else if (homeFeedGeoKey && geoCoords) {
        params.set('lat', String(geoCoords.lat));
        params.set('lng', String(geoCoords.lng));
        params.set('radius_km', String(locPrefs?.radiusKm ?? 25));
      } else if (homeFeedCity) params.set('city', homeFeedCity);
      else params.set('scope', 'all');
      return apiGet(`/api/home/feed?${params.toString()}`, { headers: { 'x-session-id': sessionId } });
    },
    getNextPageParam: (lastPage) => (lastPage?.nextCursor != null ? parseInt(lastPage.nextCursor, 10) : undefined),
    enabled: !isLoadingAuth,
    staleTime: 60_000,
  });

  const { data: followedPromotersData } = useQuery({
    queryKey: ['home-followed-promoters'],
    queryFn: () => apiGet('/api/home/followed-promoters'),
    enabled: !isLoadingAuth && !!user,
    staleTime: 60_000,
  });
  const followedPromoterEvents = followedPromotersData?.items || [];

  const { data: platformAnnouncementsData } = useQuery({
    queryKey: ['home-platform-announcements'],
    queryFn: () => apiGet('/api/home/announcements'),
    enabled: !isLoadingAuth,
    staleTime: 30_000,
  });
  const platformAnnouncements = platformAnnouncementsData?.announcements || [];

  const { data: promotionsFeedData, isLoading: promotionsFeedLoading } = useQuery({
    queryKey: ['home-promotions-feed', sessionId, homeFeedScopeAll ? 'all' : homeFeedGeoKey || homeFeedCity],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '12', page: '1', sessionId });
      if (homeFeedScopeAll) params.set('scope', 'all');
      else if (homeFeedGeoKey && geoCoords) {
        params.set('lat', String(geoCoords.lat));
        params.set('lng', String(geoCoords.lng));
        params.set('radius_km', String(locPrefs?.radiusKm ?? 25));
      } else if (homeFeedCity) params.set('city', homeFeedCity);
      else params.set('scope', 'all');
      return apiGet(`/api/promotions/feed?${params.toString()}`, {
        headers: { 'x-session-id': sessionId },
        skipAuth: true,
      });
    },
    staleTime: 60_000,
    enabled: !isLoadingAuth,
  });
  const homePromotions = promotionsFeedData?.results || [];

  const feedRows = useMemo(() => (feedPages?.pages || []).flatMap((p) => p.items || []), [feedPages]);

  const { data: events = [] } = useQuery({
    queryKey: ['featured-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }, '-date', 10),
    staleTime: listStale,
    enabled: !isLoadingAuth,
  });

  const { data: tableOfferingsData, isLoading: tablesLoading } = useQuery({
    queryKey: ['home-table-offerings', sessionId],
    queryFn: () =>
      apiGet(`/api/home/table-offerings?limit=24&sessionId=${encodeURIComponent(sessionId)}`, {
        headers: { 'x-session-id': sessionId },
      }),
    staleTime: listStale,
    enabled: !isLoadingAuth,
  });
  const tableOfferings = useMemo(() => {
    const items = tableOfferingsData?.items || [];
    return items.filter((o) => {
      if (o.type !== 'venue_event') return true;
      return !isEventEnded({ date: o.eventDate, ends_at: o.eventEndsAt, endsAt: o.eventEndsAt });
    });
  }, [tableOfferingsData?.items]);

  const { data: venues = [] } = useQuery({
    queryKey: ['all-venues', selectedCity],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72' });
      if (selectedCity && selectedCity !== 'all') params.set('city', selectedCity);
      return apiGet(`/api/venues?${params.toString()}`);
    },
    staleTime: listStale,
    enabled: !isLoadingAuth,
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

  const activeEventsOnly = useMemo(
    () => events.filter((e) => !isEventEnded(e)),
    [events],
  );

  const prioritizedEvents = sortByFollowedVenueFirst(
    activeEventsOnly,
    (e) => e.venue_id,
    (a, b) => {
      const ad = a?.date ? new Date(a.date).getTime() : 0;
      const bd = b?.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    }
  );
  const filteredVenues = venues.filter(venue => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (venue.name ?? '').toLowerCase().includes(q) ||
                         (venue.city ?? '').toLowerCase().includes(q);
    const matchesCity = selectedCity === 'all' || venue.city === selectedCity;
    const matchesType = selectedVenueType === 'all' || venue.venue_type === selectedVenueType;
    return matchesSearch && matchesCity && matchesType;
  });

  const verifiedVenues = filteredVenues.filter(v => v.is_verified);
  const otherVenues = filteredVenues.filter(v => !v.is_verified);
  const featuredEvents = useMemo(
    () => prioritizedEvents.filter(e => e.is_featured).slice(0, 5),
    [prioritizedEvents]
  );
  const upcomingEvents = prioritizedEvents.slice(0, 6);

  const featuredEventIds = useMemo(() => featuredEvents.map((e) => e.id).join(','), [featuredEvents]);
  const { data: featuredEventDetails } = useQuery({
    queryKey: ['featured-events-details', featuredEventIds],
    queryFn: () => apiGet(`/api/events/featured-details?ids=${encodeURIComponent(featuredEventIds)}`),
    staleTime: listStale,
    enabled: !isLoadingAuth && featuredEventIds.length > 0,
  });
  const featuredCards =
    featuredEventDetails?.length > 0 ? featuredEventDetails : featuredEvents;

  if (isLoadingAuth) {
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

  const greetingName = userProfile?.username || user?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="pb-10" style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 border-b border-[var(--sec-border)] min-h-[60px]"
        style={{
          backgroundColor: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-[1120px] mx-auto w-full h-full px-4 sm:px-5 flex items-center justify-between gap-3 py-2 sm:py-0 sm:min-h-[60px]">
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-semibold text-[var(--sec-text-primary)] m-0 tracking-tight truncate">
              {timeGreeting}, {greetingName}
            </h1>
            <p className="text-xs text-[var(--sec-text-muted)] m-0 mt-0.5 truncate">
              What&apos;s happening tonight
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              className="sec-nav-icon"
              aria-label="Refresh feed"
              title="Refresh"
              onClick={() => void refreshHomeData(true)}
            >
              <RefreshCw size={18} strokeWidth={1.5} />
            </button>
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
              className="sec-btn sec-btn-ghost h-9 px-2 sm:px-3.5 text-xs rounded-full"
              aria-label="Sign out"
            >
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden text-[10px]">Out</span>
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 20px 0' }}>

        {/* ── Quick Actions ── */}
        <div style={{ marginBottom: 32 }}>
          <QuickActions />
        </div>

        <PlatformAnnouncementBanner announcements={platformAnnouncements} />

        {followedPromoterEvents.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div>
                <span className="sec-label">Following</span>
                <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                  From promoters you follow
                </h2>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
              {followedPromoterEvents.map((item) => (
                <Link
                  key={`${item.promoterId}-${item.event.id}`}
                  to={createPageUrl(`EventDetails?id=${item.event.id}`)}
                  className="sec-card"
                  style={{ minWidth: 220, maxWidth: 240, padding: 12, borderRadius: 14, textDecoration: 'none', flexShrink: 0 }}
                >
                  {item.event.coverImageUrl ? (
                    <img src={item.event.coverImageUrl} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 10, marginBottom: 8 }} />
                  ) : null}
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--sec-text-primary)' }}>{item.event.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                    @{item.promoterUsername} · {item.event.venueName || item.event.city}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Featured Events ── */}
        {featuredCards.length > 0 && (
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
              style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}
              className="scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0"
            >
              {featuredCards.map((event, i) => (
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

        <div className={`mb-9 ${upcomingEvents.length > 0 ? 'xl:grid xl:grid-cols-2 xl:gap-8' : ''}`}>
          {/* ── Open Tables ── */}
          <section style={{ marginBottom: upcomingEvents.length > 0 ? 0 : 36 }}>
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

            <motion.div
              style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}
              className="scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0"
            >
              {tableOfferings.map((offering, i) => (
                <motion.div
                  key={offering.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TableOfferingCard offering={offering} wide={!!offering.boosted} />
                </motion.div>
              ))}
            </motion.div>

            {tableOfferings.length === 0 && !tablesLoading && (
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
            <section style={{ marginTop: 36 }} className="xl:mt-0">
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
                          {event.date && (() => {
                            const d = parseISO(event.date);
                            if (!isValid(d)) return null;
                            return (
                            <span>
                              {isToday(d) ? 'Tonight' :
                               isTomorrow(d) ? 'Tomorrow' :
                               format(d, 'EEE, MMM d')}
                            </span>
                            );
                          })()}
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
        </div>

        {/* ── Promotions (boosted first) ── */}
        {(promotionsFeedLoading || homePromotions.length > 0) && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div>
                <span className="sec-label">Offers</span>
                <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                  Promotions
                </h2>
              </div>
            </div>
            {promotionsFeedLoading && homePromotions.length === 0 ? (
              <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
                {[1, 2].map((x) => (
                  <div key={x} className="sec-card" style={{ minWidth: 280, minHeight: 280, opacity: 0.5 }} />
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  overflowX: 'auto',
                  paddingBottom: 8,
                  scrollSnapType: 'x mandatory',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {homePromotions.map((p) => (
                  <PromoWithImpression key={p.id} promotion={p} sessionId={sessionId} onOpen={handlePromotionClick} compact />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── For you: mixed feed (cursor pagination) ── */}
        <section style={{ marginBottom: 30 }}>
          <div className="sec-section-header">
            <div>
              <span className="sec-label">For you</span>
              <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--sec-text-primary)', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
                Discover
              </h2>
            </div>
            <Link to={createPageUrl('Events')} className="sec-see-all">
              Explore <ChevronRight size={14} strokeWidth={2} />
            </Link>
          </div>

          {feedLoading && feedRows.length === 0 && (
            <div className="grid gap-3">
              {[1, 2, 3].map((x) => (
                <div key={x} className="sec-card" style={{ minHeight: 140, opacity: 0.55 }} />
              ))}
            </div>
          )}

          {!feedLoading && feedRows.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
              Nothing in your feed yet. Try another city or check back soon.
            </p>
          )}

          {feedRows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {feedRows.map((row, i) => (
                <motion.div
                  key={`${row.kind}-${row.data?.id}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                >
                  {row.kind === 'promotion' && (
                    <PromoWithImpression promotion={row.data} sessionId={sessionId} onOpen={handlePromotionClick} />
                  )}
                  {row.kind === 'event' && (
                    <Link
                      to={createPageUrl(`EventDetails?id=${row.data.id}`)}
                      className="sec-card"
                      style={{ display: 'flex', gap: 12, padding: 14, textDecoration: 'none', color: 'inherit', alignItems: 'center' }}
                    >
                      <div style={{ width: 88, height: 88, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--sec-bg-hover)' }}>
                        <img src={getEventImage(row.data.cover_image_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="sec-label">Event</span>
                        <div style={{ fontWeight: 600 }}>{row.data.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>{row.data.city}</div>
                      </div>
                      <ChevronRight style={{ flexShrink: 0 }} size={18} strokeWidth={1.5} />
                    </Link>
                  )}
                  {row.kind === 'venue' && (() => {
                    const { followed: _fol, ...venueRest } = row.data;
                    return <VenueCard venue={venueRest} />;
                  })()}
                </motion.div>
              ))}
            </div>
          )}

          {hasNextPage ? (
            <button
              type="button"
              className="sec-btn sec-btn-secondary sec-btn-full"
              style={{ marginTop: 16 }}
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          ) : null}

          {feedRows.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 10 }}>
              Order changes based on your area and session. Pull to refresh by leaving Home and coming back.
            </p>
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
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {verifiedVenues.slice(0, 6).map(v => <VenueCard key={v.id} venue={v} />)}
              </div>
            </div>
          )}

          {otherVenues.length > 0 && (
            <div>
              <span className="sec-label" style={{ marginBottom: 12 }}>Other Venues</span>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {otherVenues.slice(0, 6).map(v => <VenueCard key={v.id} venue={v} />)}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
