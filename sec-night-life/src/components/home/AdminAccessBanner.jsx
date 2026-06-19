import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { LayoutDashboard, ChevronRight } from 'lucide-react';
import { enterPartygoerMode } from '@/lib/activeViewMode';

/**
 * Shown on Home when the user can access the admin dashboard (party-goer mode).
 */
export default function AdminAccessBanner() {
  const navigate = useNavigate();

  const openAdmin = () => {
    enterPartygoerMode();
    navigate(createPageUrl('AdminDashboard'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ marginBottom: 20 }}
    >
      <button
        type="button"
        onClick={openAdmin}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          textDecoration: 'none',
          borderRadius: 16,
          border: '1px solid var(--sec-border)',
          background: 'linear-gradient(135deg, var(--sec-bg-elevated) 0%, var(--sec-bg-card) 100%)',
          padding: '14px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          color: 'inherit',
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
              background: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
              color: 'var(--sec-text-secondary)',
            }}
          >
            <LayoutDashboard size={22} strokeWidth={1.75} />
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
              Admin dashboard
            </p>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 12,
                color: 'var(--sec-text-muted)',
                lineHeight: 1.45,
              }}
            >
              Platform administration and moderation tools
            </p>
          </div>
          <ChevronRight
            size={20}
            strokeWidth={1.75}
            style={{ flexShrink: 0, color: 'var(--sec-text-muted)' }}
          />
        </div>
      </button>
    </motion.div>
  );
}
