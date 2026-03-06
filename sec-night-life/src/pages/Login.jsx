import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const ROLE_INTENT_KEY = 'sec-role-intent';
function getBackendRole() {
  try {
    const intent = localStorage.getItem(ROLE_INTENT_KEY);
    if (intent === 'BUSINESS_OWNER') return 'VENUE';
  } catch {}
  return 'USER';
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || createPageUrl('Home');
  const roleParam = searchParams.get('role'); // PARTY_GOER or BUSINESS_OWNER from Onboarding
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Persist role from URL to localStorage for consistency
  React.useEffect(() => {
    if (roleParam && ['PARTY_GOER', 'BUSINESS_OWNER'].includes(roleParam)) {
      try {
        localStorage.setItem(ROLE_INTENT_KEY, roleParam);
      } catch {}
    }
  }, [roleParam]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const role = roleParam === 'BUSINESS_OWNER' ? 'VENUE' : roleParam === 'PARTY_GOER' ? 'USER' : getBackendRole();
      await authService.login(email, password, role);
      toast.success('Signed in successfully');
      navigate(returnUrl.startsWith('/') ? returnUrl : '/' + returnUrl);
      window.location.reload();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Sign in failed');
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
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        <p className="mt-6 text-center text-gray-500 text-sm">
          Don&apos;t have an account?{' '}
          <Link to={returnUrl ? createPageUrl('Register') + '?returnUrl=' + encodeURIComponent(returnUrl) : createPageUrl('Register')} className="text-[var(--sec-accent)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
