import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Wallet } from 'lucide-react';
import {
  VenueRefundRequestDialog,
  VenueRefundDeclineDialog,
  StatusBadge,
  formatZar,
} from '@/components/refunds/VenueRefundRequestDialog';
import PageBackHeader from '@/components/layout/PageBackHeader';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import { format, parseISO } from 'date-fns';

const REJECT_TEMPLATES = [
  { key: 'refund_outside_policy', label: 'Outside refund policy' },
  { key: 'refund_event_proceeded', label: 'Event proceeded as scheduled' },
  { key: 'refund_no_show', label: 'No-show / late arrival' },
  { key: 'refund_insufficient_proof', label: 'Insufficient proof provided' },
  { key: 'refund_already_used_qr', label: 'QR already used for entry' },
  { key: 'refund_partial_service_delivered', label: 'Partial service was delivered' },
];

export default function BusinessRefundRequests() {
  const venueScope = useBusinessVenueScope();
  const scopeKey = venueScope.scopeKey;
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [selected, setSelected] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectKey, setRejectKey] = useState(REJECT_TEMPLATES[0].key);

  const { data, isLoading } = useQuery({
    queryKey: ['biz-refund-requests', scopeKey, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams(venueScope.venueQuery || '');
      if (statusFilter) params.set('status', statusFilter);
      return apiGet(`/api/refunds/venue?${params.toString()}`);
    },
    enabled: !!venueScope.venueQuery,
  });

  const items = data?.items || [];
  const pendingCount = data?.pendingCount ?? 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['biz-refund-requests'] });
    queryClient.invalidateQueries({ queryKey: ['venue-analytics'] });
    queryClient.invalidateQueries({ queryKey: ['biz-ticket-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['biz-event-table-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['biz-venue-table-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['biz-dashboard-booking-stats'] });
    queryClient.invalidateQueries({ queryKey: ['biz-dashboard-monthly-stats'] });
    queryClient.invalidateQueries({ queryKey: ['host-tables'] });
    queryClient.invalidateQueries({ queryKey: ['host-activity'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id) => apiPost(`/api/refunds/venue/${id}/approve`, {}),
    onSuccess: () => {
      toast.success('Refund approved — pay the guest via Sec Wallet lookup');
      setSelected(null);
      invalidateAll();
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || 'Could not approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, template_keys }) => apiPost(`/api/refunds/venue/${id}/reject`, { template_keys }),
    onSuccess: () => {
      toast.success('Refund declined');
      setRejectOpen(false);
      setSelected(null);
      invalidateAll();
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || 'Could not decline'),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id) => apiPost(`/api/refunds/venue/${id}/mark-paid`, {}),
    onSuccess: () => {
      toast.success('Marked as paid off-app');
      invalidateAll();
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || 'Could not update'),
  });

  const copyWallet = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Wallet ID copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div className="sec-page-shell" style={{ paddingBottom: 48 }}>
      <PageBackHeader title="Refund requests" backTo={createPageUrl('BusinessDashboard')} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <VenueSwitcher />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] bg-[var(--sec-bg-card)] border-[var(--sec-border)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending ({pendingCount})</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="PAID_BY_VENUE">Paid</SelectItem>
            <SelectItem value="REJECTED">Declined</SelectItem>
          </SelectContent>
        </Select>
        <Link
          to={createPageUrl('BusinessDashboard')}
          className="text-sm text-[var(--sec-accent)] flex items-center gap-1 ml-auto"
        >
          <Wallet className="w-4 h-4" />
          Sec Wallet lookup
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--sec-accent)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="sec-card p-8 text-center text-[var(--sec-text-muted)]">
          <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No {statusFilter.toLowerCase()} refund requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="sec-card w-full text-left p-4 hover:border-[var(--sec-accent)]/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--sec-text-primary)]">
                    {item.user?.fullName || item.user?.username || 'Guest'}
                  </p>
                  <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
                    {item.refundType.replace('_', ' ')} · {format(parseISO(item.createdAt), 'd MMM yyyy HH:mm')}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-sm text-[var(--sec-text-muted)] mt-2 line-clamp-2">{item.userReason}</p>
              <p className="text-sm font-medium text-[var(--sec-accent)] mt-2">
                Refund due: {formatZar(item.venueRefundDueZar)}
              </p>
            </button>
          ))}
        </div>
      )}

      <VenueRefundRequestDialog
        selected={selected}
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        onCopyWallet={copyWallet}
        onApprove={(id) => approveMutation.mutate(id)}
        onDecline={() => setRejectOpen(true)}
        onMarkPaid={(id) => markPaidMutation.mutate(id)}
        approvePending={approveMutation.isPending}
        markPaidPending={markPaidMutation.isPending}
      />

      <VenueRefundDeclineDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        rejectKey={rejectKey}
        onRejectKeyChange={setRejectKey}
        rejectTemplates={REJECT_TEMPLATES}
        confirmPending={rejectMutation.isPending}
        disabled={!selected}
        onConfirm={() =>
          rejectMutation.mutate({ id: selected.id, template_keys: [rejectKey] })
        }
      />
    </div>
  );
}
