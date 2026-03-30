import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet, apiPatch } from '@/api/client';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Shield,
  Building2,
  ChevronRight,
  Check,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [userVerifications, setUserVerifications] = useState([]);
  const [venueVerifications, setVenueVerifications] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
        if (u?.role !== 'ADMIN' && u?.role !== 'admin') {
          navigate(createPageUrl('Home'));
          return;
        }
        const [dashboardRes, paymentsRes, usersRes, venuesRes] = await Promise.all([
          apiGet('/api/admin/dashboard'),
          apiGet('/api/admin/payments?limit=20'),
          apiGet('/api/admin/verification/users?status=pending&limit=20'),
          apiGet('/api/admin/verification/venues?status=pending&limit=20'),
        ]);
        setStats(dashboardRes?.stats || {});
        setPayments(paymentsRes?.payments || []);
        setUserVerifications(usersRes?.profiles || []);
        setVenueVerifications(venuesRes?.venues || []);
      } catch (e) {
        if (e?.status === 403) navigate(createPageUrl('Home'));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleUserVerification = async (userId, status, note) => {
    setActionLoading(userId);
    try {
      await apiPatch(`/api/admin/verification/users/${userId}`, { status, note });
      setUserVerifications((prev) => prev.filter((p) => p.userId !== userId));
    } catch {}
    setActionLoading(null);
  };

  const handleVenueCompliance = async (venueId, status, note) => {
    setActionLoading(venueId);
    try {
      await apiPatch(`/api/admin/venues/${venueId}/compliance`, { status, note });
      setVenueVerifications((prev) => prev.filter((v) => v.id !== venueId));
    } catch {}
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--sec-accent)' }} />
      </div>
    );
  }

  if (!user || (user.role !== 'ADMIN' && user.role !== 'admin')) {
    return null;
  }

  const s = stats || {};

  return (
    <div className="min-h-screen pb-24" style={{ maxWidth: 480, margin: '0 auto' }}>
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/95 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <LayoutDashboard size={22} style={{ color: 'var(--sec-accent)' }} />
            Admin Dashboard
          </h1>
          <p className="text-sm text-[var(--sec-text-muted)] mt-1">Payments, users & verification</p>
        </div>
        <div className="flex border-b border-[#262629]">
          {['overview', 'payments', 'users', 'venues'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3 text-sm font-medium capitalize"
              style={{
                color: tab === t ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                borderBottom: tab === t ? '2px solid var(--sec-accent)' : '2px solid transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-6">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Users size={20} className="text-[var(--sec-accent)] mb-2" />
                <p className="text-2xl font-bold">{s.totalUsers ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">Total Users</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <CreditCard size={20} className="text-[var(--sec-success)] mb-2" />
                <p className="text-2xl font-bold">R{(s.totalPaymentAmount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">{s.totalPaymentCount ?? 0} payments</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Shield size={20} className="text-amber-500 mb-2" />
                <p className="text-2xl font-bold">{s.pendingUserVerifications ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">ID verifications</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Building2 size={20} className="text-amber-500 mb-2" />
                <p className="text-2xl font-bold">{s.pendingVenues ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">Venue compliance</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
              <h3 className="font-semibold mb-2">Quick actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setTab('payments')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>View all payments</span>
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setTab('users')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>Review ID verifications</span>
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setTab('venues')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>Review venue compliance</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'payments' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Recent payments</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No payments yet</p>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-[#141416] border border-[#262629] flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">R{p.amount?.toLocaleString()} · {p.type}</p>
                    <p className="text-xs text-[var(--sec-text-muted)]">{p.email} · {p.status}</p>
                  </div>
                  <span className="text-xs text-[var(--sec-text-muted)]">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Pending ID verifications</h3>
            {userVerifications.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No pending verifications</p>
            ) : (
              userVerifications.map((p) => (
                <div
                  key={p.userId}
                  className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{p.user?.fullName || p.user?.email || 'Unknown'}</p>
                      <p className="text-xs text-[var(--sec-text-muted)]">{p.user?.email}</p>
                    </div>
                  </div>
                  {p.idDocumentUrl && (
                    <a
                      href={p.idDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--sec-accent)] flex items-center gap-1"
                    >
                      View ID document <ExternalLink size={14} />
                    </a>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[var(--sec-success)] text-black hover:opacity-90"
                      disabled={actionLoading === p.userId}
                      onClick={() => handleUserVerification(p.userId, 'approved')}
                    >
                      {actionLoading === p.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-500"
                      disabled={actionLoading === p.userId}
                      onClick={() => handleUserVerification(p.userId, 'rejected', 'Document invalid')}
                    >
                      <X size={16} /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'venues' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Pending venue compliance</h3>
            {venueVerifications.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No pending venues</p>
            ) : (
              venueVerifications.map((v) => (
                <div
                  key={v.id}
                  className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3"
                >
                  <div>
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-[var(--sec-text-muted)]">{v.owner?.email} · {v.city}</p>
                  </div>
                  {v.complianceDocumentUrl && (
                    <a
                      href={v.complianceDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--sec-accent)] flex items-center gap-1"
                    >
                      View compliance doc <ExternalLink size={14} />
                    </a>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[var(--sec-success)] text-black hover:opacity-90"
                      disabled={actionLoading === v.id}
                      onClick={() => handleVenueCompliance(v.id, 'approved')}
                    >
                      {actionLoading === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-500"
                      disabled={actionLoading === v.id}
                      onClick={() => handleVenueCompliance(v.id, 'rejected', 'Documents incomplete')}
                    >
                      <X size={16} /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
