import React from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, Copy, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SecLogo from '@/components/ui/SecLogo';

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

function LuxuryDialogShell({ children, className = 'max-w-lg' }) {
  return (
    <DialogContent
      className={`${className} relative overflow-x-hidden overflow-y-auto max-h-[min(92vh,820px)] border-[var(--sec-accent-border)] p-0 gap-0 shadow-2xl`}
      style={{
        background: 'linear-gradient(160deg, rgba(192,192,192,0.14) 0%, #141418 38%, #0f1011 100%)',
      }}
    >
      <img
        src="/Logo/sec-email-logo-transparent.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -top-6 right-2 w-40 h-40 opacity-[0.1] select-none"
        onError={(e) => {
          e.currentTarget.src = '/sec-logo.png';
        }}
      />
      <div className="relative z-10 p-5 sm:p-6 space-y-4">{children}</div>
    </DialogContent>
  );
}

function FieldLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sec-accent-bright)]/80 mb-1.5">
      {children}
    </p>
  );
}

export function VenueRefundRequestDialog({
  selected,
  open,
  onOpenChange,
  onCopyWallet,
  onApprove,
  onDecline,
  onMarkPaid,
  approvePending,
  markPaidPending,
}) {
  if (!selected) return null;

  const guestName = selected.user?.fullName || selected.user?.username || 'Guest';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <LuxuryDialogShell>
        <DialogHeader className="space-y-3 p-0">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-3.5 min-w-0">
              <SecLogo size={44} variant="icon" asset="transparent" />
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                Refund request
              </DialogTitle>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <StatusBadge status={selected.status} />
            <span className="text-xs text-[var(--sec-text-muted)]">
              {format(parseISO(selected.createdAt), 'd MMM yyyy HH:mm')}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm pb-1">
          <div className="rounded-xl border border-[var(--sec-accent-border)]/60 bg-black/25 px-4 py-3">
            <FieldLabel>Guest</FieldLabel>
            <p className="font-semibold text-white text-base">{guestName}</p>
          </div>

          <div className="rounded-xl border border-[var(--sec-accent-border)]/60 bg-black/25 px-4 py-3">
            <FieldLabel>Reason</FieldLabel>
            <p className="whitespace-pre-wrap text-[#F0F0F4] leading-relaxed">
              {selected.userReason}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--sec-accent-border)] bg-black/30 p-4 space-y-3">
            <div className="flex justify-between items-center text-[var(--sec-text-muted)]">
              <span>Gross paid</span>
              <span className="text-white">{formatZar(selected.grossAmountZar)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[var(--sec-accent-border)]/50">
              <span className="font-semibold text-[var(--sec-accent-bright)]">You refund (85%)</span>
              <span className="text-lg font-bold text-[var(--sec-accent-bright)]">
                {formatZar(selected.venueRefundDueZar)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-[var(--sec-text-muted)]">
              <span>SEC keeps (15%)</span>
              <span>{formatZar(selected.platformFeeKeptZar)}</span>
            </div>
          </div>

          <div>
            <FieldLabel>Guest Sec Wallet ID</FieldLabel>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 rounded-xl bg-black/40 border border-[var(--sec-accent-border)] font-mono text-sm text-white">
                {selected.userWalletCode}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="border-[var(--sec-accent-border)] hover:border-[var(--sec-accent-bright)]/50 shrink-0"
                onClick={() => onCopyWallet(selected.userWalletCode)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-[var(--sec-text-muted)] mt-2 leading-relaxed">
              Look up this ID in Sec Wallet and pay the guest from your bank off-app.
            </p>
          </div>

          {selected.status === 'PENDING' ? (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                className="flex-1 sec-btn-primary h-11"
                disabled={approvePending}
                onClick={() => onApprove(selected.id)}
              >
                {approvePending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 border-[var(--sec-accent-border)] bg-black/20 hover:bg-black/30 hover:border-[var(--sec-accent-bright)]/40"
                onClick={onDecline}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Decline
              </Button>
            </div>
          ) : null}

          {selected.status === 'APPROVED' ? (
            <Button
              className="w-full h-11 border-[var(--sec-accent-border)]"
              variant="outline"
              disabled={markPaidPending}
              onClick={() => onMarkPaid(selected.id)}
            >
              {markPaidPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mark paid off-app'}
            </Button>
          ) : null}

          {selected.status === 'REJECTED' && selected.rejectTemplateKeys ? (
            <div className="text-xs text-[var(--sec-text-muted)] rounded-lg border border-[var(--sec-border)] bg-black/20 px-3 py-2">
              Decline reason:{' '}
              {(Array.isArray(selected.rejectTemplateKeys) ? selected.rejectTemplateKeys : []).join(', ')}
            </div>
          ) : null}
        </div>
      </LuxuryDialogShell>
    </Dialog>
  );
}

export function VenueRefundDeclineDialog({
  open,
  onOpenChange,
  rejectKey,
  onRejectKeyChange,
  rejectTemplates,
  onConfirm,
  confirmPending,
  disabled,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <LuxuryDialogShell className="max-w-md">
        <DialogHeader className="p-0">
          <div className="flex items-center gap-3.5 pr-8">
            <SecLogo size={40} variant="icon" asset="transparent" />
            <DialogTitle className="text-xl font-semibold tracking-tight text-white">
              Decline refund
            </DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-[var(--sec-text-muted)] leading-relaxed">
          Select a reason — guests only see approved template messages (no free text).
        </p>
        <Select value={rejectKey} onValueChange={onRejectKeyChange}>
          <SelectTrigger className="bg-black/30 border-[var(--sec-accent-border)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rejectTemplates.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="w-full h-11 mt-2"
          variant="destructive"
          disabled={confirmPending || disabled}
          onClick={onConfirm}
        >
          {confirmPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm decline'}
        </Button>
      </LuxuryDialogShell>
    </Dialog>
  );
}

export { StatusBadge, formatZar };
