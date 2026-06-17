import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Shield, ChevronRight, Building2 } from 'lucide-react';

/**
 * Shown on Home when the user has venue staff assignments (party-goer mode).
 */
export default function StaffAccessBanner({ assignments = [] }) {
  if (!assignments.length) return null;

  const count = assignments.length;
  const preview = assignments.slice(0, 2);
  const extra = count - preview.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ marginBottom: 20 }}
    >
      <Link
        to={createPageUrl('StaffDashboard')}
        style={{
          display: 'block',
          textDecoration: 'none',
          borderRadius: 16,
          border: '1px solid var(--sec-accent-border)',
          background:
            'linear-gradient(135deg, rgba(212, 175, 55, 0.12) 0%, var(--sec-bg-card) 55%, var(--sec-bg-elevated) 100%)',
          padding: '14px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--sec-accent-muted)',
              border: '1px solid var(--sec-accent-border)',
              color: 'var(--sec-accent-bright)',
            }}
          >
            <Shield size={22} strokeWidth={1.75} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--sec-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Staff dashboard
            </p>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 12,
                color: 'var(--sec-text-muted)',
                lineHeight: 1.45,
              }}
            >
              {count === 1
                ? `Help manage ${preview[0]?.venueName || 'a venue'}`
                : `You can help manage ${count} venues`}
            </p>
            {preview.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {preview.map((row) => (
                  <span
                    key={row.venueId || row.accessToken || row.venueName}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid var(--sec-border)',
                      color: 'var(--sec-text-secondary)',
                      maxWidth: '100%',
                    }}
                  >
                    <Building2 size={10} style={{ flexShrink: 0 }} />
                    <span className="truncate">{row.venueName || 'Venue'}</span>
                  </span>
                ))}
                {extra > 0 ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: 999,
                      color: 'var(--sec-accent)',
                    }}
                  >
                    +{extra} more
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <ChevronRight
            size={20}
            strokeWidth={1.75}
            style={{ flexShrink: 0, color: 'var(--sec-accent)' }}
          />
        </div>
      </Link>
    </motion.div>
  );
}
