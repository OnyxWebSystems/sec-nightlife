import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { ChevronRight, Search, SlidersHorizontal, BadgeCheck, Trophy, Bell, Users } from 'lucide-react';

import FeaturedEventCard from '@/components/home/FeaturedEventCard';
import TrendingTableCard from '@/components/home/TrendingTableCard';
import VenueCard from '@/components/home/VenueCard';
import QuickActions from '@/components/home/QuickActions';
import SecLogo from '@/components/ui/SecLogo';
import { getEventImage } from '@/lib/placeholders';

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedVenueType, setSelectedVenueType] = useState('all');

  const { logout } = useAuth();

  useEffect(() => { loadUser(); }, []);

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

  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['trending-tables'],
    queryFn: () => dataService.Table.filter({ status: 'open' }, '-created_date', 20),
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['all-venues'],
    queryFn: () => dataService.Venue.list(),
  });

  const cities = [...new Set(venues.map(v => v.city).filter(Boolean))];

  const filteredVenues = venues.filter(venue => {
    const matchesSearch = venue.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         venue.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCity = selectedCity === 'all' || venue.city === selectedCity;
    const matchesType = selectedVenueType === 'all' || venue.venue_type === selectedVenueType;
    return matchesSearch && matchesCity && matchesType;
  });

  const verifiedVenues = filteredVenues.filter(v => v.is_verified);
  const otherVenues = filteredVenues.filter(v => !v.is_verified);
  const featuredEvents = events.filter(e => e.is_featured).slice(0, 5);
  const upcomingEvents = events.slice(0, 6);

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
          <button onClick={() => logout()} className="sec-btn sec-btn-ghost" style={{ height: 36, padding: '0 14px', fontSize: 12, borderRadius: 'var(--radius-pill)' }}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ padding: '24px 20px 0' }}>

        {/* ── Quick Actions ── */}
        <div style={{ marginBottom: 32 }}>
          <QuickActions />
        </div>

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
            {tables.slice(0, 6).map((table, i) => (
              <motion.div key={table.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <TrendingTableCard table={table} />
              </motion.div>
            ))}
          </div>

          {tables.length === 0 && !tablesLoading && (
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
              <Link to={createPageUrl('CreateTable')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', padding: '10px 24px', textDecoration: 'none' }}>
                Create a Table
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
