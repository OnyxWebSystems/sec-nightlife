import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Users, Calendar, MapPin, Briefcase } from 'lucide-react';

const actions = [
  { label: 'Tables',  page: 'Tables',  icon: Users,    accent: false },
  { label: 'Events',  page: 'Events',  icon: Calendar, accent: false },
  { label: 'Map',     page: 'Map',     icon: MapPin,   accent: false },
  { label: 'Jobs',    page: 'Jobs',    icon: Briefcase, accent: true },
];

export default function QuickActions() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <motion.div
            key={action.page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Link
              to={createPageUrl(action.page)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center', textDecoration: 'none', gap: 0,
              }}
            >
              <div
                style={{
                  width: 60, height: 60,
                  borderRadius: 'var(--radius-xl)',
                  backgroundColor: action.accent ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                  border: `1px solid ${action.accent ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 9,
                  color: action.accent ? 'var(--sec-accent-bright)' : 'var(--sec-text-secondary)',
                  transition: 'border-color var(--transition-fast), background-color var(--transition-fast), transform var(--transition-fast)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = action.accent ? 'var(--sec-accent)' : 'var(--sec-border-hover)';
                  e.currentTarget.style.backgroundColor = 'var(--sec-bg-hover)';
                  e.currentTarget.style.transform = 'scale(1.04)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = action.accent ? 'var(--sec-accent-border)' : 'var(--sec-border)';
                  e.currentTarget.style.backgroundColor = action.accent ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                color: action.accent ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
              }}>
                {action.label}
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
