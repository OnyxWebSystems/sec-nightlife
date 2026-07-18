import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import AdminEmptyState from './AdminEmptyState';

function buildMonthOptions(monthsBack = 24) {
  const options = [{ value: '', label: 'All time' }];
  const now = new Date();
  for (let i = 0; i < monthsBack; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${y}-${m}`;
    const label = d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

/** Month value YYYY-MM → ISO from/to covering that calendar month (local). */
function monthToRange(monthValue) {
  if (!monthValue) return { from: null, to: null };
  const [ys, ms] = monthValue.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return { from: null, to: null };
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AdminPaymentsPanel() {
  const [payments, setPayments] = useState([]);
  const [paymentRevenue, setPaymentRevenue] = useState(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('');
  const [remindingKey, setRemindingKey] = useState(null);

  const monthOptions = useMemo(() => buildMonthOptions(24), []);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthToRange(month);
      const params = new URLSearchParams({ limit: '200' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const data = await apiGet(`/api/admin/payments?${params.toString()}`);
      setPayments(data?.payments || []);
      setPaymentRevenue(data?.revenue || null);
    } catch (err) {
      setPayments([]);
      setPaymentRevenue(null);
      toast.error(`Could not load payments${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const paymentBuckets = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = startOfToday.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() + mondayOffset);
    const startOfLast30 = new Date(startOfToday);
    startOfLast30.setDate(startOfToday.getDate() - 30);

    const buckets = {
      today: [],
      thisWeek: [],
      last30Days: [],
      older: [],
    };

    for (const payment of payments) {
      const created = payment?.createdAt ? new Date(payment.createdAt) : null;
      if (!created || Number.isNaN(created.getTime())) {
        buckets.older.push(payment);
        continue;
      }
      if (created >= startOfToday) buckets.today.push(payment);
      else if (created >= startOfWeek) buckets.thisWeek.push(payment);
      else if (created >= startOfLast30) buckets.last30Days.push(payment);
      else buckets.older.push(payment);
    }
    return buckets;
  }, [payments]);

  const missingWalletRecipients = useMemo(
    () => (paymentRevenue?.pendingRecipients || []).filter((r) => !r.hasPayoutSetup && Number(r.pendingZar) > 0),
    [paymentRevenue],
  );

  const recipientKey = (r) =>
    r.recipientType === 'VENUE' ? `VENUE:${r.venueId}` : `USER:${r.userId}`;

  const sendReminder = async (recipient) => {
    const key = recipientKey(recipient);
    setRemindingKey(key);
    try {
      await apiPost('/api/admin/payouts/remind-wallet-setup', {
        recipientType: recipient.recipientType,
        userId: recipient.recipientType === 'USER' ? recipient.userId : undefined,
        venueId: recipient.recipientType === 'VENUE' ? recipient.venueId : undefined,
      });
      toast.success(`Reminder sent to ${recipient.name || recipient.email || 'recipient'}`);
    } catch (err) {
      const msg = err?.message || 'Could not send reminder';
      toast.error(msg);
    } finally {
      setRemindingKey(null);
    }
  };

  if (loading && !paymentRevenue) {
    return <AdminEmptyState message="Loading payments…" />;
  }

  const pendingZar = Number(
    paymentRevenue?.pendingTransfersZar ?? paymentRevenue?.pendingTransfers ?? 0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--sec-text-secondary)]">
          <span className="text-xs uppercase tracking-wide text-[var(--sec-text-muted)]">Month</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#262629] bg-[#0A0A0B] text-white text-sm min-h-[44px]"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {loading ? (
          <span className="text-xs text-[var(--sec-text-muted)]">Updating…</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
          <p className="text-xs text-[var(--sec-text-muted)] uppercase tracking-wide">Gross collected</p>
          <p className="text-xl font-bold mt-1">
            R{Number(paymentRevenue?.totalGrossZar || 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#141416] border border-[rgba(212,175,55,0.25)]">
          <p className="text-xs text-[var(--sec-text-muted)] uppercase tracking-wide">SEC revenue</p>
          <p className="text-xl font-bold mt-1 text-[var(--sec-accent)]">
            R{Number(paymentRevenue?.totalSecRevenueZar || 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
          <p className="text-xs text-[var(--sec-text-muted)] uppercase tracking-wide">Pending transfers</p>
          <p className="text-xl font-bold mt-1">R{pendingZar.toLocaleString()}</p>
          {paymentRevenue?.pendingTransfersCount != null ? (
            <p className="text-[10px] text-[var(--sec-text-muted)] mt-1">
              {paymentRevenue.pendingTransfersCount} ledger
              {paymentRevenue.pendingTransfersCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Pending payouts — wallet not set</h3>
        {missingWalletRecipients.length === 0 ? (
          <p className="text-xs text-[var(--sec-text-muted)]">
            No pending recipient payouts blocked by missing Sec Wallet setup
            {month ? ' in this month' : ''}.
          </p>
        ) : (
          missingWalletRecipients.map((r) => {
            const key = recipientKey(r);
            const busy = remindingKey === key;
            return (
              <div
                key={key}
                className="rounded-xl bg-[#141416] border border-[#262629] p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {r.name}
                    <span className="text-xs text-[var(--sec-text-muted)] font-normal ml-2">
                      {r.recipientType === 'VENUE' ? 'Venue' : 'User'}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--sec-text-muted)] truncate">
                    {r.email || 'No email'} · R{Number(r.pendingZar || 0).toLocaleString()} pending
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => sendReminder(r)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sec-accent)] text-black text-sm font-semibold disabled:opacity-50 min-h-[44px]"
                >
                  <Mail className="w-4 h-4" />
                  {busy ? 'Sending…' : 'Send reminder'}
                </button>
              </div>
            );
          })
        )}
      </div>

      <h3 className="font-semibold">Payment ledger</h3>
      {payments.length === 0 ? (
        <AdminEmptyState message="No payments yet" />
      ) : (
        [
          ['today', 'Today'],
          ['thisWeek', 'This week'],
          ['last30Days', 'Last 30 days'],
          ['older', 'Older payments'],
        ].map(([key, label]) => (
          <div key={key} className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--sec-text-secondary)]">
              {label} ({paymentBuckets[key].length})
            </h4>
            {paymentBuckets[key].length === 0 ? (
              <p className="text-xs text-[var(--sec-text-muted)]">No payments</p>
            ) : (
              paymentBuckets[key].map((p) => {
                const expanded = expandedPaymentId === p.id;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl bg-[#141416] border border-[#262629] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedPaymentId(expanded ? null : p.id)}
                      className="w-full p-4 flex justify-between items-center text-left hover:bg-[#1a1a1c] transition-colors min-h-[44px]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          R{Number(p.grossZar ?? p.amount ?? 0).toLocaleString()} · {p.type}
                        </p>
                        <p className="text-xs text-[var(--sec-text-muted)] truncate">
                          {p.email} · {p.status}
                          {p.no_ledger ? ' · no ledger' : ''}
                        </p>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="text-xs text-[var(--sec-accent)]">
                          SEC R{Number(p.secAmountZar ?? 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-[var(--sec-text-muted)]">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-[#262629] text-sm space-y-2">
                        <div className="grid grid-cols-2 gap-2 pt-3">
                          <div>
                            <p className="text-xs text-[var(--sec-text-muted)]">Gross</p>
                            <p className="font-medium">
                              R{Number(p.grossZar ?? p.amount ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--sec-text-muted)]">SEC fee</p>
                            <p className="font-medium text-[var(--sec-accent)]">
                              {p.secAmountZar != null
                                ? `R${Number(p.secAmountZar).toLocaleString()}`
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--sec-text-muted)]">Transfer</p>
                            <p className="font-medium">
                              {p.transferStatus || (p.no_ledger ? 'N/A' : '—')}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-[var(--sec-text-muted)] break-all">
                          Ref: {p.reference}
                        </p>
                        {p.metadata && typeof p.metadata === 'object' ? (
                          <pre className="text-[10px] text-[var(--sec-text-muted)] bg-[#0A0A0B] p-2 rounded-lg overflow-x-auto max-h-32">
                            {JSON.stringify(p.metadata, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ))
      )}
    </div>
  );
}
