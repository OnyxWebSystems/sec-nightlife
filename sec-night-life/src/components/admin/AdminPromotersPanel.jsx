import React, { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AdminEmptyState from './AdminEmptyState';

export default function AdminPromotersPanel() {
  const [promoterCandidates, setPromoterCandidates] = useState([]);
  const [promoterLoading, setPromoterLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const reloadPromoters = async () => {
    const res = await apiGet('/api/admin/promoters/candidates');
    setPromoterCandidates(res?.data || []);
  };

  useEffect(() => {
    (async () => {
      setPromoterLoading(true);
      try {
        await reloadPromoters();
      } catch {
        setPromoterCandidates([]);
      } finally {
        setPromoterLoading(false);
      }
    })();
  }, []);

  const handlePromoterVerify = async (userId) => {
    setActionLoading(`promoter-verify-${userId}`);
    try {
      await apiPatch(`/api/admin/promoters/${userId}/verify`, {});
      await reloadPromoters();
      toast.success('Promoter verified');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to verify promoter');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoterRevoke = async (userId) => {
    const reason = window.prompt('Reason for revoking promoter badge:');
    if (!reason) return;
    setActionLoading(`promoter-revoke-${userId}`);
    try {
      await apiPatch(`/api/admin/promoters/${userId}/revoke`, { reason });
      await reloadPromoters();
      toast.success('Promoter badge revoked');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to revoke promoter');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoterVisibility = async (userId, hidden) => {
    const reason = hidden ? (window.prompt('Reason for hiding from leaderboard:') || null) : null;
    setActionLoading(`promoter-visibility-${userId}`);
    try {
      await apiPatch(`/api/admin/promoters/${userId}/leaderboard-visibility`, { hidden, reason });
      await reloadPromoters();
      toast.success(hidden ? 'Promoter hidden from leaderboard' : 'Promoter restored to leaderboard');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to update visibility');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Promoter verification candidates</h3>
      {promoterLoading ? (
        <AdminEmptyState message="Loading promoter candidates..." />
      ) : promoterCandidates.length === 0 ? (
        <AdminEmptyState message="No candidates found." />
      ) : (
        promoterCandidates.map((p) => (
          <div key={p.promoterId} className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium">{p.username || p.promoterId}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">ID: {p.promoterId}</p>
              </div>
              <div className="text-xs px-2 py-1 rounded-full border border-[#3a3a3e]">
                {p.eligibility?.isVerifiedPromoter ? 'Verified' : 'Not verified'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--sec-text-muted)]">
              <div>Accepted jobs: {p.acceptedJobs}</div>
              <div>Completed jobs: {p.completedJobs}</div>
              <div>Ratings: {p.ratingCount}</div>
              <div>Unique raters: {p.uniqueRaters}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!p.eligibility?.isVerifiedPromoter ? (
                <Button size="sm" disabled={!!actionLoading} onClick={() => handlePromoterVerify(p.promoterId)}>
                  Approve badge
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => handlePromoterRevoke(p.promoterId)}>
                  Revoke badge
                </Button>
              )}
              {!p.eligibility?.hiddenByModeration ? (
                <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => handlePromoterVisibility(p.promoterId, true)}>
                  Hide leaderboard
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => handlePromoterVisibility(p.promoterId, false)}>
                  Unhide leaderboard
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
