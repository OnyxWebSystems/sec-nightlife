import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiPost } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SecLogo from '@/components/ui/SecLogo';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email?.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/forgot-password', { email: email.trim().toLowerCase() }, { skipAuth: true });
      setSent(true);
      toast.success('If an account exists, a password reset link has been sent.');
    } catch (err) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0B]">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <SecLogo size={96} asset="transparent" className="mb-4" />
          <h1 className="text-2xl font-bold text-white mb-1">Forgot password?</h1>
          <p className="text-gray-400 text-sm text-center">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-gray-400">
              If an account exists for <span className="text-white">{email}</span>, you will receive a reset link shortly.
              Check your inbox and spam folder.
            </p>
            <Button className="w-full" onClick={() => navigate(createPageUrl('Login'))}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-gray-400">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 bg-[#141416] border-[#262629]"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="text-center text-sm">
              <Link to={createPageUrl('Login')} className="text-[var(--sec-accent)] hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
