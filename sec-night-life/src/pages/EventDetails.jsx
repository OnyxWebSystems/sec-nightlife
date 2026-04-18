import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, Share2, Heart, Calendar, Clock, MapPin,
  Users, Ticket, BadgeCheck, Music, Star, Plus, ChevronRight, Navigation,
} from 'lucide-react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';

import TrendingTableCard from '@/components/home/TrendingTableCard';
import TicketPurchaseButton from '@/components/events/TicketPurchaseButton';
import ReportDialog from '@/components/moderation/ReportDialog';

export default function EventDetails() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isInterested, setIsInterested] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('id');

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        const profile = profiles[0];
        setUserProfile(profile);
        setIsInterested(profile.interested_events?.includes(eventId) || false);
      }
    } catch (e) {}
  };

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => apiGet(`/api/events/${eventId}`),
    enabled: !!eventId,
  });

  const { data: venue } = useQuery({
    queryKey: ['venue', event?.venue_id],
    queryFn: async () => {
      const venues = await dataService.Venue.filter({ id: event.venue_id });
      return venues[0];
    },
    enabled: !!event?.venue_id,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['event-tables', eventId],
    queryFn: () => dataService.Table.filter({ event_id: eventId, status: 'all' }),
    enabled: !!eventId,
  });

  const toggleInterestMutation = useMutation({
    mutationFn: async () => {
      const newInterested = !isInterested;
      const updatedEvents = newInterested
        ? [...(userProfile.interested_events || []), eventId]
        : (userProfile.interested_events || []).filter(id => id !== eventId);
      await dataService.User.update(userProfile.id, { interested_events: updatedEvents });
      await dataService.Event.update(eventId, {
        total_interested: Math.max((event.total_interested || 0) + (newInterested ? 1 : -1), 0),
      });
      return newInterested;
    },
    onSuccess: (newInterested) => {
      setIsInterested(newInterested);
      toast.success(newInterested ? 'Added to interested events' : 'Removed from interested events');
      queryClient.invalidateQueries(['event', eventId]);
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Event not found</h2>
          <Link to={createPageUrl('Events')} className="sec-link" style={{ color: 'var(--sec-text-secondary)' }}>
            Browse Events
          </Link>
        </div>
      </div>
    );
  }

  const getDateLabel = () => {
    if (!event.date) return '';
    const date = parseISO(event.date);
    if (isToday(date)) return 'Tonight';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE, MMMM d');
  };

  const lowestTicketPrice = event.ticket_tiers?.reduce((min, tier) =>
    tier.price < min ? tier.price : min, event.ticket_tiers?.[0]?.price || 0
  );

  const tableIsFull = (t) =>
    t.status === 'full' || Number(t.current_guests ?? 0) >= Number(t.max_guests ?? 0);

  const openJoinableTables = tables.filter((t) => !tableIsFull(t));
  const fullTablesOnly = tables.filter((t) => tableIsFull(t));

  const byCategory = (list, cat) =>
    list.filter((t) => (t.table_category || 'general') === cat);

  const venueLine =
    [event.venue_address, event.venue_suburb, event.venue_city || venue?.city]
      .filter(Boolean)
      .join(', ') || event.city || venue?.city || 'TBA';

  const mapQuery = event.venue_address || venue?.address || venueLine;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 96 }}>

      {/* ── Hero image ── */}
      <div style={{ position: 'relative', height: 300 }}>
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt={event.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #141414 0%, #0A0A0A 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Calendar size={48} strokeWidth={1} style={{ color: 'var(--sec-border-strong)' }} />
          </div>
        )}
        {/* Overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, var(--sec-bg-base) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.25) 100%)',
        }} />

        {/* Top controls */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--sec-text-primary)',
            }}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {userProfile && (
              <button
                onClick={() => toggleInterestMutation.mutate()}
                disabled={toggleInterestMutation.isPending}
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  backgroundColor: isInterested ? 'rgba(217,85,85,0.85)' : 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--sec-text-primary)',
                }}
              >
                <Heart size={18} strokeWidth={1.5} fill={isInterested ? 'white' : 'none'} />
              </button>
            )}
            <button
              style={{
                width: 40, height: 40, borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--sec-text-primary)',
              }}
            >
              <Share2 size={18} strokeWidth={1.5} />
            </button>
            {user && (
              <ReportDialog
                targetType="event"
                targetId={eventId}
                targetLabel={event.title}
                triggerLabel="Report"
                triggerClassName="min-h-[40px] px-3"
              />
            )}
          </div>
        </div>

        {/* Age badge */}
        {event.age_limit && (
          <div style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            padding: '4px 14px', borderRadius: 'var(--radius-pill)',
            backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sec-text-primary)' }}>
              {event.age_limit}+
            </span>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '0 20px', marginTop: -24, position: 'relative' }}>

        {/* Title + venue */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em', color: 'var(--sec-text-primary)' }}>
            {event.title}
          </h1>
          {venue && (
            <Link
              to={createPageUrl(`VenueProfile?id=${venue.id}`)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                color: 'var(--sec-text-muted)', textDecoration: 'none',
                fontSize: 14, transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--sec-text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--sec-text-muted)'}
            >
              {venue.logo_url && (
                <img src={venue.logo_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              )}
              <span>{venue.name}</span>
              {venue.is_verified && <BadgeCheck size={14} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />}
              <ChevronRight size={14} strokeWidth={1.5} />
            </Link>
          )}
        </div>

        {/* ── Quick info grid — 4 tiles ── */}
        <div className="sec-card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { icon: Calendar, label: 'Date', value: getDateLabel() },
              { icon: Clock, label: 'Time', value: event.start_time || 'TBA' },
              { icon: MapPin, label: 'Location', value: venueLine },
              {
                icon: Users,
                label: 'Going',
                value: `${event.stats?.going_count ?? event.total_attending ?? 0} people`,
              },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 2, fontWeight: 500 }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {event.stats && (
          <div className="sec-card" style={{ padding: 16, marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Tables & attendance</h2>
            <div style={{ display: 'grid', gap: 10, fontSize: 13, color: 'var(--sec-text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>Going</span>
                <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{event.stats.going_count ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>Hosted tables (all)</span>
                <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{event.stats.hosted_tables}</span>
              </div>
              {event.stats.general && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-primary)', marginTop: 4 }}>General</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 8 }}>
                    <span>Slots left</span>
                    <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>
                      {event.stats.general.tables_remaining ?? '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 8 }}>
                    <span>Open to join</span>
                    <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{event.stats.general.tables_with_join_space}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 8 }}>
                    <span>Full</span>
                    <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{event.stats.general.tables_full}</span>
                  </div>
                </>
              )}
              {event.stats.vip && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-primary)', marginTop: 4 }}>VIP</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 8 }}>
                    <span>Slots left</span>
                    <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>
                      {event.stats.vip.tables_remaining ?? '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 8 }}>
                    <span>Open to join</span>
                    <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{event.stats.vip.tables_with_join_space}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingLeft: 8 }}>
                    <span>Full</span>
                    <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{event.stats.vip.tables_full}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {['general', 'vip'].map((cat) => {
          const tiers = event.hosting_config?.[cat]?.tiers;
          if (!Array.isArray(tiers) || tiers.length === 0) return null;
          const label = cat === 'vip' ? 'VIP' : 'General';
          return (
            <div key={cat} className="sec-card" style={{ padding: 16, marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: 'var(--sec-text-primary)' }}>
                Venue table options · {label}
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--sec-text-muted)', lineHeight: 1.6 }}>
                {tiers.map((t, i) => (
                  <li key={i}>
                    Up to {t.max_guests} guests · min spend R{Number(t.min_spend).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {event.has_entrance_fee && event.entrance_fee_amount != null && (
          <div className="sec-card" style={{
            padding: '12px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Ticket size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 2, fontWeight: 500 }}>Entrance at door</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--sec-text-primary)' }}>
                R{Number(event.entrance_fee_amount)}
              </p>
            </div>
          </div>
        )}

        {/* ── Description ── */}
        {event.description && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>About</h2>
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 14, lineHeight: 1.65 }}>{event.description}</p>
          </div>
        )}

        {/* ── Music genres ── */}
        {event.music_genres?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Music size={15} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
              Music
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {event.music_genres.map((genre, index) => (
                <span key={index} className="sec-chip active" style={{ height: 32, padding: '0 14px', fontSize: 12 }}>
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Featured Artists ── */}
        {event.featured_artists?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={15} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
              Featured Artists
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {event.featured_artists.map((artist, index) => (
                <span key={index} className="sec-chip">
                  {artist}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Tickets ── */}
        {event.ticket_tiers?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ticket size={15} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
              Tickets
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {event.ticket_tiers.map((tier, index) => (
                <div key={index} className="sec-card" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px',
                }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--sec-text-primary)', marginBottom: 2 }}>{tier.name}</p>
                    {tier.description && (
                      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{tier.description}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--sec-text-primary)', letterSpacing: '-0.01em' }}>
                      R{tier.price}
                    </p>
                    {tier.quantity && (
                      <p style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>
                        {tier.quantity - (tier.sold || 0)} left
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tables section ── */}
        <div data-tables-section style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
              Tables ({tables.length})
            </h2>
            <Link
              to={`${createPageUrl('HostDashboard')}?create=table&event=${encodeURIComponent(eventId)}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--sec-text-secondary)', textDecoration: 'none' }}
            >
              <Plus size={14} strokeWidth={2} />
              Create
            </Link>
          </div>

          {tables.length > 0 ? (
            <>
              {['general', 'vip'].map((cat) => {
                const label = cat === 'vip' ? 'VIP' : 'General';
                const avail = byCategory(openJoinableTables, cat);
                const full = byCategory(fullTablesOnly, cat);
                if (avail.length === 0 && full.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 18 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--sec-text-primary)' }}>
                      {label} tables
                    </h3>
                    {avail.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 8, fontWeight: 500 }}>Available</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {avail.map((table) => (
                            <TrendingTableCard key={table.id} table={table} />
                          ))}
                        </div>
                      </div>
                    )}
                    {full.length > 0 && (
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginBottom: 8, fontWeight: 500 }}>Full</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.92 }}>
                          {full.map((table) => (
                            <TrendingTableCard key={table.id} table={table} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', textAlign: 'center' }}>
                Select a table to view details and reserve your spot
              </p>
            </>
          ) : (
            <div className="sec-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Users size={22} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
              </div>
              <p style={{ fontSize: 14, color: 'var(--sec-text-muted)', marginBottom: 16 }}>No tables available yet</p>
              <Link
                to={`${createPageUrl('HostDashboard')}?create=table&event=${encodeURIComponent(eventId)}`}
                className="sec-btn sec-btn-secondary"
                style={{ display: 'inline-flex', textDecoration: 'none' }}
              >
                <Plus size={14} strokeWidth={2} />
                Create Your Table
              </Link>
            </div>
          )}
        </div>

        {/* ── Location / directions ── */}
        {mapQuery && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(mapQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="sec-list-row"
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)', borderRadius: 'var(--radius-lg)', marginBottom: 16 }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Navigation size={18} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 2 }}>Get Directions</p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {venueLine}
              </p>
            </div>
            <ChevronRight size={16} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
          </a>
        )}
      </div>

      {/* ── Sticky bottom bar — price left / CTA right ── */}
      <div className="sec-bottom-bar" style={{ left: 0, right: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', maxWidth: 480, margin: '0 auto' }}>
          {tables.length > 0 ? (
            <>
              <div className="sec-bottom-bar__price">
                <div className="sec-bottom-bar__price-label">Open tables</div>
                <div className="sec-bottom-bar__price-value">{openJoinableTables.length}</div>
              </div>
              <div className="sec-bottom-bar__cta">
                <button
                  className="sec-btn sec-btn-primary sec-btn-full"
                  onClick={() => {
                    const section = document.querySelector('[data-tables-section]');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Book a Table
                </button>
              </div>
            </>
          ) : (
            <>
              {lowestTicketPrice > 0 && (
                <div className="sec-bottom-bar__price">
                  <div className="sec-bottom-bar__price-label">From</div>
                  <div className="sec-bottom-bar__price-value">R{lowestTicketPrice}</div>
                </div>
              )}
              <div className="sec-bottom-bar__cta">
                {event.ticket_tiers?.length > 0 ? (
                  <TicketPurchaseButton event={event} />
                ) : (
                  <button
                    className="sec-btn sec-btn-primary sec-btn-full"
                    onClick={() => userProfile && toggleInterestMutation.mutate()}
                  >
                    {isInterested ? "Interested ✓" : "I'm Interested"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
