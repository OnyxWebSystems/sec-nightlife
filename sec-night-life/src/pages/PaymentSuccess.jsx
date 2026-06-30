import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { markOnboardingComplete } from '@/lib/sessionCache';
import { apiPatch } from '@/api/client';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import { verifyPaystackReferenceWithRetry } from '@/lib/paystackInline';
import { invalidatePostPaymentQueries } from '@/lib/completePaystackCheckout';

const VENUE_PAYMENT_CONTEXT_KEY = 'sec-venue-onboarding-payment';

function resolveNextPath(paymentType) {
  if (paymentType === 'ticket') {
    return `${createPageUrl('Profile')}?tab=tickets`;
  }
  if (
    paymentType === 'TABLE_HOST_FEE' ||
    paymentType === 'TABLE_CHECKOUT' ||
    paymentType === 'VENUE_TABLE_JOIN' ||
    paymentType === 'HOSTED_TABLE_JOIN'
  ) {
    return `${createPageUrl('HostDashboard')}?tab=tables`;
  }
  return createPageUrl('Home');
}

function resolveCtaLabel(nextPath) {
  if (nextPath.includes('Profile')) return 'View your tickets';
  if (nextPath.includes('HostDashboard')) return 'Go to Host Dashboard';
  if (nextPath.includes('BusinessDashboard')) return 'Go to Business Dashboard';
  return 'Back to Home';
}

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [nextPath, setNextPath] = useState(createPageUrl('Home'));

  useEffect(() => {
    (async () => {
      try {
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (!ref) {
          setStatus('failed');
          setMessage('Missing payment reference.');
          return;
        }
        const u = await authService.loadUserOrLogin(window.location.pathname + window.location.search);
        if (!u) return;

        const savedContextRaw = localStorage.getItem(VENUE_PAYMENT_CONTEXT_KEY);
        const savedContext = savedContextRaw ? JSON.parse(savedContextRaw) : null;

        const r = await verifyPaystackReferenceWithRetry(ref, { retries: 4, baseDelayMs: 500 });
        const fulfilled =
          r?.fulfillment?.applied === true ||
          (r?.status === 'paid' && r?.fulfillment?.applied !== false);

        if (fulfilled) {
          invalidatePostPaymentQueries(queryClient);
        }

        if (r?.status === 'paid' && fulfilled && savedContext?.nextPath) {
          await apiPatch('/api/users/profile', {
            payment_setup_complete: true,
            onboarding_complete: true,
          });
          if (u?.id) markOnboardingComplete(u.id);
          localStorage.removeItem(VENUE_PAYMENT_CONTEXT_KEY);
          setNextPath(savedContext.nextPath);
          setStatus('paid');
          setMessage(`Payment confirmed. Your ${savedContext.planName || 'selected'} venue plan is now active.`);
          return;
        }

        const paymentType = r?.payment_type;
        const destination = resolveNextPath(paymentType);
        setNextPath(destination);

        if (r?.status === 'failed') {
          setStatus('failed');
          setMessage('Payment failed.');
        } else if (fulfilled || r?.status === 'paid') {
          setStatus('paid');
          if (paymentType === 'ticket') {
            setMessage('Payment confirmed. Your tickets are ready in Profile → Tickets.');
          } else if (
            paymentType === 'TABLE_HOST_FEE' ||
            paymentType === 'TABLE_CHECKOUT' ||
            paymentType === 'VENUE_TABLE_JOIN'
          ) {
            setMessage('Payment confirmed. Your table is live — check Host Dashboard and Profile → Tickets for your QR code.');
          } else {
            setMessage('Payment confirmed.');
          }
        } else {
          setStatus('pending');
          setMessage('Payment received. Your ticket is still being prepared — check Profile → Tickets in a moment.');
        }
      } catch (e) {
        setStatus('failed');
        setMessage(e?.message || 'Payment verification failed.');
      }
    })();
  }, [queryClient]);

  const icon =
    status === 'paid' ? <CheckCircle2 size={42} strokeWidth={1.5} style={{ color: 'var(--sec-success)' }} /> :
    status === 'failed' ? <XCircle size={42} strokeWidth={1.5} style={{ color: 'var(--sec-error)' }} /> :
    <Loader2 size={42} strokeWidth={1.5} className="animate-spin" style={{ color: 'var(--sec-text-muted)' }} />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="sec-card" style={{ maxWidth: 420, width: '100%', padding: 20, borderRadius: 16, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>{icon}</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--sec-text-primary)', marginBottom: 6 }}>
          {status === 'paid' ? 'Payment successful' : status === 'failed' ? 'Payment failed' : 'Verifying payment'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          {message || 'Please wait…'}
        </p>
        <div style={{ marginBottom: 14 }}>
          <RefundPolicyNote />
        </div>
        <button
          onClick={() => navigate(nextPath)}
          className="sec-btn sec-btn-primary w-full"
          style={{ height: 44, borderRadius: 12 }}
        >
          {resolveCtaLabel(nextPath)}
        </button>
      </div>
    </div>
  );
}
