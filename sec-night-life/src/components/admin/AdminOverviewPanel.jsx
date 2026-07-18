import React, { useEffect, useState } from 'react';
import { Users, CreditCard, Building2, Shield, AlertTriangle, Gavel } from 'lucide-react';
import { apiGet } from '@/api/client';
import { toast } from 'sonner';
import AdminActionBar from './AdminActionBar';
import AdminStatGrid, { AdminStatCard } from './AdminStatGrid';

export default function AdminOverviewPanel({ onTabChange }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/api/admin/dashboard');
        setStats(data?.stats || {});
      } catch (err) {
        setStats({});
        toast.error(`Could not load dashboard stats${err?.message ? `: ${err.message}` : ''}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const s = stats || {};

  if (loading) {
    return <p className="text-sm text-[var(--sec-text-muted)]">Loading overview…</p>;
  }

  return (
    <div className="space-y-6">
      <AdminStatGrid>
        <AdminStatCard icon={Users} value={s.totalUsers ?? 0} label="Total Users" />
        <AdminStatCard
          icon={CreditCard}
          iconClassName="text-[var(--sec-success)]"
          value={`R${(s.totalGrossZar ?? s.totalPaymentAmount ?? 0).toLocaleString()}`}
          label={`Gross collected · ${s.totalPaymentCount ?? 0} payments`}
        />
        <AdminStatCard
          icon={CreditCard}
          borderClassName="border border-[rgba(212,175,55,0.25)]"
          valueClassName="text-[var(--sec-accent)]"
          value={`R${(s.totalSecRevenueZar ?? 0).toLocaleString()}`}
          label="SEC platform revenue"
        />
        <AdminStatCard
          icon={Building2}
          iconClassName="text-emerald-400"
          value={`R${Number(s.pendingTransfersZar ?? s.pendingTransfers ?? 0).toLocaleString()}`}
          label="Pending transfers"
        />
        <AdminStatCard
          icon={Shield}
          iconClassName="text-amber-500"
          value={s.pendingUserVerifications ?? 0}
          label="Legacy ID reviews"
        />
        <AdminStatCard
          icon={Building2}
          iconClassName="text-amber-500"
          value={s.pendingVenues ?? 0}
          label="Venue compliance"
        />
        <AdminStatCard
          icon={AlertTriangle}
          iconClassName="text-red-500"
          value={s.pendingReports ?? 0}
          label="Pending reports"
        />
        <AdminStatCard
          icon={Gavel}
          iconClassName="text-orange-400"
          value={(s.criticalReports ?? 0) + (s.highReports ?? 0)}
          label="High/Critical reports"
        />
      </AdminStatGrid>

      <AdminActionBar
        actions={[
          { id: 'payments', label: 'View all payments', onClick: () => onTabChange('payments') },
          { id: 'reports', label: 'Triage safety reports', onClick: () => onTabChange('reports') },
          { id: 'users', label: 'Review legacy ID submissions', onClick: () => onTabChange('users') },
          { id: 'venues', label: 'Review venue compliance', onClick: () => onTabChange('venues') },
          { id: 'announcements', label: 'Post home announcements', onClick: () => onTabChange('announcements') },
        ]}
      />
    </div>
  );
}
