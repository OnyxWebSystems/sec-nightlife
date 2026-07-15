import React, { useEffect, useState } from 'react';
import { Check, X, Loader2, ExternalLink } from 'lucide-react';
import { apiGet, apiPatch } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AdminEmptyState from './AdminEmptyState';

export default function AdminVenuesPanel() {
  const [venueVerifications, setVenueVerifications] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/api/admin/verification/venues?status=pending&limit=20');
        setVenueVerifications(data?.venues || []);
      } catch (err) {
        setVenueVerifications([]);
        toast.error(`Could not load venue compliance queue${err?.message ? `: ${err.message}` : ''}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleVenueCompliance = async (venueId, status, note) => {
    setActionLoading(venueId);
    try {
      await apiPatch(`/api/admin/venues/${venueId}/compliance`, { status, note });
      setVenueVerifications((prev) => prev.filter((v) => v.id !== venueId));
    } catch {}
    setActionLoading(null);
  };

  if (loading) {
    return <AdminEmptyState message="Loading venue compliance queue…" />;
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Pending venue compliance</h3>
      {venueVerifications.length === 0 ? (
        <AdminEmptyState message="No pending venues" />
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
                className="text-sm text-[var(--sec-accent)] flex items-center gap-1 min-h-[44px]"
              >
                View compliance doc <ExternalLink size={14} />
              </a>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-[var(--sec-success)] text-black hover:opacity-90 min-h-[44px]"
                disabled={actionLoading === v.id}
                onClick={() => handleVenueCompliance(v.id, 'approved')}
              >
                {actionLoading === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/50 text-red-500 min-h-[44px]"
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
  );
}
