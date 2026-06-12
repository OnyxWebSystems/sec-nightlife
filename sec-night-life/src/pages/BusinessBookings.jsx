import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import {
  BookOpen, Users, Search, Loader2, ChevronRight, Eye, Ticket, Armchair, CalendarDays,
} from 'lucide-react';
import PageBackHeader from '@/components/layout/PageBackHeader';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import { format, parseISO } from 'date-fns';

function formatEventWhen(event) {
  if (!event?.date && !event?.startTime) return null;
  try {
    const datePart = event.date ? format(parseISO(event.date), 'EEE d MMM yyyy') : 'Date TBC';
    if (event.startTime) return `${datePart} · ${event.startTime}`;
    return datePart;
  } catch {
    return event?.date || null;
  }
}

function ticketScopeNotice(notice) {
  if (notice === 'past_event_use_past_scope') {
    return 'This event is in the past. Switch to Past events to see its ticket sales.';
  }
  if (notice === 'upcoming_event_use_active_scope') {
    return 'This event is upcoming. Switch to Active events to see its ticket sales.';
  }
  return null;
}

function StatusBadge({ status, label }) {
  const classMap = {
    open: 'sec-badge-success',
    active: 'sec-badge-gold',
    full: 'sec-badge-gold',
    closed: 'sec-badge-muted',
    admitted: 'sec-badge-success',
    pending: 'sec-badge-silver',
  };
  const key = (status || '').toLowerCase();
  return (
    <span className={`sec-badge ${classMap[key] || 'sec-badge-muted'}`}>
      {label || status}
    </span>
  );
}

function StatTile({ label, value, accent, subtitle }) {
  return (
    <div
      className="sec-card"
      style={{
        padding: '14px 16px',
        background: 'linear-gradient(145deg, var(--sec-bg-card) 0%, var(--sec-bg-elevated) 100%)',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ? 'var(--sec-accent)' : 'var(--sec-text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 4, letterSpacing: '0.02em' }}>
        {label}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 10, color: 'var(--sec-text-muted)', marginTop: 2, opacity: 0.85 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function FilterBar({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 18,
        flexWrap: 'wrap',
        padding: '14px 16px',
        borderRadius: 14,
        background: 'var(--sec-bg-card)',
        border: '1px solid var(--sec-border)',
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        borderRadius: 16,
        background: 'var(--sec-bg-card)',
        border: '1px dashed var(--sec-border)',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          margin: '0 auto 14px',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--sec-accent-muted)',
          border: '1px solid var(--sec-accent-border)',
        }}
      >
        <Icon size={24} style={{ color: 'var(--sec-accent)' }} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', maxWidth: 360, margin: '0 auto', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  );
}

export default function BusinessBookings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeVenueId } = useActiveVenue();
  const [user, setUser] = useState(null);
  const [mainTab, setMainTab] = useState('tables');
  const [tableSubTab, setTableSubTab] = useState('event');
  const [search, setSearch] = useState('');
  const [ticketSearch, setTicketSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [eventTimeScope, setEventTimeScope] = useState('active');
  const [ticketEventTimeScope, setTicketEventTimeScope] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [ticketEventId, setTicketEventId] = useState('all');
  const [detailTable, setDetailTable] = useState(null);
  const [detailTicket, setDetailTicket] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setUser(await authService.getCurrentUser());
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const { data: bookingsData, isLoading: eventTablesLoading } = useQuery({
    queryKey: ['biz-event-table-bookings', user?.id, selectedEventId, eventTimeScope, activeVenueId],
    queryFn: () => {
      const params = new URLSearchParams({ event_scope: eventTimeScope });
      if (selectedEventId !== 'all') params.set('event_id', selectedEventId);
      if (activeVenueId) params.set('venue_id', activeVenueId);
      return apiGet(`/api/business/event-table-bookings?${params.toString()}`);
    },
    enabled: !!user && mainTab === 'tables' && tableSubTab === 'event',
    refetchOnWindowFocus: true,
  });

  const { data: venueTableBookingsData, isLoading: venueBookingsLoading } = useQuery({
    queryKey: ['biz-venue-table-bookings', user?.id, activeVenueId],
    queryFn: () => {
      const q = activeVenueId ? `?venue_id=${encodeURIComponent(activeVenueId)}` : '';
      return apiGet(`/api/business/venue-table-bookings${q}`);
    },
    enabled: !!user && mainTab === 'tables' && tableSubTab === 'venue-day',
    refetchOnWindowFocus: true,
  });

  const { data: ticketBookingsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['biz-ticket-bookings', user?.id, ticketEventId, ticketEventTimeScope, activeVenueId],
    queryFn: () => {
      const params = new URLSearchParams({ event_scope: ticketEventTimeScope });
      if (ticketEventId !== 'all') params.set('event_id', ticketEventId);
      if (activeVenueId) params.set('venue_id', activeVenueId);
      return apiGet(`/api/business/ticket-bookings?${params.toString()}`);
    },
    enabled: !!user && mainTab === 'tickets',
    refetchOnWindowFocus: true,
  });

  const releaseMutation = useMutation({
    mutationFn: (tableId) => apiPost(`/api/business/venue-tables/${tableId}/release`, {}),
    onSuccess: () => {
      toast.success('Table is available again');
      queryClient.invalidateQueries({ queryKey: ['biz-venue-table-bookings'] });
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not release table');
    },
  });

  const eventTables = bookingsData?.items || [];
  const venueTableBookings = venueTableBookingsData?.items || [];
  const ticketOrders = ticketBookingsData?.items || [];
  const eventSummary = bookingsData?.summary;
  const ticketSummary = ticketBookingsData?.summary;

  const eventOptions = useMemo(() => {
    const fromApi = bookingsData?.eventSummaries || ticketBookingsData?.eventSummaries;
    if (Array.isArray(fromApi) && fromApi.length) {
      return fromApi.map((e) => ({
        id: e.id,
        label: e.title?.trim() || (e.date ? `Untitled event (${e.date})` : 'Untitled event'),
      }));
    }
    return [];
  }, [bookingsData?.eventSummaries, ticketBookingsData?.eventSummaries]);

  useEffect(() => {
    setSelectedEventId('all');
  }, [eventTimeScope, activeVenueId]);

  useEffect(() => {
    setTicketEventId('all');
  }, [ticketEventTimeScope, activeVenueId]);

  const filteredEventTables = eventTables
    .filter((t) => statusFilter === 'all' || t.role === statusFilter)
    .filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (t?.event?.title || '').toLowerCase().includes(q) ||
        (t?.hostedTable?.tableName || '').toLowerCase().includes(q) ||
        (t?.user?.username || '').toLowerCase().includes(q)
      );
    });

  const filteredVenueTables = venueTableBookings.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (row.table?.tableName || '').toLowerCase().includes(q) ||
      (row.table?.venue?.name || '').toLowerCase().includes(q) ||
      (row.user?.username || '').toLowerCase().includes(q)
    );
  });

  const filteredTickets = ticketOrders.filter((order) => {
    if (!ticketSearch) return true;
    const q = ticketSearch.toLowerCase();
    return (
      (order.event?.title || '').toLowerCase().includes(q) ||
      (order.tierName || '').toLowerCase().includes(q) ||
      (order.purchaser?.username || '').toLowerCase().includes(q) ||
      (order.paystackReference || '').toLowerCase().includes(q)
    );
  });

  const roleKey = statusFilter === 'all' ? 'all' : statusFilter;
  const roleStats = eventSummary?.statsByRole?.[roleKey] || { bookingRowCount: 0, totalPaidZar: 0 };

  const eventTableStats = {
    bookingRows: roleStats.bookingRowCount ?? 0,
    totalRevenue: roleStats.totalPaidZar ?? 0,
    open: eventSummary?.hostedTablesOpen ?? 0,
    full: eventSummary?.hostedTablesFull ?? 0,
    pendingRequests: eventSummary?.pendingJoinRequests ?? 0,
  };

  if (!user) return null;

  const selectTriggerStyle = {
    backgroundColor: 'var(--sec-bg-elevated)',
    borderColor: 'var(--sec-border)',
    color: 'var(--sec-text-primary)',
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <PageBackHeader
        title="Bookings"
        subtitle="Tables, venue reservations, and ticket sales in one place"
      />

      <div style={{ padding: '0 20px 32px' }}>
        <div style={{ marginBottom: 20 }}>
          <VenueSwitcher />
        </div>

        <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
          <TabsList
            className="w-full justify-start gap-0 mb-6 rounded-xl p-1"
            style={{ background: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)', height: 'auto' }}
          >
            <TabsTrigger
              value="tables"
              className="flex-1 rounded-lg data-[state=active]:bg-[var(--sec-bg-elevated)] data-[state=active]:shadow-sm"
              style={{ gap: 8, padding: '10px 16px', border: 'none', marginBottom: 0 }}
            >
              <Armchair size={16} />
              Table bookings
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="flex-1 rounded-lg data-[state=active]:bg-[var(--sec-bg-elevated)] data-[state=active]:shadow-sm"
              style={{ gap: 8, padding: '10px 16px', border: 'none', marginBottom: 0 }}
            >
              <Ticket size={16} />
              Ticket bookings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="mt-0">
            <Tabs value={tableSubTab} onValueChange={setTableSubTab}>
              <TabsList className="mb-5 border-0 gap-2" style={{ background: 'transparent' }}>
                <TabsTrigger
                  value="event"
                  className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-[var(--sec-accent-muted)] data-[state=active]:text-[var(--sec-accent)]"
                  style={{ border: '1px solid var(--sec-border)', marginBottom: 0 }}
                >
                  Event table bookings
                </TabsTrigger>
                <TabsTrigger
                  value="venue-day"
                  className="rounded-full px-4 py-2 text-sm data-[state=active]:bg-[var(--sec-accent-muted)] data-[state=active]:text-[var(--sec-accent)]"
                  style={{ border: '1px solid var(--sec-border)', marginBottom: 0 }}
                >
                  Venue &amp; day tables
                </TabsTrigger>
              </TabsList>

              <TabsContent value="event" className="mt-0">
                <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  SEC hosted tables — host fees, guest joins, and tier payments for your events.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <StatTile label="Booking lines" value={eventTableStats.bookingRows} accent />
                  <StatTile label="Open tables" value={eventTableStats.open} />
                  <StatTile label="Full tables" value={eventTableStats.full} />
                  <StatTile label="Join requests" value={eventTableStats.pendingRequests} />
                  <StatTile label="Paid (filter)" value={`R${Number(eventTableStats.totalRevenue || 0).toFixed(0)}`} accent />
                </div>

                <FilterBar>
                  <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
                    <Input
                      placeholder="Search event, table, or guest…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 rounded-xl pl-9"
                      style={selectTriggerStyle}
                    />
                  </div>
                  <Select value={eventTimeScope} onValueChange={setEventTimeScope}>
                    <SelectTrigger className="w-[180px] h-10 rounded-xl" style={selectTriggerStyle}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)]">
                      <SelectItem value="active">Active events</SelectItem>
                      <SelectItem value="past">Past events</SelectItem>
                      <SelectItem value="all">All events</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px] h-10 rounded-xl" style={selectTriggerStyle}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)]">
                      <SelectItem value="all">All roles</SelectItem>
                      <SelectItem value="HOST">Host fee</SelectItem>
                      <SelectItem value="GUEST">Guest join</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger className="w-[200px] h-10 rounded-xl" style={selectTriggerStyle}>
                      <SelectValue placeholder="Event" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)]">
                      <SelectItem value="all">All events</SelectItem>
                      {eventOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterBar>

                {eventTablesLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: 'var(--sec-accent)' }} /></div>
                ) : filteredEventTables.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No event table bookings"
                    description={search ? 'Try a different search term or broaden your filters.' : 'Bookings appear here when guests host or join tables at your events.'}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredEventTables.map((t) => (
                      <div
                        key={t.id}
                        className="sec-card"
                        style={{ padding: '14px 16px', border: '1px solid var(--sec-border)', cursor: 'pointer' }}
                        onClick={() => setDetailTable(t)}
                        onKeyDown={(e) => e.key === 'Enter' && setDetailTable(t)}
                        role="button"
                        tabIndex={0}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                            background: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Users size={20} style={{ color: 'var(--sec-accent)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.event?.title || 'Event booking'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                              {t.hostedTable?.tableName || 'Hosted table'} · {t.role}
                              {Number(t.lineTotalZar || 0) > 0 ? ` · R${Number(t.lineTotalZar).toFixed(0)}` : ''}
                            </div>
                          </div>
                          <StatusBadge status={(t.hostedTable?.status || '').toLowerCase()} />
                          <Eye size={16} style={{ color: 'var(--sec-text-muted)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="venue-day" className="mt-0">
                <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  Paid bookings from Book on Sec and custom table requests after guests complete checkout.
                </p>

                <FilterBar>
                  <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
                    <Input
                      placeholder="Search table, venue, or guest…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 rounded-xl pl-9"
                      style={selectTriggerStyle}
                    />
                  </div>
                </FilterBar>

                {venueBookingsLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: 'var(--sec-accent)' }} /></div>
                ) : filteredVenueTables.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No venue or day bookings"
                    description="When guests pay for venue tables or custom requests, they will show up here."
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filteredVenueTables.map((row) => {
                      const specs = row.userSpecs || {};
                      return (
                        <div key={row.id} className="sec-card" style={{ padding: 16, border: '1px solid var(--sec-border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
                                {row.table?.tableName}
                                {row.table?.isCustomListing ? (
                                  <span style={{ marginLeft: 8, fontSize: 10, textTransform: 'uppercase', color: 'var(--sec-accent)', letterSpacing: '0.06em' }}>Custom</span>
                                ) : null}
                              </p>
                              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                                {row.table?.venue?.name}
                                {row.table?.event?.title ? ` · ${row.table.event.title}` : ' · Day booking'}
                              </p>
                              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                                @{row.user?.username || row.user?.fullName || 'Guest'}
                              </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--sec-accent)' }}>
                                R{Number(row.amountPaid || 0).toFixed(0)}
                              </p>
                              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sec-text-muted)', marginTop: 4 }}>
                                {row.settlementMode || '—'}
                              </p>
                            </div>
                          </div>
                          {(specs.guestCount || specs.notes) ? (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sec-border)', fontSize: 12, color: 'var(--sec-text-secondary)' }}>
                              {specs.guestCount != null ? <span>Guests: {specs.guestCount} · </span> : null}
                              {specs.notes ? <span className="italic">&ldquo;{specs.notes}&rdquo;</span> : null}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl(`TableDetails?id=${row.table?.id}&source=venue`))}>
                              View table
                            </Button>
                            {row.canRelease ? (
                              <Button
                                size="sm"
                                className="sec-btn-secondary"
                                disabled={releaseMutation.isPending}
                                onClick={() => {
                                  if (!window.confirm('Make this table available again? Current booking will be cleared.')) return;
                                  releaseMutation.mutate(row.table?.id);
                                }}
                              >
                                {releaseMutation.isPending ? 'Releasing…' : 'Make available again'}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="tickets" className="mt-0">
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Ticket purchases for your ticketing events — tier, quantity, and check-in status.
            </p>

            {ticketScopeNotice(ticketBookingsData?.notice) && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--sec-accent-border)',
                  background: 'var(--sec-accent-muted)',
                  fontSize: 13,
                  color: 'var(--sec-text-secondary)',
                }}
              >
                {ticketScopeNotice(ticketBookingsData.notice)}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
              <StatTile label="Orders" value={ticketSummary?.orderCount ?? 0} accent />
              <StatTile label="Tickets sold" value={ticketSummary?.ticketCount ?? 0} />
              <StatTile label="Your share" value={`R${Number(ticketSummary?.totalVenueShareZar || 0).toFixed(0)}`} accent />
            </div>

            <FilterBar>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
                <Input
                  placeholder="Search event, tier, buyer, or reference…"
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  className="h-10 rounded-xl pl-9"
                  style={selectTriggerStyle}
                />
              </div>
              <Select value={ticketEventTimeScope} onValueChange={setTicketEventTimeScope}>
                <SelectTrigger className="w-[180px] h-10 rounded-xl" style={selectTriggerStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)]">
                  <SelectItem value="active">Active events</SelectItem>
                  <SelectItem value="past">Past events</SelectItem>
                  <SelectItem value="all">All events</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ticketEventId} onValueChange={setTicketEventId}>
                <SelectTrigger className="w-[200px] h-10 rounded-xl" style={selectTriggerStyle}>
                  <SelectValue placeholder="Event" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)]">
                  <SelectItem value="all">All events</SelectItem>
                  {(ticketBookingsData?.eventSummaries || []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title || 'Untitled event'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar>

            {ticketsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: 'var(--sec-accent)' }} /></div>
            ) : filteredTickets.length === 0 ? (
              <EmptyState
                icon={Ticket}
                title="No ticket bookings yet"
                description="When party goers buy tickets for your events, orders will appear here with tier and admission details."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredTickets.map((order) => (
                  <div
                    key={order.id}
                    className="sec-card"
                    style={{ padding: '14px 16px', border: '1px solid var(--sec-border)', cursor: 'pointer' }}
                    onClick={() => setDetailTicket(order)}
                    onKeyDown={(e) => e.key === 'Enter' && setDetailTicket(order)}
                    role="button"
                    tabIndex={0}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                        background: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ticket size={20} style={{ color: 'var(--sec-accent)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {order.event?.title || 'Ticket order'}
                        </div>
                        {formatEventWhen(order.event) && (
                          <div style={{ fontSize: 12, color: 'var(--sec-text-secondary)', marginTop: 2 }}>
                            {formatEventWhen(order.event)}
                            {order.event?.city ? ` · ${order.event.city}` : ''}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                          {order.tierName} · {order.quantity} ticket{order.quantity === 1 ? '' : 's'} · @{order.purchaser?.username || 'guest'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sec-accent)' }}>
                          R{Number(order.venueShareZar || order.amountPaidZar || 0).toFixed(0)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2 }}>Your share</div>
                      </div>
                      <ChevronRight size={18} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Event table detail */}
      <Dialog open={!!detailTable} onOpenChange={() => setDetailTable(null)}>
        <DialogContent className="sm:max-w-[440px]" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}>
          <DialogHeader>
            <DialogTitle>Table booking details</DialogTitle>
          </DialogHeader>
          {detailTable && (
            <div className="space-y-3 mt-2">
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Status</span><StatusBadge status={(detailTable.hostedTable?.status || '').toLowerCase()} /></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Role</span><span className="text-sm font-semibold">{detailTable.role}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Total paid</span><span className="text-sm font-semibold">R {Number(detailTable.lineTotalZar ?? 0).toFixed(0)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Reference</span><span className="text-xs font-mono">{detailTable.paystackReference || '—'}</span></div>
              <Button
                onClick={() => { setDetailTable(null); navigate(createPageUrl('TableDetails') + `?id=${detailTable.hostedTable?.id}&source=hosted`); }}
                className="w-full h-10 rounded-xl font-semibold sec-btn-accent mt-2"
              >
                Manage table <ChevronRight size={15} className="ml-1" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ticket order detail */}
      <Dialog open={!!detailTicket} onOpenChange={() => setDetailTicket(null)}>
        <DialogContent className="sm:max-w-[440px]" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}>
          <DialogHeader>
            <DialogTitle>Ticket order</DialogTitle>
          </DialogHeader>
          {detailTicket && (
            <div className="space-y-3 mt-2">
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Event</span><span className="text-sm font-semibold text-right max-w-[60%]">{detailTicket.event?.title}</span></div>
              {formatEventWhen(detailTicket.event) && (
                <div className="flex justify-between">
                  <span className="text-sm text-[var(--sec-text-muted)]">When</span>
                  <span className="text-sm font-semibold text-right max-w-[60%]">
                    {formatEventWhen(detailTicket.event)}
                    {detailTicket.event?.city ? ` · ${detailTicket.event.city}` : ''}
                  </span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Tier</span><span className="text-sm font-semibold">{detailTicket.tierName}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Buyer</span><span className="text-sm font-semibold">@{detailTicket.purchaser?.username || 'guest'}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Quantity</span><span className="text-sm font-semibold">{detailTicket.quantity}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Checked in</span><span className="text-sm font-semibold">{detailTicket.admittedCount} / {detailTicket.quantity}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Your share</span><span className="text-sm font-semibold text-[var(--sec-accent)]">R{Number(detailTicket.venueShareZar || 0).toFixed(0)}</span></div>
              <div className="flex justify-between"><span className="text-sm text-[var(--sec-text-muted)]">Gross paid</span><span className="text-sm font-semibold">R{Number(detailTicket.grossPaidZar || detailTicket.amountPaidZar || 0).toFixed(0)}</span></div>
              {detailTicket.tickets?.length > 0 ? (
                <div className="pt-2 border-t border-[var(--sec-border)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sec-text-muted)] mb-2">Ticket holders</p>
                  <ul className="space-y-2">
                    {detailTicket.tickets.map((t) => (
                      <li key={t.id} className="flex justify-between text-sm">
                        <span>{t.holderDisplayName || 'Guest'}</span>
                        {t.admittedAt ? <StatusBadge status="admitted" label="Checked in" /> : <StatusBadge status="pending" label="Not checked in" />}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
