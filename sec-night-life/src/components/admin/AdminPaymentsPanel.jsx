import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/api/client';
import { toast } from 'sonner';
import AdminEmptyState from './AdminEmptyState';

export default function AdminPaymentsPanel() {
  const [payments, setPayments] = useState([]);
  const [paymentRevenue, setPaymentRevenue] = useState(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('/api/admin/payments?limit=200');
        setPayments(data?.payments || []);
        setPaymentRevenue(data?.revenue || null);
      } catch (err) {
        setPayments([]);
        setPaymentRevenue(null);
        toast.error(`Could not load payments${err?.message ? `: ${err.message}` : ''}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  if (loading) {
    return <AdminEmptyState message="Loading payments…" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
          <p className="text-xs text-[var(--sec-text-muted)] uppercase tracking-wide">Gross collected</p>
          <p className="text-xl font-bold mt-1">R{Number(paymentRevenue?.totalGrossZar || 0).toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-xl bg-[#141416] border border-[rgba(212,175,55,0.25)]">
          <p className="text-xs text-[var(--sec-text-muted)] uppercase tracking-wide">SEC revenue</p>
          <p className="text-xl font-bold mt-1 text-[var(--sec-accent)]">R{Number(paymentRevenue?.totalSecRevenueZar || 0).toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
          <p className="text-xs text-[var(--sec-text-muted)] uppercase tracking-wide">Pending transfers</p>
          <p className="text-xl font-bold mt-1">{paymentRevenue?.pendingTransfers ?? 0}</p>
        </div>
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
            ) : paymentBuckets[key].map((p) => {
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
                          <p className="font-medium">R{Number(p.grossZar ?? p.amount ?? 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--sec-text-muted)]">SEC fee</p>
                          <p className="font-medium text-[var(--sec-accent)]">
                            {p.secAmountZar != null ? `R${Number(p.secAmountZar).toLocaleString()}` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--sec-text-muted)]">Transfer</p>
                          <p className="font-medium">{p.transferStatus || (p.no_ledger ? 'N/A' : '—')}</p>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--sec-text-muted)] break-all">Ref: {p.reference}</p>
                      {p.metadata && typeof p.metadata === 'object' ? (
                        <pre className="text-[10px] text-[var(--sec-text-muted)] bg-[#0A0A0B] p-2 rounded-lg overflow-x-auto max-h-32">
                          {JSON.stringify(p.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
