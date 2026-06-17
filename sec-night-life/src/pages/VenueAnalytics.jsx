import React, { useState, useEffect, useMemo } from 'react';
import * as authService from '@/services/authService';
import { apiGet } from '@/api/client';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Calendar,
  Star,
  Clock,
  PieChart as PieChartIcon
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';

const REVENUE_CHART_CONFIG = {
  sales: { label: 'Revenue', color: '#d4af37' },
};

const EVENT_TYPE_COLORS = ['#d4af37', '#c0c0c0', '#a78bfa', '#64748b', '#22c55e'];

function isTicketingEvent(event) {
  const tiers = event?.ticket_tiers;
  const hasTiers = Array.isArray(tiers) ? tiers.length > 0 : Boolean(tiers && Object.keys(tiers).length);
  return event?.event_format === 'TICKETING_ONLY' || hasTiers;
}

export default function VenueAnalytics() {
  const [user, setUser] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [revenueMode, setRevenueMode] = useState('gross');
  const [revenueScope, setRevenueScope] = useState('all_events');
  const [selectedEventId, setSelectedEventId] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (e) {
      authService.redirectToLogin();
    }
  };

  const { venues, activeVenueId, setActiveVenueId } = useActiveVenue();

  const venueScope = useBusinessVenueScope();
  const scopeKey = venueScope.staffContextToken || venueScope.venueId;

  useEffect(() => {
    if (venueScope.inStaffSession) return;
    if (activeVenueId) setSelectedVenue(activeVenueId);
  }, [activeVenueId, venueScope.inStaffSession]);

  useEffect(() => {
    if (venueScope.inStaffSession) return;
    if (selectedVenue && selectedVenue !== activeVenueId) {
      setActiveVenueId(selectedVenue);
    }
  }, [selectedVenue, venueScope.inStaffSession]);

  useEffect(() => {
    if (venueScope.inStaffSession && scopeKey) {
      setSelectedVenue(scopeKey);
    }
  }, [venueScope.inStaffSession, scopeKey]);

  const selectedVenueRecord = useMemo(() => {
    if (venueScope.inStaffSession) {
      return { id: scopeKey, name: venueScope.venueName };
    }
    return venues.find((v) => v.id === selectedVenue) || null;
  }, [venues, selectedVenue, venueScope.inStaffSession, scopeKey, venueScope.venueName]);

  const { data: analytics, isLoading: analyticsLoading, isFetching: analyticsFetching } = useQuery({
    queryKey: ['venue-analytics', scopeKey, dateRange, revenueScope, selectedEventId],
    queryFn: () => {
      const days = parseInt(dateRange, 10) || 30;
      const params = new URLSearchParams({
        days: String(days),
      });
      if (venueScope.venueQuery) {
        const extra = new URLSearchParams(venueScope.venueQuery);
        extra.forEach((v, k) => params.set(k, v));
      }
      if (revenueScope === 'per_event' && selectedEventId) {
        params.set('event_id', selectedEventId);
      }
      return apiGet(`/api/business/venue-analytics?${params.toString()}`);
    },
    enabled: !!user && !!venueScope.venueQuery,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['venue-events', scopeKey],
    queryFn: () =>
      venueScope.inStaffSession
        ? apiGet(`/api/events?staff_ctx=${encodeURIComponent(venueScope.staffContextToken)}`)
        : dataService.Event.filter({ venue_id: selectedVenue }),
    enabled: !!venueScope.venueQuery,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['venue-reviews', scopeKey],
    queryFn: () => dataService.Review.filter({ venue_id: venueScope.venueId || selectedVenue }),
    enabled: !venueScope.inStaffSession && !!selectedVenue,
  });

  useEffect(() => {
    setRevenueScope('all_events');
    setSelectedEventId('');
  }, [selectedVenue]);

  const ticketingEvents = useMemo(
    () => events.filter(isTicketingEvent),
    [events],
  );

  const eventSelectionOptions = useMemo(() => {
    const ticketingIds = new Set(ticketingEvents.map((e) => e.id));
    const nonTicketing = events.filter((e) => !ticketingIds.has(e.id));
    return [...ticketingEvents, ...nonTicketing];
  }, [events, ticketingEvents]);

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId('');
      return;
    }
    const preferredPool = ticketingEvents.length ? ticketingEvents : events;
    if (!selectedEventId || !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(preferredPool[0].id);
    }
  }, [events, ticketingEvents, selectedEventId]);

  const periodDays = Math.min(366, Math.max(1, parseInt(dateRange, 10) || 30));
  const periodCutoff = useMemo(() => subDays(new Date(), periodDays), [periodDays]);

  const scopedEvents = useMemo(() => {
    let list = events.filter((e) => e.date && new Date(e.date) >= periodCutoff);
    if (revenueScope === 'per_event' && selectedEventId) {
      list = list.filter((e) => e.id === selectedEventId);
    }
    return list;
  }, [events, periodCutoff, revenueScope, selectedEventId]);

  // Calculate metrics (revenue + tickets from server-side Payment / Transaction aggregation)
  const calculateMetrics = () => {
    const gross = Number(analytics?.grossRevenueZar || 0);
    const net = Number(analytics?.netRevenueZar ?? 0);
    const activeRevenue = revenueMode === 'net' ? net : gross;

    const ticketSales = Number(analytics?.ticketSalesCount || 0);
    const avgRating =
      reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

    const eventTypeCounts = scopedEvents.reduce((acc, event) => {
      const title = (event.title || '').toLowerCase();
      const type = title.includes('concert')
        ? 'Concert'
        : title.includes('party')
          ? 'Party'
          : title.includes('festival')
            ? 'Festival'
            : 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const hourCounts = scopedEvents.reduce((acc, event) => {
      if (event.start_time) {
        const hour = parseInt(String(event.start_time).split(':')[0], 10);
        if (!Number.isNaN(hour)) acc[hour] = (acc[hour] || 0) + 1;
      }
      return acc;
    }, {});

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    const eventsInPeriod = Number(analytics?.eventsInPeriod ?? scopedEvents.length);
    const eventRevenueCount = revenueScope === 'per_event' ? 1 : Math.max(1, eventsInPeriod);
    const avgRevenuePerEvent = eventRevenueCount > 0 ? activeRevenue / eventRevenueCount : 0;

    return {
      totalRevenue: activeRevenue,
      ticketSales,
      avgRating,
      totalEvents: eventsInPeriod,
      upcomingEvents: Number(analytics?.upcomingEventsCount ?? 0),
      ticketPaymentZar: Number(analytics?.ticketPaymentZar || 0),
      hostedTablePaymentZar: Number(analytics?.hostedTablePaymentZar || 0),
      venueTablePaymentZar: Number(analytics?.venueTablePaymentZar || 0),
      otherPaymentZar: Number(analytics?.otherPaymentZar || 0),
      eventTypeCounts,
      peakHour: peakHour ? `${peakHour[0]}:00` : 'N/A',
      avgRevenuePerEvent,
      eventRevenueCount,
    };
  };

  const metrics = selectedVenue ? calculateMetrics() : null;

  const salesTrend = useMemo(() => {
    const days = periodDays;
    const daysChrono = Array.from({ length: days }, (_, i) => subDays(new Date(), days - 1 - i));
    const byDayGross = Object.fromEntries((analytics?.revenueByDay || []).map((d) => [d.date, Number(d.gross) || 0]));
    const byDayNet = Object.fromEntries((analytics?.revenueByDay || []).map((d) => [d.date, Number(d.net ?? d.gross) || 0]));
    const grossTotal = Number(analytics?.grossRevenueZar || 0);
    const netTotal = Number(analytics?.netRevenueZar ?? 0);
    return daysChrono.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const dayGross = Number(byDayGross[key] || 0);
      const amount =
        revenueMode === 'net'
          ? Number(byDayNet[key] ?? (grossTotal > 0 ? (dayGross / grossTotal) * netTotal : 0))
          : dayGross;
      return {
        key,
        date: format(day, days <= 14 ? 'MMM dd' : 'd MMM'),
        sales: amount,
      };
    });
  }, [analytics?.revenueByDay, analytics?.grossRevenueZar, analytics?.netRevenueZar, periodDays, revenueMode]);

  const eventTypeChartData = useMemo(() => {
    if (!metrics?.eventTypeCounts) return [];
    return Object.entries(metrics.eventTypeCounts).map(([name, value]) => ({ name, value }));
  }, [metrics?.eventTypeCounts]);

  const hasAnalyticsData =
    Boolean(analytics) &&
    (Number(analytics?.grossRevenueZar || 0) > 0 ||
      Number(analytics?.ticketSalesCount || 0) > 0 ||
      salesTrend.some((d) => d.sales > 0));

  const chartsLoading = analyticsLoading || analyticsFetching;

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      <PageBackHeader title="Analytics Dashboard" subtitle="Business insights and performance metrics" />
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        <div className="flex items-center justify-end">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40 bg-[#141416] border-[#262629]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#141416] border-[#262629] text-white">
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Venue Selector */}
        <Card className="glass-card border-[#262629]">
          <CardContent className="pt-6">
            {venues.length === 0 ? (
              <p className="text-sm text-gray-500">No venues linked to this account yet.</p>
            ) : venues.length === 1 && selectedVenueRecord ? (
              <div>
                <p className="text-xs text-gray-500 mb-1">Venue</p>
                <p className="text-white font-medium">{selectedVenueRecord.name}</p>
              </div>
            ) : (
              <Select value={selectedVenue} onValueChange={setSelectedVenue}>
                <SelectTrigger className="bg-[#141416] border-[#262629]">
                  <SelectValue placeholder="Select a venue to view analytics" />
                </SelectTrigger>
                <SelectContent className="bg-[#141416] border-[#262629] text-white">
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {selectedVenue && chartsLoading && !metrics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="glass-card border-[#262629]">
                  <CardContent className="pt-6 space-y-3">
                    <Skeleton className="h-4 w-24 bg-[#262629]" />
                    <Skeleton className="h-8 w-32 bg-[#262629]" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="glass-card border-[#262629]">
              <CardContent className="pt-6">
                <Skeleton className="h-64 w-full bg-[#262629]" />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {selectedVenue && metrics && !hasAnalyticsData && !chartsLoading ? (
          <Card className="glass-card border-[#262629]">
            <CardContent className="py-16 text-center">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p className="text-white font-medium">No revenue data yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Analytics will appear after ticket sales or table payments in the last {dateRange} days.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {metrics && (
          <>
            {/* Revenue Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-gray-500 text-sm">Revenue Mode</p>
                  <Select value={revenueMode} onValueChange={setRevenueMode}>
                    <SelectTrigger className="bg-[#141416] border-[#262629]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#262629] text-white">
                      <SelectItem value="gross">Gross Revenue</SelectItem>
                      <SelectItem value="net">Net revenue (matches total; share of fees by day)</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-gray-500 text-sm">Revenue Scope</p>
                  <Select value={revenueScope} onValueChange={setRevenueScope}>
                    <SelectTrigger className="bg-[#141416] border-[#262629]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#262629] text-white">
                      <SelectItem value="all_events">All Events Combined</SelectItem>
                      <SelectItem value="per_event">Single Event</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-gray-500 text-sm">Event Selection</p>
                  <Select
                    value={selectedEventId}
                    onValueChange={setSelectedEventId}
                    disabled={revenueScope !== 'per_event' || events.length === 0}
                  >
                    <SelectTrigger className="bg-[#141416] border-[#262629] disabled:opacity-50">
                      <SelectValue
                        placeholder={events.length === 0 ? 'No events available' : 'Select an event'}
                      />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#262629] text-white">
                      {eventSelectionOptions.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.title || (event.date ? `Untitled event (${format(new Date(event.date), 'MMM dd')})` : 'Untitled event')}
                          {isTicketingEvent(event) ? ' · Tickets' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-card border-[#262629] border-l-2 border-l-[var(--sec-success)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Total Revenue</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-28 mt-1 bg-[#262629]" />
                      ) : (
                      <p className="text-3xl font-bold text-white mt-1">
                        R{metrics.totalRevenue.toLocaleString()}
                      </p>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--sec-success)' }}>
                        {revenueScope === 'per_event' ? 'Selected event' : 'All hosted events'} - {revenueMode === 'net' ? 'Net' : 'Gross'} - Last {dateRange} days
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8" style={{ color: 'var(--sec-success)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629] border-l-2 border-l-[var(--sec-accent)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Ticket Sales</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-16 mt-1 bg-[#262629]" />
                      ) : (
                      <p className="text-3xl font-bold text-white mt-1">{metrics.ticketSales}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">Tickets issued in period</p>
                    </div>
                    <Users className="w-8 h-8" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629] border-l-2 border-l-[var(--sec-warning)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Average Rating</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-16 mt-1 bg-[#262629]" />
                      ) : (
                      <p className="text-3xl font-bold text-white mt-1">
                        {metrics.avgRating.toFixed(1)}
                      </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{reviews.length} reviews (all time)</p>
                    </div>
                    <Star className="w-8 h-8" style={{ color: 'var(--sec-warning)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629] border-l-2 border-l-[var(--sec-accent)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Total Events</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-12 mt-1 bg-[#262629]" />
                      ) : (
                      <p className="text-3xl font-bold text-white mt-1">{metrics.totalEvents}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--sec-accent)' }}>{metrics.upcomingEvents} upcoming · last {dateRange} days</p>
                    </div>
                    <Calendar className="w-8 h-8" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <p className="text-gray-500 text-sm">Ticket revenue</p>
                  <p className="text-2xl font-bold text-white mt-1">R{metrics.ticketPaymentZar.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <p className="text-gray-500 text-sm">Hosted tables</p>
                  <p className="text-2xl font-bold text-white mt-1">R{metrics.hostedTablePaymentZar.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <p className="text-gray-500 text-sm">Venue tables</p>
                  <p className="text-2xl font-bold text-white mt-1">R{metrics.venueTablePaymentZar.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <p className="text-gray-500 text-sm">Other</p>
                  <p className="text-2xl font-bold text-white mt-1">R{metrics.otherPaymentZar.toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* Sales Trend — days match header selector; amounts match gross vs net mode */}
            <Card className="glass-card border-[#262629]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
                  Revenue trend (last {periodDays} days) — {revenueMode === 'net' ? 'Net' : 'Gross'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartsLoading ? (
                  <Skeleton className="h-64 w-full bg-[#262629]" />
                ) : salesTrend.length === 0 ? (
                  <p className="text-sm text-gray-500 py-12 text-center">No revenue in this period.</p>
                ) : (
                  <ChartContainer config={REVENUE_CHART_CONFIG} className="h-64 w-full aspect-auto">
                    <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d4af37" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262629" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        interval={periodDays <= 14 ? 0 : Math.floor(periodDays / 8)}
                      />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `R${Math.round(v / 1000)}k`}
                        width={48}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => [`R${Math.round(Number(value)).toLocaleString()}`, 'Revenue']}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke="#d4af37"
                        strokeWidth={2}
                        fill="url(#revenueFill)"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Event Types & Peak Times */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card border-[#262629]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                    Popular Event Types (last {dateRange} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {eventTypeChartData.length === 0 ? (
                    <p className="text-sm text-gray-500 py-8 text-center">No events in this period yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <ChartContainer
                        config={Object.fromEntries(
                          eventTypeChartData.map((d, i) => [
                            d.name,
                            { label: d.name, color: EVENT_TYPE_COLORS[i % EVENT_TYPE_COLORS.length] },
                          ]),
                        )}
                        className="h-48 w-full aspect-auto mx-auto max-w-[220px]"
                      >
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                          <Pie
                            data={eventTypeChartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={42}
                            outerRadius={72}
                            paddingAngle={2}
                          >
                            {eventTypeChartData.map((entry, index) => (
                              <Cell key={entry.name} fill={EVENT_TYPE_COLORS[index % EVENT_TYPE_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                      <div className="space-y-2">
                        {eventTypeChartData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-gray-400">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: EVENT_TYPE_COLORS[index % EVENT_TYPE_COLORS.length] }}
                              />
                              {entry.name}
                            </span>
                            <span className="text-white font-semibold">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Clock className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                    Performance Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-[#141416]">
                    <p className="text-sm text-gray-400 mb-1">Peak Event Time</p>
                    <p className="text-xl font-bold text-white">{metrics.peakHour}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#141416]">
                    <p className="text-sm text-gray-400 mb-1">Avg. Revenue per Event</p>
                    <p className="text-xl font-bold text-white">
                      R{Math.round(metrics.avgRevenuePerEvent).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {revenueScope === 'per_event' ? 'Selected event view' : `${metrics.eventRevenueCount} events with revenue`}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#141416]">
                    <p className="text-sm text-gray-400 mb-1">Venue table payments (period)</p>
                    <p className="text-xl font-bold text-white">
                      R{Math.round(metrics.venueTablePaymentZar).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Direct venue slot checkouts in the last {dateRange} days</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Reviews Summary */}
            {reviews.length > 0 && (
              <Card className="glass-card border-[#262629]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Star className="w-5 h-5" style={{ color: 'var(--sec-warning)' }} />
                    Recent Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-4 rounded-lg bg-[#141416]">
                      <p className="text-sm text-gray-400">Atmosphere</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(reviews.reduce((sum, r) => sum + (r.atmosphere_rating || 0), 0) / reviews.length).toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-[#141416]">
                      <p className="text-sm text-gray-400">Service</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(reviews.reduce((sum, r) => sum + (r.service_rating || 0), 0) / reviews.length).toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-[#141416]">
                      <p className="text-sm text-gray-400">Value</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(reviews.reduce((sum, r) => sum + (r.value_rating || 0), 0) / reviews.length).toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {reviews.slice(0, 3).map((review) => (
                      <div key={review.id} className="p-3 rounded-lg bg-[#141416]">
                        <div className="flex items-center gap-2 mb-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
                                i < review.rating ? 'text-[var(--sec-warning)] fill-[var(--sec-warning)]' : 'text-gray-600'
                              }`}
                            />
                          ))}
                          <span className="text-xs text-gray-500">
                            {format(new Date(review.created_date), 'MMM dd')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 line-clamp-2">{review.review_text}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}