import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Copy, CheckCircle, XCircle, Wallet } from 'lucide-react';
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

function formatZar(n) {
  return `R ${Number(n || 0).toFixed(2)}`;
}

function StatusBadge({ status }) {
  const map = {
    PENDING: 'sec-badge-gold',
    APPROVED: 'sec-badge-success',
    REJECTED: 'sec-badge-muted',
    PAID_BY_VENUE: 'sec-badge-success',
  };
  return (
    <span className={`sec-badge ${map[status] || 'sec-badge-muted'}`}>
      {status === 'PAID_BY_VENUE' ? 'Paid' : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

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

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg bg-[var(--sec-bg-card)] border-[var(--sec-border)]">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>Refund request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <StatusBadge status={selected.status} />
                  <span className="text-[var(--sec-text-muted)]">
                    {format(parseISO(selected.createdAt), 'd MMM yyyy HH:mm')}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-[var(--sec-text-muted)]">Guest</p>
                  <p className="font-medium">{selected.user?.fullName || selected.user?.username}</p>
                </div>

                <div>
                  <p className="text-xs text-[var(--sec-text-muted)]">Reason</p>
                  <p className="whitespace-pre-wrap">{selected.userReason}</p>
                </div>

                <div className="rounded-lg border border-[var(--sec-border)] p-3 space-y-2">
                  <div className="flex justify-between">
                    <span>Gross paid</span>
                    <span>{formatZar(selected.grossAmountZar)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-[var(--sec-accent)]">
                    <span>You refund (85%)</span>
                    <span>{formatZar(selected.venueRefundDueZar)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--sec-text-muted)]">
                    <span>SEC keeps (15%)</span>
                    <span>{formatZar(selected.platformFeeKeptZar)}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[var(--sec-text-muted)] mb-1">Guest Sec Wallet ID</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] font-mono text-sm">
                      {selected.userWalletCode}
                    </code>
                    <Button type="button" variant="outline" size="icon" onClick={() => copyWallet(selected.userWalletCode)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                    Look up this ID in Sec Wallet and pay the guest from your bank off-app.
                  </p>
                </div>

                {selected.status === 'PENDING' ? (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 sec-btn-primary"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(selected.id)}
                    >
                      {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setRejectOpen(true);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                ) : null}

                {selected.status === 'APPROVED' ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={markPaidMutation.isPending}
                    onClick={() => markPaidMutation.mutate(selected.id)}
                  >
                    Mark paid off-app
                  </Button>
                ) : null}

                {selected.status === 'REJECTED' && selected.rejectTemplateKeys ? (
                  <div className="text-xs text-[var(--sec-text-muted)]">
                    Decline reason: {(Array.isArray(selected.rejectTemplateKeys) ? selected.rejectTemplateKeys : []).join(', ')}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md bg-[var(--sec-bg-card)]">
          <DialogHeader>
            <DialogTitle>Decline refund</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--sec-text-muted)] mb-3">
            Select a reason — guests only see approved template messages (no free text).
          </p>
          <Select value={rejectKey} onValueChange={setRejectKey}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REJECT_TEMPLATES.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="w-full mt-4"
            variant="destructive"
            disabled={rejectMutation.isPending || !selected}
            onClick={() =>
              rejectMutation.mutate({ id: selected.id, template_keys: [rejectKey] })
            }
          >
            {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm decline'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
