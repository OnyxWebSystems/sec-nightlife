import React, { useState, useEffect } from 'react';
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
  PieChart
} from 'lucide-react';
import { format, subDays } from 'date-fns';

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

  const { data: venues = [] } = useQuery({
    queryKey: ['my-venues'],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user,
  });

  const { data: analytics } = useQuery({
    queryKey: ['venue-analytics', selectedVenue, dateRange, revenueScope, selectedEventId],
    queryFn: () => {
      const days = parseInt(dateRange, 10) || 30;
      const params = new URLSearchParams({
        venue_id: selectedVenue,
        days: String(days),
      });
      if (revenueScope === 'per_event' && selectedEventId) {
        params.set('event_id', selectedEventId);
      }
      return apiGet(`/api/business/venue-analytics?${params.toString()}`);
    },
    enabled: !!user && !!selectedVenue,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['venue-events', selectedVenue],
    queryFn: () => dataService.Event.filter({ venue_id: selectedVenue }),
    enabled: !!selectedVenue
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['venue-reviews', selectedVenue],
    queryFn: () => dataService.Review.filter({ venue_id: selectedVenue }),
    enabled: !!selectedVenue,
  });

  useEffect(() => {
    setRevenueScope('all_events');
    setSelectedEventId('');
  }, [selectedVenue]);

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId('');
      return;
    }
    if (!selectedEventId || !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Calculate metrics (revenue + tickets from server-side Payment / Transaction aggregation)
  const calculateMetrics = () => {
    const gross = Number(analytics?.grossRevenueZar || 0);
    const net = Number(analytics?.netRevenueZar || gross * 0.85);
    const activeGross = gross;
    const activeRevenue = revenueMode === 'net' ? net : gross;

    const ticketSales = Number(analytics?.ticketSalesCount || 0);
    const avgRating =
      reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

    const eventTypeCounts = events.reduce((acc, event) => {
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

    const hourCounts = events.reduce((acc, event) => {
      if (event.start_time) {
        const hour = parseInt(String(event.start_time).split(':')[0], 10);
        if (!Number.isNaN(hour)) acc[hour] = (acc[hour] || 0) + 1;
      }
      return acc;
    }, {});

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    const eventRevenueCount = revenueScope === 'per_event' ? 1 : Math.max(1, events.length);
    const avgRevenuePerEventRaw = eventRevenueCount > 0 ? activeGross / eventRevenueCount : 0;
    const avgRevenuePerEvent = revenueMode === 'net' ? avgRevenuePerEventRaw * 0.85 : avgRevenuePerEventRaw;

    return {
      totalRevenue: activeRevenue,
      ticketSales,
      avgRating,
      totalEvents: events.length,
      upcomingEvents: events.filter((e) => new Date(e.date) >= new Date()).length,
      eventTypeCounts,
      peakHour: peakHour ? `${peakHour[0]}:00` : 'N/A',
      avgRevenuePerEvent,
      eventRevenueCount,
    };
  };

  const metrics = selectedVenue ? calculateMetrics() : null;

  const getSalesTrend = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    const byDay = Object.fromEntries((analytics?.revenueByDay || []).map((d) => [d.date, d.gross]));
    return last7Days.map((day) => ({
      date: format(day, 'MMM dd'),
      sales: Number(byDay[format(day, 'yyyy-MM-dd')] || 0),
    }));
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Analytics Dashboard</h1>
            <p className="text-gray-500 mt-1">Business insights and performance metrics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32 bg-[#141416] border-[#262629]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#141416] border-[#262629] text-white">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Venue Selector */}
        <Card className="glass-card border-[#262629]">
          <CardContent className="pt-6">
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
          </CardContent>
        </Card>

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
                      <SelectItem value="net">Net Revenue (after 15%)</SelectItem>
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
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.title || (event.date ? `Untitled event (${format(new Date(event.date), 'MMM dd')})` : 'Untitled event')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Total Revenue</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        R{metrics.totalRevenue.toLocaleString()}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--sec-success)' }}>
                        {revenueScope === 'per_event' ? 'Selected event' : 'All hosted events'} - {revenueMode === 'net' ? 'Net' : 'Gross'} - Last {dateRange} days
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8" style={{ color: 'var(--sec-success)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Ticket Sales</p>
                      <p className="text-3xl font-bold text-white mt-1">{metrics.ticketSales}</p>
                      <p className="text-xs text-gray-500 mt-1">Tickets issued in period</p>
                    </div>
                    <Users className="w-8 h-8" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Average Rating</p>
                      <p className="text-3xl font-bold text-white mt-1">
                        {metrics.avgRating.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{reviews.length} reviews</p>
                    </div>
                    <Star className="w-8 h-8" style={{ color: 'var(--sec-warning)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[#262629]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Total Events</p>
                      <p className="text-3xl font-bold text-white mt-1">{metrics.totalEvents}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--sec-accent)' }}>{metrics.upcomingEvents} upcoming</p>
                    </div>
                    <Calendar className="w-8 h-8" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sales Trend */}
            <Card className="glass-card border-[#262629]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
                  Revenue trend (last 7 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end gap-2">
                  {getSalesTrend().map((day, idx) => {
                    const maxSales = Math.max(...getSalesTrend().map(d => d.sales), 1);
                    const height = (day.sales / maxSales) * 100;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full bg-[#141416] rounded-t-lg relative" style={{ height: `${height}%`, minHeight: day.sales > 0 ? '20px' : '4px' }}>
                          <div className="absolute inset-0 rounded-t-lg" style={{ background: 'var(--sec-gradient-silver)' }} />
                          {day.sales > 0 && (
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-gray-400">
                              R{day.sales}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{day.date}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Event Types & Peak Times */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card border-[#262629]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                    Popular Event Types
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.eventTypeCounts).map(([type, count]) => {
                      const total = Object.values(metrics.eventTypeCounts).reduce((a, b) => a + b, 0);
                      const percentage = (count / total) * 100;
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-gray-400">{type}</span>
                            <span className="text-sm text-white font-semibold">{count}</span>
                          </div>
                          <div className="h-2 bg-[#141416] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-[var(--sec-accent)] to-[var(--sec-accent)]"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                    <p className="text-sm text-gray-400 mb-1">Hosted table payments (period)</p>
                    <p className="text-xl font-bold text-white">
                      R{Math.round(Number(analytics?.hostedTablePaymentZar || 0)).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">From successful Paystack rows tagged for your venue</p>
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