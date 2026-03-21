import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet } from '@/api/client';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | paid | failed | pending
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (!ref) {
          setStatus('failed');
          setMessage('Missing payment reference.');
          return;
        }
        const u = await authService.getCurrentUser();
        if (!u) {
          authService.redirectToLogin(window.location.pathname + window.location.search);
          return;
        }
        const r = await apiGet(`/api/payments/paystack/verify/${ref}`);
        setStatus(r?.status || 'pending');
        setMessage(r?.status === 'paid' ? 'Payment confirmed.' : r?.status === 'failed' ? 'Payment failed.' : 'Payment is pending.');
      } catch (e) {
        setStatus('failed');
        setMessage(e?.message || 'Payment verification failed.');
      }
    })();
  }, []);

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
        <button
          onClick={() => navigate(createPageUrl('Home'))}
          className="sec-btn sec-btn-primary w-full"
          style={{ height: 44, borderRadius: 12 }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

