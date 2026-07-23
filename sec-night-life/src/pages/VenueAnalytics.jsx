import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiGet } from '@/api/client';
import { dataService } from '@/services/dataService';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  Star,
  Clock,
  PieChart as PieChartIcon,
  ChevronsUpDown,
  Check,
  Loader2,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import { useIsMobile } from '@/hooks/useIsDesktop';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const REVENUE_CHART_CONFIG = {
  sales: { label: 'Revenue', color: '#d4af37' },
};

const EVENT_TYPE_COLORS = ['#d4af37', '#94a3b8', '#22c55e', '#64748b'];
const REVENUE_STREAM_COLORS = ['#d4af37', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c'];

const EVENT_PAGE_SIZE = 30;

function isTicketingEvent(event) {
  const tiers = event?.ticket_tiers;
  const hasTiers = Array.isArray(tiers) ? tiers.length > 0 : Boolean(tiers && Object.keys(tiers).length);
  return event?.event_format === 'TICKETING_ONLY' || hasTiers;
}

function pickRevenueAmount(analytics, grossKey, netKey, revenueMode) {
  if (revenueMode === 'net') return Number(analytics?.[netKey] ?? analytics?.[grossKey] ?? 0);
  return Number(analytics?.[grossKey] ?? 0);
}

function revenueScopeLabel(revenueScope) {
  if (revenueScope === 'per_event') return 'Selected event';
  if (revenueScope === 'ticketed_events') return 'Ticketed events';
  if (revenueScope === 'day_bookings') return 'Day bookings only';
  return 'All hosted events';
}

/** Map UI revenueScope to API revenueScope for cache safety. */
function apiRevenueScope(uiScope) {
  if (uiScope === 'per_event') return 'events';
  if (uiScope === 'ticketed_events') return 'ticketed_events';
  if (uiScope === 'day_bookings') return 'day_bookings';
  return 'all';
}

function eventLabel(event) {
  if (!event) return 'Select an event';
  const title =
    event.title ||
    (event.date ? `Untitled event (${format(new Date(event.date), 'MMM dd')})` : 'Untitled event');
  return isTicketingEvent(event) ? `${title} · Tickets` : title;
}

function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function AnalyticsEventPicker({
  enabled,
  venueScope,
  selectedVenue,
  selectedEventId,
  onSelectEvent,
  selectedEvent,
  ticketedOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'venue-events-picker',
      venueScope.staffContextToken || venueScope.venueId || selectedVenue,
      debouncedSearch,
      ticketedOnly ? 'ticketed' : 'all',
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        paginated: '1',
        skip: String(pageParam),
        limit: String(EVENT_PAGE_SIZE),
        sort: '-date',
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (ticketedOnly) params.set('event_format', 'TICKETING_ONLY');
      if (venueScope.inStaffSession) {
        params.set('staff_ctx', venueScope.staffContextToken);
        return apiGet(`/api/events?${params.toString()}`);
      }
      params.set('venue_id', selectedVenue);
      return apiGet(`/api/events/filter?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.hasMore) return undefined;
      return (lastPage.skip || 0) + (lastPage.items?.length || 0);
    },
    enabled: enabled && !!venueScope.venueQuery && open,
    initialPageParam: 0,
  });

  const items = useMemo(() => {
    const pages = data?.pages || [];
    const seen = new Set();
    const out = [];
    for (const page of pages) {
      for (const event of page.items || []) {
        if (ticketedOnly && !isTicketingEvent(event)) continue;
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        out.push(event);
      }
    }
    if (selectedEvent && !seen.has(selectedEvent.id)) {
      if (!ticketedOnly || isTicketingEvent(selectedEvent)) {
        out.unshift(selectedEvent);
      }
    }
    return out;
  }, [data?.pages, selectedEvent, ticketedOnly]);

  const total = data?.pages?.[0]?.total ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!enabled}
          className="w-full justify-between bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-white hover:bg-[var(--sec-bg-elevated)] hover:text-white disabled:opacity-50"
        >
          <span className="truncate text-left">
            {!enabled
              ? 'Select a scope that uses events'
              : selectedEvent
                ? eventLabel(selectedEvent)
                : ticketedOnly
                  ? 'All ticketed events (or search)'
                  : 'Search and select an event'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-white"
        align="start"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder="Search events by title…"
            value={search}
            onValueChange={setSearch}
            className="text-white"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading events…
              </div>
            ) : (
              <>
                <CommandEmpty>No events found.</CommandEmpty>
                <CommandGroup
                  heading={total != null ? `${total} event${total === 1 ? '' : 's'}` : undefined}
                >
                  {items.map((event) => (
                    <CommandItem
                      key={event.id}
                      value={event.id}
                      onSelect={() => {
                        onSelectEvent(event);
                        setOpen(false);
                      }}
                      className="text-white data-[selected=true]:bg-[var(--sec-border)] data-[selected=true]:text-white"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          selectedEventId === event.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{event.title || 'Untitled event'}</p>
                        <p className="text-xs text-gray-500">
                          {event.date ? format(new Date(event.date), 'MMM dd, yyyy') : 'No date'}
                          {isTicketingEvent(event) ? ' · Tickets' : ' · Tables'}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {hasNextPage ? (
                  <div className="p-2 border-t border-[var(--sec-border)]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full text-gray-300 hover:text-white"
                      disabled={isFetchingNextPage}
                      onClick={() => fetchNextPage()}
                    >
                      {isFetchingNextPage ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        'Load more events'
                      )}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function VenueAnalytics() {
  const { user } = useAuth();
  const [selectedVenue, setSelectedVenue] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [revenueMode, setRevenueMode] = useState('gross');
  const [revenueScope, setRevenueScope] = useState('all_events');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventCache, setSelectedEventCache] = useState(null);
  const isMobile = useIsMobile(640);

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

  const analyticsEventKey =
    revenueScope === 'per_event' || revenueScope === 'ticketed_events' ? selectedEventId || 'all' : null;
  const {
    data: analytics,
    isLoading: analyticsLoading,
    isFetching: analyticsFetching,
    isPlaceholderData: analyticsIsPlaceholder,
  } = useQuery({
    queryKey: ['venue-analytics', scopeKey, dateRange, revenueScope, revenueMode, analyticsEventKey],
    queryFn: () => {
      const days = parseInt(dateRange, 10) || 30;
      const params = new URLSearchParams({
        days: String(days),
        revenue_mode: revenueMode,
      });
      if (venueScope.venueQuery) {
        const extra = new URLSearchParams(venueScope.venueQuery);
        extra.forEach((v, k) => params.set(k, v));
      }
      if (revenueScope === 'per_event') {
        params.set('revenue_scope', 'events');
        if (selectedEventId) params.set('event_id', selectedEventId);
      } else if (revenueScope === 'ticketed_events') {
        params.set('revenue_scope', 'ticketed_events');
        if (selectedEventId) params.set('event_id', selectedEventId);
      } else if (revenueScope === 'day_bookings') {
        params.set('revenue_scope', 'day_bookings');
      } else {
        params.set('revenue_scope', 'all');
      }
      return apiGet(`/api/business/venue-analytics?${params.toString()}`);
    },
    enabled: !!user && !!venueScope.venueQuery && (revenueScope !== 'per_event' || !!selectedEventId),
    staleTime: 120_000,
    // Only keep previous data when it matches the same API revenue scope (prevents All→Day flash).
    placeholderData: (prev) => {
      if (!prev) return undefined;
      if (prev.revenueScope !== apiRevenueScope(revenueScope)) return undefined;
      return prev;
    },
  });

  // Prefetch first page so Single Event has a default selection without opening the picker
  const { data: initialEventsPage } = useQuery({
    queryKey: ['venue-events-initial', scopeKey],
    queryFn: async () => {
      const params = new URLSearchParams({
        paginated: '1',
        skip: '0',
        limit: String(EVENT_PAGE_SIZE),
        sort: '-date',
      });
      if (venueScope.inStaffSession) {
        params.set('staff_ctx', venueScope.staffContextToken);
        return apiGet(`/api/events?${params.toString()}`);
      }
      params.set('venue_id', selectedVenue);
      return apiGet(`/api/events/filter?${params.toString()}`);
    },
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
    setSelectedEventCache(null);
  }, [selectedVenue]);

  useEffect(() => {
    if (revenueScope !== 'ticketed_events') return;
    if (!selectedEventId) return;
    if (selectedEventCache?.id === selectedEventId && isTicketingEvent(selectedEventCache)) return;
    const fromInitial = (initialEventsPage?.items || []).find((e) => e.id === selectedEventId);
    if (fromInitial && isTicketingEvent(fromInitial)) return;
    setSelectedEventId('');
    setSelectedEventCache(null);
  }, [revenueScope, selectedEventId, selectedEventCache, initialEventsPage]);

  useEffect(() => {
    const items = initialEventsPage?.items || [];
    if (!items.length) return;
    if (selectedEventId && items.some((e) => e.id === selectedEventId)) {
      const match = items.find((e) => e.id === selectedEventId);
      if (match) setSelectedEventCache(match);
      return;
    }
    // Only auto-pick for Single Event scope; ticketed scope allows "all ticketed".
    if (!selectedEventId && revenueScope === 'per_event') {
      const preferred = items.find(isTicketingEvent) || items[0];
      if (preferred) {
        setSelectedEventId(preferred.id);
        setSelectedEventCache(preferred);
      }
    }
  }, [initialEventsPage, selectedEventId, revenueScope]);

  const handleSelectEvent = useCallback((event) => {
    if (!event?.id) return;
    setSelectedEventId(event.id);
    setSelectedEventCache(event);
  }, []);

  const periodDays = Math.min(366, Math.max(1, parseInt(dateRange, 10) || 30));

  const calculateMetrics = () => {
    const gross = Number(analytics?.grossRevenueZar || 0);
    const net = Number(analytics?.netRevenueZar ?? 0);
    const activeRevenue = revenueMode === 'net' ? net : gross;

    const ticketSales = Number(analytics?.ticketSalesCount || 0);
    const avgRating =
      reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

    const eventsInPeriod = Number(analytics?.eventsInPeriod ?? 0);
    const eventsWithRevenueCount = Number(analytics?.eventsWithRevenueCount ?? 0);
    const tablesWithRevenueCount = Number(analytics?.tablesWithRevenueCount ?? 0);
    const dayBookingTierWithActivity = Number(analytics?.dayBookingTierWithActivity ?? 0);
    const eventRevenueCount =
      revenueScope === 'per_event'
        ? activeRevenue > 0
          ? 1
          : 0
        : eventsWithRevenueCount;
    const avgRevenuePerEvent = eventRevenueCount > 0 ? activeRevenue / eventRevenueCount : 0;

    const menuPaymentZar = pickRevenueAmount(analytics, 'menuPaymentZar', 'menuPaymentNetZar', revenueMode);
    const dayBookingMenuPaymentZar = pickRevenueAmount(
      analytics,
      'dayBookingMenuPaymentZar',
      'dayBookingMenuPaymentNetZar',
      revenueMode,
    );

    // Mean of per-tier averages from API (preferred); fall back only if missing.
    const avgFromApi = pickRevenueAmount(
      analytics,
      'avgRevenuePerTableZar',
      'avgRevenuePerTableNetZar',
      revenueMode,
    );
    const avgRevenuePerTable =
      avgFromApi > 0
        ? avgFromApi
        : tablesWithRevenueCount > 0
          ? activeRevenue / tablesWithRevenueCount
          : 0;

    return {
      totalRevenue: activeRevenue,
      ticketSales,
      avgRating,
      totalEvents: eventsInPeriod,
      upcomingEvents: Number(analytics?.upcomingEventsCount ?? 0),
      ticketPaymentZar: pickRevenueAmount(analytics, 'ticketPaymentZar', 'ticketPaymentNetZar', revenueMode),
      entrancePaymentZar: pickRevenueAmount(analytics, 'entrancePaymentZar', 'entrancePaymentNetZar', revenueMode),
      ticketedTableHostPaymentZar: pickRevenueAmount(
        analytics,
        'ticketedTableHostPaymentZar',
        'ticketedTableHostPaymentNetZar',
        revenueMode,
      ),
      ticketedTableJoinPaymentZar: pickRevenueAmount(
        analytics,
        'ticketedTableJoinPaymentZar',
        'ticketedTableJoinPaymentNetZar',
        revenueMode,
      ),
      ticketedTableMenuPaymentZar: pickRevenueAmount(
        analytics,
        'ticketedTableMenuPaymentZar',
        'ticketedTableMenuPaymentNetZar',
        revenueMode,
      ),
      hostedTablePaymentZar: pickRevenueAmount(analytics, 'hostedTablePaymentZar', 'hostedTablePaymentNetZar', revenueMode),
      dayBookingHostPaymentZar: pickRevenueAmount(analytics, 'dayBookingHostPaymentZar', 'dayBookingHostPaymentNetZar', revenueMode),
      dayBookingGuestPaymentZar: pickRevenueAmount(analytics, 'dayBookingGuestPaymentZar', 'dayBookingGuestPaymentNetZar', revenueMode),
      dayBookingMenuPaymentZar:
        revenueScope === 'day_bookings' ? dayBookingMenuPaymentZar : dayBookingMenuPaymentZar || menuPaymentZar,
      menuPaymentZar: revenueScope === 'day_bookings' ? menuPaymentZar || dayBookingMenuPaymentZar : menuPaymentZar || dayBookingMenuPaymentZar,
      dayBookingVenueJoinFeeVolumeZar: Number(analytics?.dayBookingVenueJoinFeeVolumeZar || 0),
      venueTablePaymentZar: pickRevenueAmount(analytics, 'venueTablePaymentZar', 'venueTablePaymentNetZar', revenueMode),
      refundedVenueShareZar: Number(analytics?.refundedVenueShareZar || 0),
      refundedGrossZar: Number(analytics?.refundedGrossZar || 0),
      successfulEventTypeCounts: analytics?.successfulEventTypeCounts || {},
      peakHour: analytics?.peakHour || 'N/A',
      avgRevenuePerEvent,
      avgRevenuePerTable,
      eventRevenueCount,
      tablesWithRevenueCount,
      dayBookingTierWithActivity,
      revenueByTier: Array.isArray(analytics?.revenueByTier) ? analytics.revenueByTier : [],
    };
  };

  const metrics = selectedVenue ? calculateMetrics() : null;

  const salesTrend = useMemo(() => {
    const days = periodDays;
    const daysChrono = Array.from({ length: days }, (_, i) => subDays(new Date(), days - 1 - i));
    const byDayGross = Object.fromEntries((analytics?.revenueByDay || []).map((d) => [d.date, Number(d.gross) || 0]));
    const byDayNet = Object.fromEntries((analytics?.revenueByDay || []).map((d) => [d.date, Number(d.net ?? d.gross) || 0]));
    return daysChrono.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const amount = revenueMode === 'net' ? Number(byDayNet[key] || 0) : Number(byDayGross[key] || 0);
      return {
        key,
        date: format(day, days <= 14 ? 'MMM dd' : 'd MMM'),
        sales: amount,
      };
    });
  }, [analytics?.revenueByDay, periodDays, revenueMode]);

  const successfulEventTypeChartData = useMemo(() => {
    const counts = metrics?.successfulEventTypeCounts || {};
    return Object.entries(counts)
      .filter(([, value]) => Number(value) > 0)
      .map(([name, value]) => ({ name, value: Number(value) }));
  }, [metrics?.successfulEventTypeCounts]);

  const revenueStreamChartData = useMemo(() => {
    if (!metrics) return [];
    if (revenueScope === 'day_bookings') {
      return [
        { name: 'Host fees', value: metrics.dayBookingHostPaymentZar },
        { name: 'Guest checkouts', value: metrics.dayBookingGuestPaymentZar },
        { name: 'Menu payments', value: metrics.dayBookingMenuPaymentZar },
        { name: 'Join fees (to venue)', value: metrics.dayBookingVenueJoinFeeVolumeZar },
      ].filter((d) => d.value > 0);
    }
    if (revenueScope === 'ticketed_events') {
      return [
        { name: 'Ticket revenue', value: metrics.ticketPaymentZar },
        { name: 'Ticketed table hosts', value: metrics.ticketedTableHostPaymentZar || 0 },
        { name: 'Ticketed table joins', value: metrics.ticketedTableJoinPaymentZar || 0 },
        { name: 'Ticketed table menu', value: metrics.ticketedTableMenuPaymentZar || 0 },
        { name: 'Menu payments', value: metrics.menuPaymentZar },
      ].filter((d) => d.value > 0);
    }
    return [
      { name: 'Ticket revenue', value: metrics.ticketPaymentZar },
      { name: 'Entrance fees', value: metrics.entrancePaymentZar || 0 },
      { name: 'Hosted table fees', value: metrics.hostedTablePaymentZar },
      { name: 'Ticketed table hosts', value: metrics.ticketedTableHostPaymentZar || 0 },
      { name: 'Ticketed table joins', value: metrics.ticketedTableJoinPaymentZar || 0 },
      { name: 'Ticketed table menu', value: metrics.ticketedTableMenuPaymentZar || 0 },
      { name: 'Day-booking hosts', value: metrics.dayBookingHostPaymentZar },
      { name: 'Table joins (guests)', value: metrics.venueTablePaymentZar },
      { name: 'Menu payments', value: metrics.menuPaymentZar },
    ].filter((d) => d.value > 0);
  }, [metrics, revenueScope]);

  const hasAnalyticsData =
    Boolean(analytics) &&
    !analyticsIsPlaceholder &&
    (Number(analytics?.grossRevenueZar || 0) > 0 ||
      Number(analytics?.ticketSalesCount || 0) > 0 ||
      salesTrend.some((d) => d.sales > 0) ||
      (revenueScope === 'day_bookings' &&
        (Number(analytics?.dayBookingHostPaymentZar || 0) > 0 ||
          Number(analytics?.dayBookingGuestPaymentZar || 0) > 0 ||
          Number(analytics?.dayBookingMenuPaymentZar || 0) > 0 ||
          Number(analytics?.dayBookingVenueJoinFeeVolumeZar || 0) > 0 ||
          Number(analytics?.menuPaymentZar || 0) > 0)));

  // Initial load / scope change: show skeletons. Background refetch: keep values visible.
  const chartsLoading = analyticsLoading || (analyticsFetching && analyticsIsPlaceholder);
  const eventPickerEnabled = revenueScope === 'per_event' || revenueScope === 'ticketed_events';
  const selectedEvent =
    selectedEventCache?.id === selectedEventId
      ? selectedEventCache
      : (initialEventsPage?.items || []).find((e) => e.id === selectedEventId) || selectedEventCache;

  useEffect(() => {
    if (!selectedEventId) return;
    const fromInitial = (initialEventsPage?.items || []).find((e) => e.id === selectedEventId);
    if (fromInitial) setSelectedEventCache(fromInitial);
  }, [selectedEventId, initialEventsPage]);

  return (
    <div className="min-h-screen pb-28 lg:pb-8" style={{ backgroundColor: 'var(--sec-bg)' }}>
      <PageBackHeader title="Analytics Dashboard" subtitle="Business insights and performance metrics" pageName="VenueAnalytics" />
      <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full sm:w-40 bg-[var(--sec-bg-elevated)] border-[var(--sec-border)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-white">
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="glass-card border-[var(--sec-border)]">
          <CardContent className="pt-6">
            {venueScope.inStaffSession && selectedVenueRecord ? (
              <div>
                <p className="text-xs text-gray-500 mb-1">Venue</p>
                <p className="text-white font-medium">{selectedVenueRecord.name}</p>
                <p className="text-xs text-gray-500 mt-1">Staff access</p>
              </div>
            ) : venues.length === 0 ? (
              <p className="text-sm text-gray-500">No venues linked to this account yet.</p>
            ) : venues.length === 1 && selectedVenueRecord ? (
              <div>
                <p className="text-xs text-gray-500 mb-1">Venue</p>
                <p className="text-white font-medium">{selectedVenueRecord.name}</p>
              </div>
            ) : (
              <Select value={selectedVenue} onValueChange={setSelectedVenue}>
                <SelectTrigger className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)]">
                  <SelectValue placeholder="Select a venue to view analytics" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-white">
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {selectedVenue && chartsLoading && !analytics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="glass-card border-[var(--sec-border)]">
                  <CardContent className="pt-6 space-y-3">
                    <Skeleton className="h-4 w-24 bg-[var(--sec-border)]" />
                    <Skeleton className="h-8 w-32 bg-[var(--sec-border)]" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="glass-card border-[var(--sec-border)]">
              <CardContent className="pt-6">
                <Skeleton className="h-64 w-full bg-[var(--sec-border)]" />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {metrics && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-card border-[var(--sec-border)]">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-gray-500 text-sm">Revenue Mode</p>
                  <Select value={revenueMode} onValueChange={setRevenueMode}>
                    <SelectTrigger className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-white">
                      <SelectItem value="gross">Gross Revenue</SelectItem>
                      <SelectItem value="net">Net revenue (venue share)</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="glass-card border-[var(--sec-border)]">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-gray-500 text-sm">Revenue Scope</p>
                  <Select value={revenueScope} onValueChange={setRevenueScope}>
                    <SelectTrigger className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-white">
                      <SelectItem value="all_events">All Events Combined</SelectItem>
                      <SelectItem value="per_event">Single Event</SelectItem>
                      <SelectItem value="ticketed_events">Ticketed events</SelectItem>
                      <SelectItem value="day_bookings">Day bookings only</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className="glass-card border-[var(--sec-border)]">
                <CardContent className="pt-6 space-y-2">
                  <p className="text-gray-500 text-sm">Event Selection</p>
                  <AnalyticsEventPicker
                    enabled={eventPickerEnabled}
                    venueScope={venueScope}
                    selectedVenue={selectedVenue}
                    selectedEventId={selectedEventId}
                    selectedEvent={selectedEvent}
                    onSelectEvent={handleSelectEvent}
                    ticketedOnly={revenueScope === 'ticketed_events'}
                  />
                  {revenueScope === 'ticketed_events' ? (
                    <p className="text-[11px] text-gray-500">
                      Optional: pick one ticketed event, or leave blank for all ticketed events.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-card border-[var(--sec-border)] border-l-2 border-l-[var(--sec-success)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Total Revenue</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-28 mt-1 bg-[var(--sec-border)]" />
                      ) : (
                      <p className="text-3xl font-bold text-white mt-1">
                        R{metrics.totalRevenue.toLocaleString()}
                      </p>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--sec-success)' }}>
                        {revenueScopeLabel(revenueScope)} — {revenueMode === 'net' ? 'Net' : 'Gross'} — Last {dateRange} days
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8" style={{ color: 'var(--sec-success)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[var(--sec-border)] border-l-2 border-l-[var(--sec-accent)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Ticket Sales</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-16 mt-1 bg-[var(--sec-border)]" />
                      ) : (
                      <p className="text-3xl font-bold text-white mt-1">{metrics.ticketSales}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">Tickets issued in period</p>
                    </div>
                    <Users className="w-8 h-8" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[var(--sec-border)] border-l-2 border-l-[var(--sec-warning)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Average Rating</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-16 mt-1 bg-[var(--sec-border)]" />
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

              <Card className="glass-card border-[var(--sec-border)] border-l-2 border-l-[var(--sec-accent)]">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm">Total Events</p>
                      {chartsLoading ? (
                        <Skeleton className="h-9 w-12 mt-1 bg-[var(--sec-border)]" />
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

            <div className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${revenueScope === 'day_bookings' ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
              {revenueScope === 'day_bookings' ? (
                <>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Day-booking slot host checkouts">
                        Host fees
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.dayBookingHostPaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Guest join checkouts (venue share)">
                        Guest checkouts
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.dayBookingGuestPaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Menu items guests choose and pay for">
                        Menu payments
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.dayBookingMenuPaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Join fees guests pay when joining an unhosted venue slot (venue revenue)">
                        Join fees (to venue)
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.dayBookingVenueJoinFeeVolumeZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm">Ticket revenue</p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.ticketPaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm">Entrance fees</p>
                      <p className="text-2xl font-bold text-white mt-1">R{(metrics.entrancePaymentZar || 0).toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="External listings and event-linked host fees">
                        Hosted table fees
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.hostedTablePaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm">Ticketed event — table hosts</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R{(metrics.ticketedTableHostPaymentZar || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm">Ticketed event — table joins</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R{(metrics.ticketedTableJoinPaymentZar || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm">Ticketed event — table menu</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        R{(metrics.ticketedTableMenuPaymentZar || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Day-booking slot host checkouts at your venue">
                        Day-booking hosts
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.dayBookingHostPaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Guest table join payments">
                        Table joins (guests)
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.venueTablePaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-[var(--sec-border)]">
                    <CardContent className="pt-6">
                      <p className="text-gray-500 text-sm" title="Menu items guests choose and pay for">
                        Menu payments
                      </p>
                      <p className="text-2xl font-bold text-white mt-1">R{metrics.menuPaymentZar.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                </>
              )}
              {metrics.refundedVenueShareZar > 0 ? (
                <Card className="glass-card border-[var(--sec-border)]">
                  <CardContent className="pt-6">
                    <p className="text-gray-500 text-sm">Refunded (venue share)</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">R{metrics.refundedVenueShareZar.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Excluded from revenue totals above</p>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <Card className="glass-card border-[var(--sec-border)]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
                  Revenue trend (last {periodDays} days) — {revenueScopeLabel(revenueScope)} — {revenueMode === 'net' ? 'Net' : 'Gross'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartsLoading ? (
                  <Skeleton className="h-48 sm:h-64 w-full bg-[var(--sec-border)]" />
                ) : !hasAnalyticsData ? (
                  <div className="py-12 text-center">
                    <TrendingUp className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    <p className="text-white font-medium">No revenue in this period</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {revenueScope === 'per_event'
                        ? 'Try All Events Combined, or pick another event with sales in this date range.'
                        : `Ticket sales and table payments in the last ${dateRange} days will appear here.`}
                    </p>
                  </div>
                ) : (
                  <ChartContainer
                    config={REVENUE_CHART_CONFIG}
                    className="h-52 sm:h-64 w-full aspect-auto"
                  >
                    <AreaChart
                      data={salesTrend}
                      margin={{
                        top: 8,
                        right: isMobile ? 4 : 8,
                        left: 0,
                        bottom: isMobile ? 12 : 4,
                      }}
                    >
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d4af37" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--sec-border)" vertical={false} />
                      <XAxis
                        dataKey="key"
                        tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 11 }}
                        tickLine={false}
                        axisLine={false}
                        interval={
                          isMobile
                            ? periodDays <= 7
                              ? 0
                              : Math.max(1, Math.ceil(periodDays / 6) - 1)
                            : periodDays <= 14
                              ? 0
                              : Math.floor(periodDays / 8)
                        }
                        minTickGap={isMobile ? 28 : 12}
                        angle={isMobile ? -35 : 0}
                        textAnchor={isMobile ? 'end' : 'middle'}
                        height={isMobile ? 52 : 30}
                        dy={isMobile ? 6 : 0}
                        tickFormatter={(value) => {
                          const day = new Date(`${value}T12:00:00`);
                          if (Number.isNaN(day.getTime())) return value;
                          if (isMobile) {
                            return periodDays <= 14 ? format(day, 'd/M') : format(day, 'd MMM');
                          }
                          return periodDays <= 14 ? format(day, 'MMM dd') : format(day, 'd MMM');
                        }}
                      />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: isMobile ? 10 : 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `R${Math.round(v / 1000)}k`}
                        width={isMobile ? 40 : 48}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(label) => {
                              const day = new Date(`${label}T12:00:00`);
                              if (Number.isNaN(day.getTime())) return label;
                              return format(day, 'MMM d, yyyy');
                            }}
                            formatter={(value) => (
                              <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                                {`R${Math.round(Number(value)).toLocaleString()}`}
                              </span>
                            )}
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="glass-card border-[var(--sec-border)] lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                    Event mix & revenue streams (last {dateRange} days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-gray-400 mb-3">Successful event types</p>
                      <p className="text-xs text-gray-500 mb-4">Events in this period that generated venue revenue</p>
                      {successfulEventTypeChartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center">No successful events in this period.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                          <ChartContainer
                            config={Object.fromEntries(
                              successfulEventTypeChartData.map((d, i) => [
                                d.name,
                                { label: d.name, color: EVENT_TYPE_COLORS[i % EVENT_TYPE_COLORS.length] },
                              ]),
                            )}
                            className="h-52 w-full min-h-[208px] aspect-auto mx-auto max-w-[200px]"
                          >
                            <PieChart>
                              <ChartTooltip
                                content={
                                  <ChartTooltipContent
                                    hideLabel
                                    formatter={(value) => String(Math.round(Number(value)))}
                                  />
                                }
                              />
                              <Pie
                                data={successfulEventTypeChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={38}
                                outerRadius={68}
                                paddingAngle={2}
                              >
                                {successfulEventTypeChartData.map((entry, index) => (
                                  <Cell key={entry.name} fill={EVENT_TYPE_COLORS[index % EVENT_TYPE_COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ChartContainer>
                          <div className="space-y-2">
                            {successfulEventTypeChartData.map((entry, index) => (
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
                    </div>

                    <div>
                      <p className="text-sm text-gray-400 mb-3">Revenue streams</p>
                      <p className="text-xs text-gray-500 mb-4">
                        {revenueMode === 'net' ? 'Net venue share' : 'Gross'} by payment type
                      </p>
                      {revenueStreamChartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center">No revenue streams in this period.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                          <ChartContainer
                            config={Object.fromEntries(
                              revenueStreamChartData.map((d, i) => [
                                d.name,
                                { label: d.name, color: REVENUE_STREAM_COLORS[i % REVENUE_STREAM_COLORS.length] },
                              ]),
                            )}
                            className="h-52 w-full min-h-[208px] aspect-auto mx-auto max-w-[200px]"
                          >
                            <PieChart>
                              <ChartTooltip
                                content={
                                  <ChartTooltipContent
                                    hideLabel
                                    formatter={(value) => `R${Math.round(Number(value)).toLocaleString()}`}
                                  />
                                }
                              />
                              <Pie
                                data={revenueStreamChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={38}
                                outerRadius={68}
                                paddingAngle={2}
                              >
                                {revenueStreamChartData.map((entry, index) => (
                                  <Cell key={entry.name} fill={REVENUE_STREAM_COLORS[index % REVENUE_STREAM_COLORS.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ChartContainer>
                          <div className="space-y-2">
                            {revenueStreamChartData.map((entry, index) => (
                              <div key={entry.name} className="flex items-center justify-between text-sm gap-2">
                                <span className="flex items-center gap-2 text-gray-400 min-w-0">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: REVENUE_STREAM_COLORS[index % REVENUE_STREAM_COLORS.length] }}
                                  />
                                  <span className="truncate">{entry.name}</span>
                                </span>
                                <span className="text-white font-semibold shrink-0">
                                  R{Math.round(entry.value).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-[var(--sec-border)]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Clock className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                    Performance Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 rounded-lg bg-[var(--sec-bg-elevated)]">
                    <p className="text-sm text-gray-400 mb-1">
                      {revenueScope === 'day_bookings'
                        ? 'Peak table booking time'
                        : revenueScope === 'ticketed_events'
                          ? 'Peak ticketed event time'
                          : 'Peak Event Time'}
                    </p>
                    <p className="text-xl font-bold text-white">{metrics.peakHour}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {metrics.peakHour === 'N/A'
                        ? revenueScope === 'day_bookings'
                          ? 'No host/join bookings with times in this period'
                          : 'No revenue-generating events with start times'
                        : revenueScope === 'day_bookings'
                          ? 'Most common host/join booking start time'
                          : 'Most common start time among successful events'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--sec-bg-elevated)]">
                    <p className="text-sm text-gray-400 mb-1">
                      {revenueScope === 'day_bookings'
                        ? 'Avg. Revenue per table'
                        : revenueScope === 'ticketed_events'
                          ? 'Avg. Revenue per ticketed event'
                          : 'Avg. Revenue per Event'}
                    </p>
                    <p className="text-xl font-bold text-white">
                      R{Math.round(
                        revenueScope === 'day_bookings'
                          ? metrics.avgRevenuePerTable
                          : metrics.avgRevenuePerEvent,
                      ).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {revenueScope === 'day_bookings'
                        ? metrics.dayBookingTierWithActivity > 0
                          ? `Mean of ${metrics.dayBookingTierWithActivity} tier average${metrics.dayBookingTierWithActivity === 1 ? '' : 's'} · ${metrics.tablesWithRevenueCount} table${metrics.tablesWithRevenueCount === 1 ? '' : 's'}`
                          : 'No booked tables with revenue in this period'
                        : revenueScope === 'per_event'
                          ? 'Selected event view'
                          : `${metrics.eventRevenueCount} event${metrics.eventRevenueCount === 1 ? '' : 's'} with revenue`}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--sec-bg-elevated)]">
                    <p className="text-sm text-gray-400 mb-1">
                      {revenueScope === 'day_bookings' ? 'Table join payments' : 'Table join payments (guests)'}
                    </p>
                    <p className="text-xl font-bold text-white">
                      R{Math.round(
                        revenueScope === 'day_bookings'
                          ? metrics.dayBookingGuestPaymentZar
                          : metrics.venueTablePaymentZar,
                      ).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Guest checkouts in the last {dateRange} days</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--sec-bg-elevated)]">
                    <p className="text-sm text-gray-400 mb-1">Day-booking host payments</p>
                    <p className="text-xl font-bold text-white">
                      R{Math.round(metrics.dayBookingHostPaymentZar).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {revenueScope === 'per_event'
                        ? 'Switch to all-venue or day-bookings scope to include day bookings'
                        : 'Host fees for day-booking slots at your venue'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {reviews.length > 0 && (
              <Card className="glass-card border-[var(--sec-border)]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Star className="w-5 h-5" style={{ color: 'var(--sec-warning)' }} />
                    Recent Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-4 rounded-lg bg-[var(--sec-bg-elevated)]">
                      <p className="text-sm text-gray-400">Atmosphere</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(reviews.reduce((sum, r) => sum + (r.atmosphere_rating || 0), 0) / reviews.length).toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-[var(--sec-bg-elevated)]">
                      <p className="text-sm text-gray-400">Service</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(reviews.reduce((sum, r) => sum + (r.service_rating || 0), 0) / reviews.length).toFixed(1)}
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-[var(--sec-bg-elevated)]">
                      <p className="text-sm text-gray-400">Value</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(reviews.reduce((sum, r) => sum + (r.value_rating || 0), 0) / reviews.length).toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {reviews.slice(0, 3).map((review) => (
                      <div key={review.id} className="p-3 rounded-lg bg-[var(--sec-bg-elevated)]">
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
