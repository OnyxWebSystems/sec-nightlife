import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, Shield, ChevronRight } from 'lucide-react';
import { enterPartygoerMode } from '@/lib/activeViewMode';

function AccessCard({ onClick, icon: Icon, title, description, variant = 'neutral' }) {
  const isGold = variant === 'gold';
  const isCompliance = variant === 'compliance';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-xl border transition-all w-full text-left"
      style={{
        textDecoration: 'none',
        color: 'var(--sec-text-primary)',
        background: isGold
          ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, var(--sec-bg-card) 60%)'
          : isCompliance
            ? 'var(--sec-accent-muted)'
            : 'var(--sec-bg-elevated)',
        borderColor: isGold
          ? 'var(--sec-accent-border)'
          : isCompliance
            ? 'var(--sec-accent-border)'
            : 'var(--sec-border)',
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: isGold || isCompliance ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
          border: '1px solid var(--sec-border)',
        }}
      >
        <Icon size={22} style={{ color: isGold || isCompliance ? 'var(--sec-accent)' : 'var(--sec-text-secondary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
          {description}
        </p>
      </div>
      <ChevronRight size={18} className="flex-shrink-0" style={{ color: 'var(--sec-text-muted)' }} />
    </button>
  );
}

/**
 * Profile section for admin, staff, and compliance access (party-goer mode).
 */
export default function RoleAccessPanel({
  canAdminDashboard = false,
  hasStaffAssignments = false,
  canReviewCompliance = false,
}) {
  const navigate = useNavigate();
  const items = [];
  if (canAdminDashboard) {
    items.push({
      key: 'admin',
      onClick: () => {
        enterPartygoerMode();
        navigate(createPageUrl('AdminDashboard'));
      },
      icon: LayoutDashboard,
      title: 'Admin Dashboard',
      description: 'Platform administration, users, and moderation tools.',
      variant: 'neutral',
    });
  }
  if (hasStaffAssignments) {
    items.push({
      key: 'staff',
      onClick: () => navigate(createPageUrl('StaffDashboard')),
      icon: Shield,
      title: 'Staff Dashboard',
      description: 'Venues you help manage and your assigned permissions.',
      variant: 'gold',
    });
  }
  if (canReviewCompliance) {
    items.push({
      key: 'compliance',
      onClick: () => {
        enterPartygoerMode();
        navigate(`${createPageUrl('AdminDashboard')}?tab=compliance-documents`);
      },
      icon: Shield,
      title: 'Compliance Review',
      description: 'Review venue compliance documents and submissions.',
      variant: 'compliance',
    });
  }

  if (!items.length) return null;

  return (
    <div className="pt-4 border-t" style={{ borderColor: 'var(--sec-border)' }}>
      <h3 className="font-semibold mb-3 text-sm" style={{ color: 'var(--sec-text-muted)' }}>
        Your access
      </h3>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <AccessCard key={item.key} {...item} />
        ))}
      </div>
    </div>
  );
}
