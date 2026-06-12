import { toast } from 'sonner';
import { verifyPaystackReferenceWithRetry } from '@/lib/paystackInline';

export function invalidatePostPaymentQueries(queryClient, { eventId } = {}) {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
  queryClient.invalidateQueries({ queryKey: ['host-tables'] });
  queryClient.invalidateQueries({ queryKey: ['business-bookings'] });
  queryClient.invalidateQueries({ queryKey: ['biz-ticket-bookings'] });
  queryClient.invalidateQueries({ queryKey: ['venue-table'] });
  queryClient.invalidateQueries({ queryKey: ['event-table-tiers'] });
  queryClient.invalidateQueries({ queryKey: ['venue-events'] });
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  if (eventId) {
    queryClient.invalidateQueries({ queryKey: ['event', eventId] });
  }
}

/**
 * Verify a Paystack charge with retries, refresh caches, and surface fulfillment status.
 */
export async function completePaystackCheckout({
  reference,
  payload,
  queryClient,
  retries = 8,
  baseDelayMs = 1200,
  showToasts = true,
}) {
  const ref = payload?.reference || reference;
  const result = await verifyPaystackReferenceWithRetry(ref, { retries, baseDelayMs });

  const fulfilled =
    result?.fulfillment?.applied === true ||
    (result?.status === 'paid' && result?.fulfillment?.applied !== false);

  if (fulfilled) {
    const eventId =
      payload?.metadata?.event_id ||
      payload?.metadata?.eventId ||
      result?.metadata?.event_id ||
      result?.metadata?.eventId;
    invalidatePostPaymentQueries(queryClient, { eventId: eventId || undefined });
  }

  if (showToasts) {
    if (fulfilled) {
      const paymentType = result?.payment_type;
      if (paymentType === 'ticket') {
        toast.success('Payment successful — your tickets are in Profile → Tickets');
      } else if (
        paymentType === 'TABLE_HOST_FEE' ||
        paymentType === 'TABLE_CHECKOUT' ||
        paymentType === 'VENUE_TABLE_JOIN'
      ) {
        toast.success('Payment confirmed — check Host Dashboard and Profile → Tickets');
      } else {
        toast.success('Payment confirmed');
      }
    } else if (result?.status === 'processing' || result?.paystack_status === 'success') {
      toast.message('Payment received', {
        description: 'Your ticket is being prepared. Check Profile → Tickets in a moment.',
      });
    } else if (result?.status === 'failed') {
      toast.error('Payment failed. Please try again.');
    }
  }

  return { ...result, fulfilled };
}
