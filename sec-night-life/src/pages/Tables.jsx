import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
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

import HostedTableCard from '@/components/home/HostedTableCard';

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

  const { data: hostedResp, isLoading } = useQuery({
    queryKey: ['tables-hosted-available'],
    queryFn: () => apiGet('/api/host/tables/available?limit=100&page=1'),
  });
  const { data: venueResp } = useQuery({
    queryKey: ['tables-venue-available'],
    queryFn: () => apiGet('/api/venue-tables/available?limit=100&page=1'),
  });
  const hostedTables = hostedResp?.items || [];
  const venueTables = venueResp?.items || [];
  const tables = [...hostedTables, ...venueTables.map((v) => ({
    id: `venue-${v.id}`,
    rawId: v.id,
    source: 'venue',
    tableName: v.tableName,
    displayLocation: v.venue?.city || v.venue?.name || 'Venue',
    event: v.event ? { id: v.event.id, title: v.event.title, date: v.event.date, city: v.venue?.city || null } : null,
    host: { username: v.venue?.name || 'Venue' },
    spotsRemaining: v.spotsRemaining || 0,
    hasJoiningFee: true,
    joiningFee: null,
    minimumSpend: v.minimumSpend || 0,
    tableType: 'EXTERNAL_VENUE',
    status: v.status,
  }))];

  const cities = [...new Set(tables.map((t) => t?.event?.city || t?.displayLocation).filter(Boolean))];

  const filteredTables = tables.filter(table => {
    const event = table.event || null;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (table.tableName ?? '').toLowerCase().includes(q) ||
      (table.host?.username ?? '').toLowerCase().includes(q) ||
      (event?.title ?? '').toLowerCase().includes(q) ||
      (table.displayLocation ?? '').toLowerCase().includes(q);
    
    // City filter
    const cityName = event?.city || table.displayLocation;
    if (filters.city !== 'all' && cityName !== filters.city) {
      return false;
    }

    // Min spend filter
    if (filters.minSpend !== 'all') {
      const minSpend = table.minimumSpend || 0;
      if (filters.minSpend === 'low' && minSpend >= 5000) return false;
      if (filters.minSpend === 'medium' && (minSpend < 5000 || minSpend >= 10000)) return false;
      if (filters.minSpend === 'high' && minSpend < 10000) return false;
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      if (!event?.date) return false;
      const eventDate = parseISO(event.date);
      if (filters.dateRange === 'tonight' && !isToday(eventDate)) return false;
      if (filters.dateRange === 'weekend' && !isThisWeekend(eventDate)) return false;
    }

    // Venue type filter
    if (filters.venueType !== 'all' && table.source === 'venue') return false;

    // Quick filter
    if (selectedFilter === 'tonight') {
      const d = event?.date || table.eventDate;
      if (!d) return false;
      return matchesSearch && isToday(parseISO(d));
    }
    if (selectedFilter === 'low_spend') {
      return matchesSearch && (table.minimumSpend || 0) < 5000;
    }
    
    return matchesSearch;
  });

  // Sort tables
  const sortedTables = [...filteredTables].sort((a, b) => {
    const eventA = a.event;
    const eventB = b.event;

    if (sortBy === 'date') {
      if (!eventA?.date) return 1;
      if (!eventB?.date) return -1;
      return new Date(eventA.date) - new Date(eventB.date);
    }
    
    if (sortBy === 'popularity') {
      return (b.spotsRemaining || 0) - (a.spotsRemaining || 0);
    }
    
    if (sortBy === 'spend') {
      return (a.minimumSpend || 0) - (b.minimumSpend || 0);
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
            <Link to={`${createPageUrl('HostDashboard')}?create=table`} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', textDecoration: 'none' }}>
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
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 4 }}>{tables.reduce((acc, t) => acc + Math.max(0, (t.guestQuantity || 0) - (t.spotsRemaining || 0)), 0)}</p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>People Joining</p>
            </div>
            <div>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-silver)', marginBottom: 4 }}>{tables.filter(t => (t.spotsRemaining || 0) > 0).length}</p>
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
              {table.source === 'venue' ? (
                <div className="sec-card" style={{ padding: 14, borderRadius: 14 }}>
                  <div style={{ fontWeight: 600 }}>{table.tableName}</div>
                  <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                    {table.displayLocation} · {table.spotsRemaining} spots left
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Min spend: R{Number(table.minimumSpend || 0).toFixed(0)}
                  </div>
                  <Link to={createPageUrl(`TableDetails?id=${table.rawId}&source=venue`)} className="sec-btn sec-btn-secondary" style={{ marginTop: 12, display: 'inline-flex', textDecoration: 'none' }}>
                    View & Join
                  </Link>
                </div>
              ) : (
                <HostedTableCard table={table} onJoin={() => window.location.assign(createPageUrl(`TableDetails?id=${table.id}&source=hosted`))} />
              )}
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
            <Link to={`${createPageUrl('HostDashboard')}?create=table`} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', textDecoration: 'none' }}>
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