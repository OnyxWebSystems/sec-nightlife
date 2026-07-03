import { toast } from 'sonner';
import { verifyPaystackReferenceWithRetry } from '@/lib/paystackInline';

export function invalidatePostPaymentQueries(queryClient, { eventId } = {}) {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
  queryClient.invalidateQueries({ queryKey: ['host-tables'] });
  queryClient.invalidateQueries({ queryKey: ['business-bookings'] });
  queryClient.invalidateQueries({ queryKey: ['biz-event-table-bookings'] });
  queryClient.invalidateQueries({ queryKey: ['venue-analytics'] });
  queryClient.invalidateQueries({ queryKey: ['biz-ticket-bookings'] });
  queryClient.invalidateQueries({ queryKey: ['venue-table'] });
  queryClient.invalidateQueries({ queryKey: ['hosted-table-detail'] });
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
  retries = 4,
  baseDelayMs = 500,
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
      } else if (paymentType === 'HOSTED_TABLE_JOIN') {
        toast.success('Payment confirmed — your table QR is in Profile → Tickets');
      } else {
        toast.success('Payment confirmed');
      }
    } else if (result?.status === 'processing' || result?.paystack_status === 'success') {
      const hostCheckout =
        result?.payment_type === 'TABLE_CHECKOUT' &&
        (result?.metadata?.booking_mode === 'host' ||
          result?.metadata?.booking_mode === 'custom_host');
      if (hostCheckout && result?.fulfillment?.error) {
        toast.error('Payment received but table setup failed', {
          description: `Reference ${ref}. Contact support with this reference.`,
        });
      } else {
        toast.message('Payment received', {
          description: 'Your table pass is being prepared. This may take a moment.',
        });
      }
    } else if (result?.status === 'failed') {
      toast.error('Payment failed. Please try again.');
    }
  }

  return { ...result, fulfilled };
}
