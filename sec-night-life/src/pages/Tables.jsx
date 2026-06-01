import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';
import TableOfferingCard from '@/components/home/TableOfferingCard';

export default function Tables() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['home-table-offerings', 'browse'],
    queryFn: () => apiGet('/api/home/table-offerings?limit=60'),
    staleTime: 45_000,
  });

  const offerings = (data?.items || []).filter((o) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (o.title || '').toLowerCase().includes(q) ||
      (o.subtitle || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 100 }}>
      <header style={{ padding: '20px 20px 12px', maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Tables</h1>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
          Browse by event or host — one card per venue or table host.
        </p>
        <div className="relative mt-4">
          <Search
            size={16}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }}
          />
          <input
            type="search"
            placeholder="Search events, venues, hosts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-3 rounded-xl border text-sm"
            style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
        {isLoading ? (
          <p style={{ textAlign: 'center', color: 'var(--sec-text-muted)', padding: 40 }}>Loading…</p>
        ) : offerings.length === 0 ? (
          <div className="sec-card" style={{ textAlign: 'center', padding: 48 }}>
            <Users size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ color: 'var(--sec-text-muted)' }}>No open tables match your search.</p>
            <Link to={createPageUrl('HostDashboard')} className="sec-btn sec-btn-primary mt-4 inline-flex">
              Host a table
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {offerings.map((offering, i) => (
              <div
                key={offering.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="sec-card overflow-hidden" style={{ borderColor: offering.boosted ? 'rgba(212,175,55,0.4)' : undefined }}>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 text-left"
                    onClick={() => setExpandedId(expandedId === offering.id ? null : offering.id)}
                  >
                    <div>
                      <p style={{ fontWeight: 600 }}>{offering.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{offering.subtitle}</p>
                    </div>
                    {expandedId === offering.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {expandedId === offering.id ? (
                    <div style={{ padding: '0 12px 12px' }}>
                      <TableOfferingCard offering={offering} wide />
                    </div>
                  ) : (
                    <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(offering.tiers || offering.tables || []).slice(0, 4).map((t) => (
                        <span
                          key={t.tableId || t.id}
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: 'var(--sec-bg-hover)',
                          }}
                        >
                          {t.label || t.tableName}
                        </span>
                      ))}
                      <span style={{ fontSize: 11, color: 'var(--sec-accent)' }}>
                        {offering.type !== 'venue_day' && offering.totalSpots > 0
                          ? `${offering.totalSpots} spots · tap to open`
                          : 'tap to open'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Link
        to={`${createPageUrl('HostDashboard')}?create=table`}
        style={{
          position: 'fixed',
          bottom: 88,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--sec-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-card)',
        }}
        aria-label="Host a table"
      >
        <Plus size={22} color="#000" />
      </Link>
    </div>
  );
}
