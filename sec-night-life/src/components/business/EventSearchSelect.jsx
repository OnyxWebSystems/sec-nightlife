import React, { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { apiGet } from '@/api/client';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { format, parseISO, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function appendVenueQuery(params, venueScope) {
  if (!venueScope?.venueQuery) return params;
  const extra = new URLSearchParams(venueScope.venueQuery);
  extra.forEach((v, k) => params.set(k, v));
  return params;
}

export function formatEventOptionDate(event) {
  if (!event?.date) return 'Date TBC';
  try {
    const raw = event.date instanceof Date ? event.date.toISOString() : String(event.date);
    return format(parseISO(raw), 'EEE d MMM yyyy');
  } catch {
    return String(event.date);
  }
}

function isUpcomingEvent(event) {
  if (!event?.date) return false;
  const d = event.date instanceof Date ? event.date : new Date(event.date);
  if (Number.isNaN(d.getTime())) return false;
  return d >= startOfDay(new Date());
}

export default function EventSearchSelect({
  value = 'all',
  onValueChange,
  venueScope,
  triggerStyle,
  className,
  allLabel = 'All events',
  placeholder = 'Search events…',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cachedEvent, setCachedEvent] = useState(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const scopeKey = venueScope?.staffContextToken || venueScope?.venueId || venueScope?.venueQuery || '';

  useEffect(() => {
    if (value === 'all') setCachedEvent(null);
  }, [value, scopeKey]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const listQuery = useInfiniteQuery({
    queryKey: ['biz-event-options', scopeKey, debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        paginated: '1',
        skip: String(pageParam),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      appendVenueQuery(params, venueScope);
      return apiGet(`/api/business/event-options?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.hasMore) return undefined;
      return (lastPage.skip || 0) + (lastPage.items?.length || 0);
    },
    enabled: open && Boolean(venueScope?.venueQuery),
    initialPageParam: 0,
  });

  const selectedId = value && value !== 'all' ? value : null;
  const selectedQuery = useQuery({
    queryKey: ['biz-event-option', scopeKey, selectedId],
    queryFn: async () => {
      const params = new URLSearchParams({
        paginated: '1',
        limit: '1',
        id: selectedId,
      });
      appendVenueQuery(params, venueScope);
      return apiGet(`/api/business/event-options?${params.toString()}`);
    },
    enabled: Boolean(selectedId && venueScope?.venueQuery && cachedEvent?.id !== selectedId),
  });

  const selectedEvent = useMemo(() => {
    if (!selectedId) return null;
    if (cachedEvent?.id === selectedId) return cachedEvent;
    return selectedQuery.data?.items?.[0] || null;
  }, [selectedId, cachedEvent, selectedQuery.data]);

  const items = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const page of listQuery.data?.pages || []) {
      for (const event of page.items || []) {
        if (!event?.id || seen.has(event.id)) continue;
        seen.add(event.id);
        out.push(event);
      }
    }
    if (selectedEvent && !seen.has(selectedEvent.id) && !debouncedSearch.trim()) {
      out.unshift(selectedEvent);
    }
    return out;
  }, [listQuery.data?.pages, selectedEvent, debouncedSearch]);

  const upcoming = items.filter(isUpcomingEvent);
  const past = items.filter((event) => !isUpcomingEvent(event));
  const searching = Boolean(debouncedSearch.trim());
  const total = listQuery.data?.pages?.[0]?.total;

  const triggerLabel = selectedEvent
    ? selectedEvent.title?.trim() || formatEventOptionDate(selectedEvent)
    : allLabel;

  const pick = (id, event = null) => {
    onValueChange?.(id);
    setCachedEvent(id === 'all' ? null : event);
    setOpen(false);
  };

  const renderEventItem = (event) => (
    <CommandItem
      key={event.id}
      value={event.id}
      onSelect={() => pick(event.id, event)}
      className="items-start text-[var(--sec-text-primary)] data-[selected=true]:bg-[var(--sec-border)] data-[selected=true]:text-[var(--sec-text-primary)]"
    >
      <Check
        className={cn('mt-0.5 mr-2 h-4 w-4 shrink-0', selectedId === event.id ? 'opacity-100' : 'opacity-0')}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug line-clamp-2">{event.title?.trim() || 'Untitled event'}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
          {formatEventOptionDate(event)}
          {isUpcomingEvent(event) ? ' · Upcoming' : ' · Past'}
        </p>
      </div>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Filter by event"
          className={cn(
            'w-full sm:w-[240px] h-10 rounded-xl justify-between font-normal px-3',
            'hover:bg-[var(--sec-bg-elevated)] hover:text-[var(--sec-text-primary)]',
            className,
          )}
          style={triggerStyle}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(calc(100vw-32px),360px)] p-0 bg-[var(--sec-bg-elevated)] border-[var(--sec-border)] text-[var(--sec-text-primary)]"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
            className="text-[var(--sec-text-primary)]"
          />
          <CommandList className="max-h-[320px]">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading events…
              </div>
            ) : (
              <>
                <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => pick('all')}
                      className="text-[var(--sec-text-primary)] data-[selected=true]:bg-[var(--sec-border)] data-[selected=true]:text-[var(--sec-text-primary)]"
                    >
                      <Check className={cn('mr-2 h-4 w-4', !selectedId ? 'opacity-100' : 'opacity-0')} />
                      {allLabel}
                    </CommandItem>
                  </CommandGroup>
                {searching && !items.length ? (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                    No events match “{debouncedSearch.trim()}”.
                  </p>
                ) : null}
                {!searching && !items.length ? (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                    No events yet.
                  </p>
                ) : null}
                {searching && items.length ? (
                  <CommandGroup heading={total != null ? `${total} match${total === 1 ? '' : 'es'}` : 'Results'}>
                    {items.map(renderEventItem)}
                  </CommandGroup>
                ) : null}
                {!searching && upcoming.length ? (
                  <CommandGroup heading="Upcoming">{upcoming.map(renderEventItem)}</CommandGroup>
                ) : null}
                {!searching && past.length ? (
                  <CommandGroup heading="Past">{past.map(renderEventItem)}</CommandGroup>
                ) : null}
                {listQuery.hasNextPage ? (
                  <div className="p-2 border-t" style={{ borderColor: 'var(--sec-border)' }}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={listQuery.isFetchingNextPage}
                      onClick={() => listQuery.fetchNextPage()}
                    >
                      {listQuery.isFetchingNextPage ? (
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
