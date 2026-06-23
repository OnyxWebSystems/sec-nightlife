import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/api/client';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error('Invalid or missing reset link');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/reset-password', { token, password });
      setDone(true);
      toast.success('Password reset — you can sign in now');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="max-w-md w-full rounded-2xl p-6 text-center" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
          <p className="text-gray-400 mb-4">This reset link is invalid or incomplete.</p>
          <Link to={createPageUrl('ForgotPassword')} className="text-[var(--sec-accent)] hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
          <h1 className="text-xl font-bold">Reset password</h1>
        </div>
        {done ? (
          <>
            <p className="text-sm text-gray-400">Your password has been updated. Sign in with your new password.</p>
            <Button
              className="w-full"
              style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
              onClick={() => navigate(createPageUrl('Login'))}
            >
              Go to sign in
            </Button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg"
                style={{ backgroundColor: 'var(--sec-bg-hover)', border: '1px solid var(--sec-border)', color: 'var(--sec-text-primary)' }}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 rounded-lg"
                style={{ backgroundColor: 'var(--sec-bg-hover)', border: '1px solid var(--sec-border)', color: 'var(--sec-text-primary)' }}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
            >
              {loading ? 'Saving…' : 'Reset password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
