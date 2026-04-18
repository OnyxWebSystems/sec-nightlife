import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const ROLE_INTENT_KEY = 'sec-role-intent';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

function readStoredConsumerIntent() {
  try {
    const intent = localStorage.getItem(ROLE_INTENT_KEY);
    if (intent === 'VENUE' || intent === 'PARTY_GOER') return intent;
  } catch {}
  return 'PARTY_GOER';
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || createPageUrl('Home');
  const roleParam = searchParams.get('role');

  const isStaffRole = roleParam && STAFF_ROLES.includes(roleParam);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep chosen onboarding intent in storage even without showing a toggle.
  useEffect(() => {
    if (roleParam === 'VENUE' || roleParam === 'PARTY_GOER') {
      try {
        localStorage.setItem(ROLE_INTENT_KEY, roleParam);
      } catch {}
    }
  }, [roleParam]);

  const consumerIntent = roleParam === 'VENUE' || roleParam === 'PARTY_GOER'
    ? roleParam
    : readStoredConsumerIntent();

  const registerHref = useMemo(() => {
    const base = returnUrl
      ? `${createPageUrl('Register')}?returnUrl=${encodeURIComponent(returnUrl)}`
      : createPageUrl('Register');
    const intent = !isStaffRole ? consumerIntent : readStoredConsumerIntent();
    return `${base}${base.includes('?') ? '&' : '?'}role=${encodeURIComponent(intent)}`;
  }, [returnUrl, consumerIntent, isStaffRole]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      const message = 'Please enter email and password';
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    try {
      let role;
      if (isStaffRole) {
        role = roleParam;
      } else {
        role = consumerIntent === 'VENUE' ? 'VENUE' : 'USER';
      }
      await authService.login(email.trim(), password, role);
      toast.success('Signed in successfully');
      const path =
        returnUrl && returnUrl.startsWith('/')
          ? returnUrl
          : '/' + (returnUrl || 'Home').replace(/^\/+/, '');
      window.location.href = window.location.origin + path;
    } catch (err) {
      const message = err?.data?.error || err?.message || 'Sign in failed';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0B]">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Sign In</h1>
        <p className="text-gray-400 mb-6">SEC Nightlife</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {isStaffRole && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
              Signing in with staff role: <span className="font-mono">{roleParam}</span>
            </div>
          )}

          <div>
            <Label className="text-gray-400">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 bg-[#141416] border-[#262629]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <Label className="text-gray-400">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 bg-[#141416] border-[#262629]"
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-gray-500">Tip: avoid accidental spaces before or after your password.</p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        <p className="mt-6 text-center text-gray-500 text-sm">
          Don&apos;t have an account?{' '}
          <Link to={registerHref} className="text-[var(--sec-accent)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
