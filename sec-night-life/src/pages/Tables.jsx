import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Plus, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import TableOfferingCard from '@/components/home/TableOfferingCard';

export default function Tables() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['home-table-offerings', 'browse'],
    queryFn: () => apiGet('/api/home/table-offerings?limit=60'),
    staleTime: 45_000,
  });

  const offerings = (data?.items || []).filter((o) => {
    const q = searchQuery.trim().toLowerCase();
    if (filter === 'vip' && !String(o.subtitle || '').toLowerCase().includes('vip')) return false;
    if (!q) return true;
    return (
      (o.title || '').toLowerCase().includes(q) ||
      (o.subtitle || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q) ||
      (o.hostName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0A0B', paddingBottom: 100 }}>
      <header
        style={{
          padding: '20px 20px 12px',
          maxWidth: 900,
          margin: '0 auto',
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'linear-gradient(180deg, #0A0A0B 85%, transparent)',
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' }}>Tables</h1>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
          Curated venue tables and community hosts — find your spot tonight.
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
            style={{
              backgroundColor: '#121214',
              borderColor: 'rgba(212,175,55,0.15)',
              color: 'var(--sec-text-primary)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            ['all', 'All'],
            ['vip', 'VIP'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 999,
                border: filter === key ? '1px solid rgba(212,175,55,0.5)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === key ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: filter === key ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
        {isLoading ? (
          <p style={{ textAlign: 'center', color: 'var(--sec-text-muted)', padding: 40 }}>Loading tables…</p>
        ) : offerings.length === 0 ? (
          <div
            className="sec-card"
            style={{
              textAlign: 'center',
              padding: 48,
              border: '1px solid rgba(212,175,55,0.12)',
              background: 'linear-gradient(180deg, #141416, #101012)',
            }}
          >
            <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.35, color: 'var(--sec-accent)' }} />
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 15 }}>No open tables match your search.</p>
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 12, marginTop: 8 }}>Try a different filter or host your own.</p>
            <Link
              to={createPageUrl('HostDashboard')}
              className="sec-btn sec-btn-primary mt-5 inline-flex"
              style={{ background: 'linear-gradient(135deg, #c9a227, #d4af37)', color: '#000' }}
            >
              Host a table
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {offerings.map((offering, i) => (
              <motion.div
                key={offering.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
              >
                <div
                  className="overflow-hidden"
                  style={{
                    borderRadius: 16,
                    background: 'linear-gradient(180deg, #141416 0%, #101012 100%)',
                    border: offering.boosted
                      ? '1px solid rgba(212,175,55,0.45)'
                      : '1px solid rgba(255,255,255,0.06)',
                    boxShadow: offering.boosted ? '0 8px 32px rgba(212,175,55,0.08)' : undefined,
                  }}
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-4 text-left"
                    onClick={() => setExpandedId(expandedId === offering.id ? null : offering.id)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{offering.title}</p>
                        {offering.boosted && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--sec-accent)' }}>
                            <Sparkles size={12} /> Promoted
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>{offering.subtitle}</p>
                      {offering.totalSpots > 0 && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 8,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'rgba(212,175,55,0.1)',
                            color: 'var(--sec-accent)',
                          }}
                        >
                          {offering.totalSpots} spots left
                        </span>
                      )}
                    </div>
                    {expandedId === offering.id ? <ChevronUp size={18} color="var(--sec-accent)" /> : <ChevronDown size={18} />}
                  </button>
                  <AnimatePresence initial={false}>
                    {expandedId === offering.id ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{ padding: '0 12px 14px' }}>
                          <TableOfferingCard offering={offering} wide />
                        </div>
                      </motion.div>
                    ) : (
                      <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(offering.tiers || offering.tables || []).slice(0, 4).map((t) => (
                          <span
                            key={t.tableId || t.id}
                            style={{
                              fontSize: 11,
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.06)',
                              color: 'var(--sec-text-secondary)',
                            }}
                          >
                            {t.label || t.tableName}
                          </span>
                        ))}
                        <span style={{ fontSize: 11, color: 'var(--sec-accent)', fontWeight: 600 }}>Tap to expand</span>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
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
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c9a227, #d4af37)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(212,175,55,0.25)',
        }}
        aria-label="Host a table"
      >
        <Plus size={22} color="#000" />
      </Link>
    </div>
  );
}
