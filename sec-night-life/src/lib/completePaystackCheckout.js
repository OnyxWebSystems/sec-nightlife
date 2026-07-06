import { toast } from 'sonner';
import { apiGet } from '@/api/client';
import { verifyPaystackReference, verifyPaystackReferenceWithRetry } from '@/lib/paystackInline';

export function fetchPaymentFulfillment(reference) {
  return apiGet(`/api/payments/${encodeURIComponent(reference)}/fulfillment`);
}

export function invalidatePostPaymentQueries(queryClient, { eventId } = {}) {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
  queryClient.invalidateQueries({ queryKey: ['host-tickets'] });
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

function isFulfilledResult(result) {
  return (
    result?.fulfillment?.applied === true ||
    (result?.status === 'paid' && result?.fulfillment?.applied !== false)
  );
}

/**
 * Poll fulfillment status (DB-only) until complete, fails, or timeout.
 */
export async function pollPaymentFulfillment(reference, { maxMs = 120000 } = {}) {
  const started = Date.now();
  let lastResult = null;
  while (Date.now() - started < maxMs) {
    lastResult = await fetchPaymentFulfillment(reference);
    if (isFulfilledResult(lastResult)) return { ...lastResult, fulfilled: true };
    if (lastResult?.status === 'failed') return { ...lastResult, fulfilled: false };
    if (lastResult?.fulfillment?.error) return { ...lastResult, fulfilled: false };
    const elapsed = Date.now() - started;
    const intervalMs = elapsed < 30000 ? 1500 : 4000;
    await new Promise((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }
  return { ...(lastResult || {}), fulfilled: isFulfilledResult(lastResult) };
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
  pollUntilFulfilled = false,
  pollMaxMs = 120000,
}) {
  const ref = payload?.reference || reference;
  let result = await verifyPaystackReferenceWithRetry(ref, { retries, baseDelayMs });

  if (!isFulfilledResult(result) && pollUntilFulfilled) {
    result = await pollPaymentFulfillment(ref, { maxMs: pollMaxMs });
  }

  const fulfilled = isFulfilledResult(result);

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
        result?.is_host_checkout === true ||
        (result?.payment_type === 'TABLE_CHECKOUT' &&
          (result?.booking_mode === 'host' || result?.booking_mode === 'custom_host'));
      if (hostCheckout && result?.fulfillment?.error) {
        toast.error('Payment received but table setup failed', {
          description: `Reference ${ref}. Tap Retry fulfillment or contact support.`,
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
