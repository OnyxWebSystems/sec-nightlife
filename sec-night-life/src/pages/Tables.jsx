import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseISO, isToday, isThisWeek, isSaturday, isSunday } from 'date-fns';
import { motion } from 'framer-motion';

import TrendingTableCard from '@/components/home/TrendingTableCard';

const isThisWeekend = (date) => {
  return isThisWeek(date) && (isSaturday(date) || isSunday(date));
};

export default function Tables() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    city: 'all',
    minSpend: 'all',
    dateRange: 'all',
    venueType: 'all'
  });

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => dataService.Table.filter({ status: 'open' }, '-created_date', 100),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['table-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
  });

  // Include non-approved venues so tables tied to pending compliance still resolve venue names.
  const { data: venues = [] } = useQuery({
    queryKey: ['venues-for-tables'],
    queryFn: () => dataService.Venue.filter({}, '-rating', 100),
  });

  const eventsMap = events.reduce((acc, event) => {
    acc[event.id] = event;
    return acc;
  }, {});

  const venuesMap = venues.reduce((acc, venue) => {
    acc[venue.id] = venue;
    return acc;
  }, {});

  // Get unique cities
  const cities = [...new Set(events.map(e => e.city).filter(Boolean))];

  const filteredTables = tables.filter(table => {
    const event = eventsMap[table.event_id];
    const venue = venuesMap[table.venue_id];
    
    // Search filter
    const matchesSearch = 
      table.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event?.title?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // City filter
    if (filters.city !== 'all' && event?.city !== filters.city) {
      return false;
    }

    // Min spend filter
    if (filters.minSpend !== 'all') {
      const minSpend = table.min_spend || 0;
      if (filters.minSpend === 'low' && minSpend >= 5000) return false;
      if (filters.minSpend === 'medium' && (minSpend < 5000 || minSpend >= 10000)) return false;
      if (filters.minSpend === 'high' && minSpend < 10000) return false;
    }

    // Date range filter
    if (filters.dateRange !== 'all' && event?.date) {
      const eventDate = parseISO(event.date);
      if (filters.dateRange === 'tonight' && !isToday(eventDate)) return false;
      if (filters.dateRange === 'weekend' && !isThisWeekend(eventDate)) return false;
    }

    // Venue type filter
    if (filters.venueType !== 'all' && venue?.venue_type !== filters.venueType) {
      return false;
    }

    // Quick filter
    if (selectedFilter === 'tonight' && event?.date) {
      return matchesSearch && isToday(parseISO(event.date));
    }
    if (selectedFilter === 'low_spend') {
      return matchesSearch && (table.min_spend || 0) < 5000;
    }
    
    return matchesSearch;
  });

  // Sort tables
  const sortedTables = [...filteredTables].sort((a, b) => {
    const eventA = eventsMap[a.event_id];
    const eventB = eventsMap[b.event_id];

    if (sortBy === 'date') {
      if (!eventA?.date) return 1;
      if (!eventB?.date) return -1;
      return new Date(eventA.date) - new Date(eventB.date);
    }
    
    if (sortBy === 'popularity') {
      return (b.current_guests || 0) - (a.current_guests || 0);
    }
    
    if (sortBy === 'spend') {
      return (a.min_spend || 0) - (b.min_spend || 0);
    }
    
    return 0;
  });

  const quickFilters = [
    { value: 'all', label: 'All Tables' },
    { value: 'tonight', label: 'Tonight' },
    { value: 'low_spend', label: 'Under R5k' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Tables</h1>
            <Link to={createPageUrl('CreateTable')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', textDecoration: 'none' }}>
              <Plus size={18} strokeWidth={1.5} />
              Create
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={18} strokeWidth={1.5} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
              <input className="sec-input" placeholder="Search tables..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: 44, height: 48 }} />
            </div>
            <button onClick={() => setShowFilters(true)} className="sec-nav-icon" style={{ width: 48, height: 48 }}>
              <SlidersHorizontal size={20} strokeWidth={1.5} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Sort by:</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger style={{ width: 130, height: 36, backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }} className="sec-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="popularity">Popularity</SelectItem>
                <SelectItem value="spend">Min Spend</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div style={{ padding: '0 var(--space-6) var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }} className="scrollbar-hide">
            {quickFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setSelectedFilter(filter.value)}
                style={{
                  padding: '10px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                  backgroundColor: selectedFilter === filter.value ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
                  color: selectedFilter === filter.value ? 'var(--sec-bg-base)' : 'var(--sec-text-secondary)',
                  border: `1px solid ${selectedFilter === filter.value ? 'var(--sec-accent)' : 'var(--sec-border)'}`
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ padding: 'var(--space-6)' }}>
        <div className="sec-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-accent)', marginBottom: 4 }}>{tables.length}</p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Open Tables</p>
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 4 }}>{tables.reduce((acc, t) => acc + (t.current_guests || 1), 0)}</p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>People Joining</p>
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-silver)', marginBottom: 4 }}>{tables.filter(t => (t.max_guests || 10) - (t.current_guests || 1) > 0).length}</p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Spots Available</p>
            </div>
          </div>
        </div>

        {/* Tables Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedTables.map((table, index) => (
            <motion.div
              key={table.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <TrendingTableCard table={table} />
            </motion.div>
          ))}
        </div>

        {sortedTables.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Users size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No open tables</h3>
            <p style={{ color: 'var(--sec-text-muted)', marginBottom: 24 }}>Be the first to create one!</p>
            <Link to={createPageUrl('CreateTable')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', textDecoration: 'none' }}>
              <Plus size={18} strokeWidth={1.5} />
              Create a Table
            </Link>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="sec-card" style={{ padding: 16 }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[#262629]" />
                  <div>
                    <div className="h-4 w-24 rounded bg-[#262629] mb-2" />
                    <div className="h-3 w-16 rounded bg-[#262629]" />
                  </div>
                </div>
                <div className="h-4 w-full rounded bg-[#262629] mb-3" />
                <div className="h-1.5 w-full rounded-full bg-[#262629]" />
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)', maxWidth: 400 }} className="sec-card">
          <DialogHeader>
            <DialogTitle>Filter Tables</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="sec-label">City</Label>
              <Select
                value={filters.city}
                onValueChange={(value) => setFilters({ ...filters, city: value })}
              >
                <SelectTrigger style={{ backgroundColor: 'var(--sec-bg-base)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="sec-label">Minimum Spend</Label>
              <Select
                value={filters.minSpend}
                onValueChange={(value) => setFilters({ ...filters, minSpend: value })}
              >
                <SelectTrigger style={{ backgroundColor: 'var(--sec-bg-base)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Amount</SelectItem>
                  <SelectItem value="low">Under R5k</SelectItem>
                  <SelectItem value="medium">R5k - R10k</SelectItem>
                  <SelectItem value="high">Over R10k</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="sec-label">Date Range</Label>
              <Select
                value={filters.dateRange}
                onValueChange={(value) => setFilters({ ...filters, dateRange: value })}
              >
                <SelectTrigger style={{ backgroundColor: 'var(--sec-bg-base)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="tonight">Tonight</SelectItem>
                  <SelectItem value="weekend">This Weekend</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="sec-label">Venue Type</Label>
              <Select
                value={filters.venueType}
                onValueChange={(value) => setFilters({ ...filters, venueType: value })}
              >
                <SelectTrigger style={{ backgroundColor: 'var(--sec-bg-base)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="nightclub">Nightclub</SelectItem>
                  <SelectItem value="lounge">Lounge</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="rooftop">Rooftop</SelectItem>
                  <SelectItem value="beach_club">Beach Club</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setFilters({
                  city: 'all',
                  minSpend: 'all',
                  dateRange: 'all',
                  venueType: 'all'
                });
              }}
              className="flex-1 border-[#262629]"
            >
              Reset
            </Button>
            <Button
              onClick={() => setShowFilters(false)}
              className="sec-btn sec-btn-primary flex-1"
            >
              Apply Filters
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Label({ children, className }) {
  return <label className={className}>{children}</label>;
}