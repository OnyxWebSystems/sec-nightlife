import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import SecLogo from '@/components/ui/SecLogo';
import { toast } from 'sonner';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'loading' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiPost(
          '/api/auth/verify-email',
          { token },
          { skipAuth: true, timeoutMs: 20000 },
        );
        if (cancelled) return;
        setStatus('success');
        setMessage(data?.message || 'Email verified. You can now sign in.');
        toast.success('Email verified');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err?.data?.error || err?.message || 'Verification failed');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0B]">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <SecLogo size={96} asset="transparent" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Verify email</h1>
        {status === 'loading' && <p className="text-gray-400">Verifying your email…</p>}
        {status === 'missing' && (
          <p className="text-gray-400 mb-4">This verification link is invalid or incomplete.</p>
        )}
        {(status === 'success' || status === 'error') && (
          <p className={`mb-6 text-sm ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
        <Button asChild className="w-full max-w-xs mx-auto">
          <Link to={createPageUrl('Login')}>Go to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
