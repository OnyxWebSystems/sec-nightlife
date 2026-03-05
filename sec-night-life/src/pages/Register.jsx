import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { clearTokens } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await authService.register(email, password, fullName || undefined, 'USER');
      clearTokens();
      toast.success('Account created! Please sign in.');
      navigate(createPageUrl('Login'), { replace: true });
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0B]">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Create Account</h1>
        <p className="text-gray-400 mb-6">SEC Nightlife</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-400">Full Name</Label>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 bg-[#141416] border-[#262629]"
              placeholder="Your name"
            />
          </div>
          <div>
            <Label className="text-gray-400">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 bg-[#141416] border-[#262629]"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <Label className="text-gray-400">Password (min 8 characters)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 bg-[#141416] border-[#262629]"
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>
        <p className="mt-6 text-center text-gray-500 text-sm">
          Already have an account?{' '}
          <Link to={createPageUrl('Login')} className="text-[#FF3366] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
