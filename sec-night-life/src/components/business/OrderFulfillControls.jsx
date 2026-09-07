import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';

function ordersUrl(reference, action, venueQuery) {
  const path = `/api/business/orders/${encodeURIComponent(reference)}/${action}`;
  if (!venueQuery) return path;
  return `${path}?${venueQuery}`;
}

export function OrderStatusBadge({ hasServeableOrder, orderFulfilled }) {
  if (!hasServeableOrder) return null;
  if (orderFulfilled) {
    return <span className="sec-badge sec-badge-success">Order fulfilled</span>;
  }
  return <span className="sec-badge sec-badge-gold">Needs serving</span>;
}

export default function OrderFulfillControls({
  paystackReference,
  hasServeableOrder,
  orderFulfilled,
  compact = false,
}) {
  const queryClient = useQueryClient();
  const venueScope = useBusinessVenueScope();
  const ref = String(paystackReference || '').trim();
  const enabled = Boolean(ref && hasServeableOrder);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['biz-orders'] });
    queryClient.invalidateQueries({ queryKey: ['biz-event-table-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['biz-venue-table-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['biz-ticket-bookings'] });
    queryClient.invalidateQueries({ queryKey: ['biz-table-booking-detail'] });
  };

  const fulfill = useMutation({
    mutationFn: () => apiPost(ordersUrl(ref, 'fulfill', venueScope.venueQuery), {}),
    onSuccess: () => {
      toast.success('Order marked fulfilled');
      invalidate();
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not mark fulfilled'),
  });

  const unfulfill = useMutation({
    mutationFn: () => apiPost(ordersUrl(ref, 'unfulfill', venueScope.venueQuery), {}),
    onSuccess: () => {
      toast.success('Order marked as still needs serving');
      invalidate();
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not undo'),
  });

  if (!enabled) return null;

  const busy = fulfill.isPending || unfulfill.isPending;

  return (
    <div style={{ marginTop: compact ? 8 : 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <OrderStatusBadge hasServeableOrder={hasServeableOrder} orderFulfilled={orderFulfilled} />
      {orderFulfilled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg text-xs"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            unfulfill.mutate();
          }}
        >
          {busy ? <Loader2 className="animate-spin" size={14} /> : 'Undo'}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg text-xs"
          style={{ background: 'var(--sec-accent)', color: '#000' }}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            fulfill.mutate();
          }}
        >
          {busy ? <Loader2 className="animate-spin" size={14} /> : 'Mark order fulfilled'}
        </Button>
      )}
    </div>
  );
}
