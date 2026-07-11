import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Store } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiGet } from '@/api/client';
import { createPageUrl } from '@/utils';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { VENDOR_CATEGORIES, vendorCategoryLabel } from '@/lib/vendorCategories';

export default function Vendors() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCity, setSelectedCity] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', selectedCategory, selectedCity],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '48' });
      if (selectedCategory && selectedCategory !== 'all') params.set('category', selectedCategory);
      if (selectedCity) params.set('city', selectedCity);
      return apiGet(`/api/vendors?${params.toString()}`);
    },
  });

  const vendors = useMemo(() => {
    const list = data?.vendors || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        vendorCategoryLabel(v.category).toLowerCase().includes(q)
    );
  }, [data?.vendors, searchQuery]);

  const cities = useMemo(() => {
    const set = new Set((data?.vendors || []).map((v) => v.city).filter(Boolean));
    return [...set].sort();
  }, [data?.vendors]);

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <PageBackHeader title="Vendors" pageName="Vendors" />

      <div className="px-4 lg:px-8 pt-4 max-w-5xl mx-auto">
        <p style={{ color: 'var(--sec-text-muted)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.45 }}>
          Find food stalls, equipment rentals, DJs, and more — then connect with the owner.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            height: 46,
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--sec-bg-elevated)',
            border: '1px solid var(--sec-border)',
            marginBottom: 14,
          }}
        >
          <Search size={18} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search services…"
            style={{
              flex: 1,
              height: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--sec-text-primary)',
              fontSize: 16,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
          <FilterChip
            active={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            label="All"
          />
          {VENDOR_CATEGORIES.map((c) => (
            <FilterChip
              key={c.value}
              active={selectedCategory === c.value}
              onClick={() => setSelectedCategory(c.value)}
              label={c.label}
            />
          ))}
        </div>

        {cities.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 8 }}>
            <FilterChip active={!selectedCity} onClick={() => setSelectedCity('')} label="Any city" />
            {cities.map((city) => (
              <FilterChip
                key={city}
                active={selectedCity === city}
                onClick={() => setSelectedCity(city)}
                label={city}
              />
            ))}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="sec-spinner" />
          </div>
        ) : vendors.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--sec-text-muted)',
            }}
          >
            <Store size={36} strokeWidth={1.25} style={{ margin: '0 auto 12px', opacity: 0.7 }} />
            <p style={{ margin: 0, fontSize: 15 }}>No vendor listings yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>
              List your services in Settings → My vendor business.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            {vendors.map((vendor, i) => (
              <motion.div
                key={vendor.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
              >
                <Link
                  to={`${createPageUrl('VendorDetail')}?id=${encodeURIComponent(vendor.id)}`}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div
                    style={{
                      borderRadius: 'var(--radius-xl)',
                      overflow: 'hidden',
                      backgroundColor: 'var(--sec-bg-card)',
                      border: '1px solid var(--sec-border)',
                    }}
                  >
                    <div style={{ aspectRatio: '4/3', backgroundColor: 'var(--sec-bg-elevated)', position: 'relative' }}>
                      {vendor.cover_url ? (
                        <img
                          src={vendor.cover_url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--sec-text-muted)',
                          }}
                        >
                          <Store size={28} strokeWidth={1.25} />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '10px 12px 12px' }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          fontWeight: 650,
                          color: 'var(--sec-text-primary)',
                          lineHeight: 1.25,
                        }}
                      >
                        {vendor.name}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--sec-accent)', fontWeight: 560 }}>
                        {vendorCategoryLabel(vendor.category)}
                      </p>
                      {vendor.city ? (
                        <p
                          style={{
                            margin: '6px 0 0',
                            fontSize: 11,
                            color: 'var(--sec-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <MapPin size={11} /> {vendor.city}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '7px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
        backgroundColor: active ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
        color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-secondary)',
        fontSize: 12,
        fontWeight: 560,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
