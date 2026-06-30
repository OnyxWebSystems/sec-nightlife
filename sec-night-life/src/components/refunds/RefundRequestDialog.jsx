import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

function formatZar(n) {
  return `R ${Number(n || 0).toFixed(2)}`;
}

export default function RefundRequestDialog({ open, onOpenChange, paymentReference, label, onSuccess }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [walletCode, setWalletCode] = useState('');

  const { data: walletData } = useQuery({
    queryKey: ['sec-wallet-me'],
    queryFn: () => apiGet('/api/wallet/me'),
    enabled: open,
  });

  const { data: eligibleData, isLoading: eligibleLoading } = useQuery({
    queryKey: ['refund-eligible-payments'],
    queryFn: () => apiGet('/api/refunds/eligible-payments'),
    enabled: open && !paymentReference,
  });

  const [selectedRef, setSelectedRef] = useState(paymentReference || '');

  React.useEffect(() => {
    if (walletData?.walletCode && !walletCode) {
      setWalletCode(walletData.walletCode);
    }
  }, [walletData?.walletCode, walletCode]);

  React.useEffect(() => {
    if (paymentReference) setSelectedRef(paymentReference);
  }, [paymentReference]);

  const selectedPayment = (eligibleData?.items || []).find(
    (p) => p.reference === selectedRef || p.reference === paymentReference,
  );

  const submitMutation = useMutation({
    mutationFn: (body) => apiPost('/api/refunds/request', body),
    onSuccess: () => {
      toast.success('Refund request submitted');
      queryClient.invalidateQueries({ queryKey: ['refund-my'] });
      queryClient.invalidateQueries({ queryKey: ['refund-eligible-payments'] });
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      setReason('');
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e) => toast.error(e?.data?.error || e?.message || 'Could not submit request'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const ref = selectedRef || paymentReference;
    if (!ref) {
      toast.error('Select a payment');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Please describe your reason (at least 10 characters)');
      return;
    }
    if (!walletCode.trim()) {
      toast.error('Enter your Sec Wallet ID');
      return;
    }
    submitMutation.mutate({
      payment_reference: ref,
      reason: reason.trim(),
      wallet_code: walletCode.trim(),
    });
  };

  const due = selectedPayment?.venueRefundDueZar;
  const kept = selectedPayment?.platformFeeKeptZar;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[var(--sec-bg-card)] border-[var(--sec-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--sec-text-primary)]">
            <RotateCcw className="w-5 h-5 text-[var(--sec-accent)]" />
            Request refund
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-[var(--sec-text-muted)]">
            Refunds are handled by the venue, not SEC. If approved, the venue pays you{' '}
            <strong>85%</strong> of the refundable amount to your Sec Wallet off-app (SEC keeps 15%).
            Joining fees are not refundable. Menu-only refunds apply when you paid for venue items.
            Your QR/ticket access for refunded items will be revoked.
          </p>

          {!paymentReference && (
            <div>
              <label className="text-xs text-[var(--sec-text-muted)] block mb-1">Payment</label>
              {eligibleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <select
                  className="w-full rounded-lg border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)] px-3 py-2 text-sm"
                  value={selectedRef}
                  onChange={(e) => setSelectedRef(e.target.value)}
                >
                  <option value="">Select a payment…</option>
                  {(eligibleData?.items || []).map((p) => (
                    <option key={p.reference} value={p.reference}>
                      {p.label || p.reference} — {formatZar(p.amount)} ({format(parseISO(p.createdAt), 'd MMM yyyy')})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {label && paymentReference ? (
            <p className="text-sm font-medium text-[var(--sec-text-primary)]">{label}</p>
          ) : null}

          {(due != null || kept != null) && selectedRef ? (
            <div className="rounded-lg border border-[var(--sec-border)] p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--sec-text-muted)]">Venue refund (if approved)</span>
                <span className="font-semibold text-[var(--sec-accent)]">{formatZar(due)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--sec-text-muted)]">SEC platform fee (non-refundable)</span>
                <span>{formatZar(kept)}</span>
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-xs text-[var(--sec-text-muted)] block mb-1">Reason for refund</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you are requesting a refund…"
              rows={4}
              maxLength={2000}
              className="bg-[var(--sec-bg-elevated)] border-[var(--sec-border)]"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--sec-text-muted)] block mb-1">Your Sec Wallet ID</label>
            <Input
              value={walletCode}
              onChange={(e) => setWalletCode(e.target.value.toUpperCase())}
              placeholder="SEC-U-XXXXXXXX"
              className="font-mono bg-[var(--sec-bg-elevated)] border-[var(--sec-border)]"
            />
            <p className="text-xs text-[var(--sec-text-muted)] mt-1">
              The venue uses this to look up your bank details and pay you off-app.
            </p>
          </div>

          <Button
            type="submit"
            disabled={submitMutation.isPending || (!selectedRef && !paymentReference)}
            className="w-full sec-btn-primary"
          >
            {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Submit request
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
