import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2, ExternalLink } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { withPdfInlineParams } from './adminUtils';
import AdminEmptyState from './AdminEmptyState';

export default function AdminUsersPanel() {
  const [userVerifications, setUserVerifications] = useState([]);
  const [suspendedUsers, setSuspendedUsers] = useState([]);
  const [unsuspendNotes, setUnsuspendNotes] = useState({});
  const [actionLoading, setActionLoading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSuspended, setLoadingSuspended] = useState(true);

  const loadSuspended = useCallback(async () => {
    setLoadingSuspended(true);
    try {
      const data = await apiGet('/api/admin/users?suspended=true&limit=100');
      setSuspendedUsers(data?.users || []);
    } catch (err) {
      setSuspendedUsers([]);
      toast.error(`Could not load suspended users${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setLoadingSuspended(false);
    }
  }, []);

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
    void loadSuspended();
  }, [loadSuspended]);

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

  const handleUnsuspend = async (userId) => {
    setActionLoading(`unsuspend-${userId}`);
    try {
      const note = (unsuspendNotes[userId] || '').trim();
      await apiPost(`/api/admin/users/${userId}/unsuspend`, note ? { note } : {});
      toast.success('User unsuspended');
      setUnsuspendNotes((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      await loadSuspended();
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not unsuspend user');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Suspended accounts</h2>
            <p className="text-xs text-[var(--sec-text-muted)] mt-1">
              {loadingSuspended
                ? 'Loading…'
                : `${suspendedUsers.length} suspended ${
                    suspendedUsers.length === 1 ? 'account' : 'accounts'
                  }`}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingSuspended}
            onClick={() => void loadSuspended()}
          >
            Refresh
          </Button>
        </div>
        <p className="text-xs text-[var(--sec-text-muted)]">
          These users cannot sign in until you unsuspend them. Unsuspend restores access and notifies
          the user; an optional note is included in their notification.
        </p>
        {loadingSuspended ? (
          <AdminEmptyState message="Loading suspended users…" />
        ) : suspendedUsers.length === 0 ? (
          <AdminEmptyState message="No suspended users right now." />
        ) : (
          suspendedUsers.map((u) => (
            <div
              key={u.id}
              className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3"
            >
              <div>
                <p className="font-medium">{u.fullName || u.email || 'Unknown'}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">{u.email}</p>
                <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                  Suspended{' '}
                  {u.suspendedAt ? new Date(u.suspendedAt).toLocaleString() : '—'}
                  {u.role ? ` · ${u.role}` : ''}
                </p>
                {u.suspendedReason ? (
                  <p className="text-sm mt-2 whitespace-pre-wrap">{u.suspendedReason}</p>
                ) : null}
              </div>
              <textarea
                value={unsuspendNotes[u.id] || ''}
                onChange={(e) =>
                  setUnsuspendNotes((prev) => ({ ...prev, [u.id]: e.target.value.slice(0, 500) }))
                }
                rows={2}
                className="w-full p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
                placeholder="Optional note to the user when restoring access"
              />
              <Button
                size="sm"
                disabled={!!actionLoading}
                onClick={() => void handleUnsuspend(u.id)}
              >
                {actionLoading === `unsuspend-${u.id}` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Unsuspend
              </Button>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Legacy ID submissions</h3>
        {loading ? (
          <AdminEmptyState message="Loading legacy ID submissions…" />
        ) : userVerifications.length === 0 ? (
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
      </section>
    </div>
  );
}
