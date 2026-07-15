import React, { useEffect, useState } from 'react';
import { Check, X, Loader2, ExternalLink } from 'lucide-react';
import { apiGet, apiPatch } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { withPdfInlineParams } from './adminUtils';
import AdminEmptyState from './AdminEmptyState';

export default function AdminUsersPanel() {
  const [userVerifications, setUserVerifications] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/api/admin/verification/users?status=pending&limit=20');
        setUserVerifications(data?.profiles || []);
      } catch (err) {
        setUserVerifications([]);
        toast.error(`Could not load Legacy ID reviews${err?.message ? `: ${err.message}` : ''}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUserVerification = async (userId, status, note) => {
    setActionLoading(userId);
    try {
      await apiPatch(`/api/admin/verification/users/${userId}`, { status, note });
      setUserVerifications((prev) => prev.filter((p) => p.userId !== userId));
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not update verification');
    }
    setActionLoading(null);
  };

  const handleViewUserIdDocument = async (userId) => {
    try {
      const { viewUrl } = await apiGet(`/api/admin/verification/users/${userId}/id-document`);
      if (viewUrl) window.open(withPdfInlineParams(viewUrl), '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not open document');
    }
  };

  if (loading) {
    return <AdminEmptyState message="Loading legacy ID submissions…" />;
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Legacy ID submissions</h3>
      {userVerifications.length === 0 ? (
        <AdminEmptyState message="No pending verifications" />
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
              <button
                type="button"
                onClick={() => handleViewUserIdDocument(p.userId)}
                className="text-sm text-[var(--sec-accent)] flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 min-h-[44px]"
              >
                View ID document <ExternalLink size={14} />
              </button>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-[var(--sec-success)] text-black hover:opacity-90 min-h-[44px]"
                disabled={actionLoading === p.userId}
                onClick={() => handleUserVerification(p.userId, 'verified')}
              >
                {actionLoading === p.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/50 text-red-500 min-h-[44px]"
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
  );
}
