import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Search, MapPin, Clock, Users, SlidersHorizontal, Sparkles, Ticket, ChevronRight } from 'lucide-react';
import { format, parseISO, isToday, isTomorrow, addDays, startOfWeek, eachDayOfInterval } from 'date-fns';
import { motion } from 'framer-motion';
import { getEventImage } from '@/lib/placeholders';

export default function Events() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ venueType: 'all', priceRange: 'all', city: 'all' });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }, 'date', 100),
  });

  const { data: hostEvents = [] } = useQuery({
    queryKey: ['host-events'],
    queryFn: () => dataService.HostEvent.filter({ status: 'published' }),
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['venues'],
    queryFn: () => dataService.Venue.list(),
  });

  const { data: userProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      try {
        const user = await authService.getCurrentUser();
        const profiles = await dataService.User.filter({ created_by: user.email });
        return profiles[0];
      } catch { return null; }
    },
  });

  const venuesMap = venues.reduce((acc, venue) => { acc[venue.id] = venue; return acc; }, {});
  const followedVenueSet = new Set(userProfile?.followed_venues || []);
  const sortByFollowedVenueFirst = (items, tieBreaker) => {
    const withIndex = items.map((item, idx) => ({ item, idx }));
    withIndex.sort((a, b) => {
      const aFollowed = followedVenueSet.has(a.item?.venue_id);
      const bFollowed = followedVenueSet.has(b.item?.venue_id);
      if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
      const tie = tieBreaker ? tieBreaker(a.item, b.item) : 0;
      if (tie !== 0) return tie;
      return a.idx - b.idx;
    });
    return withIndex.map((x) => x.item);
  };

  const filteredEventsRaw = events.filter(event => {
    const matchesSearch = event.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const venue = venuesMap[event.venue_id];
    const matchesVenueType = filters.venueType === 'all' || venue?.venue_type === filters.venueType;
    const matchesCity = filters.city === 'all' || event.city === filters.city;
    let matchesPrice = true;
    if (filters.priceRange !== 'all' && event.ticket_tiers?.length > 0) {
      const lowestPrice = Math.min(...event.ticket_tiers.map(t => t.price));
      if (filters.priceRange === 'free') matchesPrice = lowestPrice === 0;
      else if (filters.priceRange === 'under200') matchesPrice = lowestPrice < 200;
      else if (filters.priceRange === '200-500') matchesPrice = lowestPrice >= 200 && lowestPrice <= 500;
      else if (filters.priceRange === 'over500') matchesPrice = lowestPrice > 500;
    }
    return matchesSearch && matchesVenueType && matchesCity && matchesPrice;
  });
  const filteredEvents = sortByFollowedVenueFirst(filteredEventsRaw, (a, b) => {
    const ad = a?.date ? new Date(a.date).getTime() : 0;
    const bd = b?.date ? new Date(b.date).getTime() : 0;
    return ad - bd;
  });

  const recommendedEventsRaw = filteredEvents.filter((event) => {
    if (!userProfile) return false;
    if (userProfile.city && event.city === userProfile.city) return true;
    if (userProfile.music_preferences?.length > 0 && event.music_genres?.length > 0) {
      return event.music_genres.some((genre) => userProfile.music_preferences.includes(genre));
    }
    return false;
  });
  const recommendedEvents = sortByFollowedVenueFirst(recommendedEventsRaw, (a, b) => {
    const ad = a?.date ? new Date(a.date).getTime() : 0;
    const bd = b?.date ? new Date(b.date).getTime() : 0;
    return ad - bd;
  }).slice(0, 4);

  const cities = [...new Set(events.map(e => e.city).filter(Boolean))];
  const todayEvents = filteredEvents.filter(e => e.date && isToday(parseISO(e.date)));
  const tomorrowEvents = filteredEvents.filter(e => e.date && isTomorrow(parseISO(e.date)));
  const upcomingEvents = filteredEvents.filter(e => {
    if (!e.date) return false;
    const d = parseISO(e.date);
    return !isToday(d) && !isTomorrow(d);
  });

  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6),
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>

      {/* ── Sticky header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: 'rgba(0,0,0,0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--sec-border)',
      }}>
        <div style={{ padding: '16px 20px 12px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 14, color: 'var(--sec-text-primary)', letterSpacing: '-0.02em' }}>
            Events
          </h1>

          {/* Search + filter toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: showFilters ? 12 : 0 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} strokeWidth={1.5} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
              <input
                className="sec-input"
                placeholder="Search events…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                width: 44, height: 44, borderRadius: 'var(--radius-pill)', flexShrink: 0,
                backgroundColor: showFilters ? 'var(--sec-bg-hover)' : 'transparent',
                border: `1px solid ${showFilters ? 'var(--sec-border-strong)' : 'var(--sec-border)'}`,
                color: showFilters ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <SlidersHorizontal size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Collapsible filter row */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}
            >
              {[
                { label: 'Venue', key: 'venueType', options: [['all', 'All'], ['nightclub', 'Nightclub'], ['lounge', 'Lounge'], ['bar', 'Bar'], ['rooftop', 'Rooftop'], ['beach_club', 'Beach Club']] },
                { label: 'Price', key: 'priceRange', options: [['all', 'All'], ['free', 'Free'], ['under200', '< R200'], ['200-500', 'R200–500'], ['over500', '> R500']] },
                { label: 'City', key: 'city', options: [['all', 'All'], ...cities.map(c => [c, c])] },
              ].map(({ label, key, options }) => (
                <div key={key}>
                  <label className="sec-label" style={{ marginBottom: 5 }}>{label}</label>
                  <select
                    value={filters[key]}
                    onChange={(e) => setFilters(prev => ({ ...prev, [key]: e.target.value }))}
                    className="sec-input-rect"
                    style={{ height: 38, paddingTop: 0, paddingBottom: 0 }}
                  >
                    {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
                  </select>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        {/* ── Week date strip — Eventbrite circular-number tiles ── */}
        <div
          style={{ display: 'flex', gap: 8, padding: '0 20px 14px', overflowX: 'auto' }}
          className="scrollbar-hide"
        >
          {weekDays.map((day, index) => {
            const dayEventCount = filteredEvents.filter(e =>
              e.date && format(parseISO(e.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
            ).length;
            const isSelected = format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
            const isDayToday = isToday(day);

            return (
              <button
                key={index}
                onClick={() => setSelectedDate(day)}
                className={`sec-date-tile${isSelected ? ' active' : ''}`}
              >
                <span className="sec-date-tile__day" style={isDayToday && !isSelected ? { color: 'var(--sec-accent)' } : {}}>
                  {format(day, 'EEE')}
                </span>
                <div
                  className="sec-date-tile__number"
                  style={isDayToday && !isSelected ? { color: 'var(--sec-accent)' } : {}}
                >
                  {format(day, 'd')}
                </div>
                <div className="sec-date-tile__dots">
                  {dayEventCount > 0 && [...Array(Math.min(dayEventCount, 3))].map((_, i) => (
                    <div key={i} className="sec-date-tile__dot" />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Content ── */}
      <div style={{ padding: '24px 20px' }}>

        {/* Host Events (informal) */}
        {hostEvents.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--sec-accent-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Users size={15} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Host Events</h2>
              </div>
              <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>House parties, boat parties & more</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {hostEvents.slice(0, 6).map((event, index) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                  <HostEventCard event={event} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Recommended */}
        {recommendedEvents.length > 0 && (
          <section style={{ marginBottom: 36 }}>
            <div className="sec-section-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--sec-accent-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={15} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Recommended for You</h2>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {recommendedEvents.map((event, index) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                  <EventCard event={event} />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Tonight */}
        {todayEvents.length > 0 && (
          <EventSection title="Tonight" events={todayEvents} accent />
        )}

        {/* Tomorrow */}
        {tomorrowEvents.length > 0 && (
          <EventSection title="Tomorrow" events={tomorrowEvents} />
        )}

        {/* Coming up */}
        {upcomingEvents.length > 0 && (
          <EventSection title="Coming Up" events={upcomingEvents} />
        )}

        {filteredEvents.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <Calendar size={28} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No events found</h3>
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 14 }}>Check back soon for upcoming events</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Section wrapper ── */
function EventSection({ title, events, accent }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div className="sec-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Calendar size={15} strokeWidth={1.5} style={{ color: accent ? 'var(--sec-accent)' : 'var(--sec-text-secondary)' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{title}</h2>
          <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>({events.length})</span>
        </div>
        <Link to={createPageUrl('Events')} className="sec-see-all">
          See all <ChevronRight size={13} strokeWidth={2} />
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {events.map((event, index) => (
          <motion.div key={event.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <EventCard event={event} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ── Host event card (informal events) ── */
function HostEventCard({ event }) {
  const getDateLabel = () => {
    if (!event.date) return '';
    const date = parseISO(event.date);
    if (isToday(date)) return 'Tonight';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };
  const price = event.entry_cost > 0 ? `R${event.entry_cost}` : 'Free';
  return (
    <Link
      to={createPageUrl(`HostEventDetails?id=${event.id}`)}
      className="sec-card"
      style={{ overflow: 'hidden', display: 'block', textDecoration: 'none' }}
    >
      <div style={{ position: 'relative', height: 150 }}>
        <img
          src={getEventImage(event.cover_image_url)}
          alt={event.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div className="sec-overlay" style={{ position: 'absolute', inset: 0 }} />
        <span
          className="sec-badge"
          style={{
            position: 'absolute', top: 10, right: 10,
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            color: 'var(--sec-text-secondary)',
            borderRadius: 'var(--radius-pill)',
          }}
        >
          Host Event
        </span>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <h3 style={{
          fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--sec-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {event.title}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--sec-text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={12} strokeWidth={1.5} />
            {getDateLabel()}
          </span>
          {event.city && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} strokeWidth={1.5} />
              {event.city}
            </span>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--sec-border)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--sec-text-primary)', fontWeight: 500 }}>{price} entry</span>
        </div>
      </div>
    </Link>
  );
}

/* ── Individual event grid card ── */
function EventCard({ event }) {
  const getDateLabel = () => {
    if (!event.date) return '';
    const date = parseISO(event.date);
    if (isToday(date)) return 'Tonight';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const lowestTicketPrice = event.ticket_tiers?.reduce((min, tier) =>
    tier.price < min ? tier.price : min, event.ticket_tiers?.[0]?.price || 0
  ) || 0;
  const doorEntrance =
    event.has_entrance_fee && event.entrance_fee_amount != null && Number(event.entrance_fee_amount) > 0
      ? Number(event.entrance_fee_amount)
      : null;

  return (
    <Link
      to={createPageUrl(`EventDetails?id=${event.id}`)}
      className="sec-card"
      style={{ overflow: 'hidden', display: 'block', textDecoration: 'none' }}
    >
      {/* Image */}
      <div style={{ position: 'relative', height: 150 }}>
        <img
          src={getEventImage(event.cover_image_url)}
          alt={event.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div className="sec-overlay" style={{ position: 'absolute', inset: 0 }} />
        {event.age_limit && (
          <span
            className="sec-badge"
            style={{
              position: 'absolute', top: 10, right: 10,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(6px)',
              color: 'var(--sec-text-secondary)',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            {event.age_limit}+
          </span>
        )}
      </div>

      {/* Metadata */}
      <div style={{ padding: '14px 16px 16px' }}>
        <h3 style={{
          fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--sec-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em',
        }}>
          {event.title}
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--sec-text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={12} strokeWidth={1.5} />
            {getDateLabel()}
          </span>
          {event.start_time && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} strokeWidth={1.5} />
              {event.start_time}
            </span>
          )}
          {event.city && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} strokeWidth={1.5} />
              {event.city}
            </span>
          )}
        </div>

        {/* Price row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--sec-border)',
        }}>
          {lowestTicketPrice > 0 && doorEntrance != null ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', flexWrap: 'wrap' }}>
              <Ticket size={13} strokeWidth={1.5} />
              From R{lowestTicketPrice}
              <span style={{ color: 'var(--sec-text-muted)', fontWeight: 500 }}>·</span>
              Door R{doorEntrance}
            </span>
          ) : lowestTicketPrice > 0 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
              <Ticket size={13} strokeWidth={1.5} />
              From R{lowestTicketPrice}
            </span>
          ) : doorEntrance != null ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
              <Ticket size={13} strokeWidth={1.5} />
              Door R{doorEntrance}
            </span>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Free Entry</span>
          )}
          {event.total_attending > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--sec-text-muted)' }}>
              <Users size={12} strokeWidth={1.5} />
              {event.total_attending} going
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
