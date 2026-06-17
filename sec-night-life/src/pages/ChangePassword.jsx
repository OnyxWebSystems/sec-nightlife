import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/api/client';
import { toast } from 'sonner';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useAuth } from '@/lib/AuthContext';
import { clearTokens } from '@/api/client';
import { createPageUrl } from '@/utils';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState(isAuthenticated ? 'change' : 'reset');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!email?.trim()) {
      toast.error('Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
      toast.success('If an account exists, a password reset link has been sent.');
    } catch (err) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Password updated — sign in again on other devices');
      clearTokens();
      navigate(createPageUrl('Login'));
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <PageBackHeader title="Change Password" fallbackTo="Settings" pageName="ChangePassword" />

      <div className="px-4 py-6 max-w-xl mx-auto">
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          {isAuthenticated && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'change' ? 'default' : 'outline'}
                onClick={() => setMode('change')}
                style={mode === 'change' ? { backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' } : undefined}
              >
                Update password
              </Button>
              <Button type="button" variant={mode === 'reset' ? 'default' : 'outline'} onClick={() => setMode('reset')}>
                Email reset link
              </Button>
            </div>
          )}

          {mode === 'change' && isAuthenticated ? (
            <form onSubmit={handleChangeSubmit} className="space-y-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-accent)' }} />
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-gray-400">Enter your current password and choose a new one.</p>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full px-4 py-3 rounded-lg"
                    style={{ backgroundColor: 'var(--sec-bg-hover)', border: '1px solid var(--sec-border)', color: 'var(--sec-text-primary)' }}
                    autoComplete="current-password"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    className="w-full px-4 py-3 rounded-lg"
                    style={{ backgroundColor: 'var(--sec-bg-hover)', border: '1px solid var(--sec-border)', color: 'var(--sec-text-primary)' }}
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 rounded-lg"
                    style={{ backgroundColor: 'var(--sec-bg-hover)', border: '1px solid var(--sec-border)', color: 'var(--sec-text-primary)' }}
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
              >
                {loading ? 'Saving…' : 'Update password'}
              </Button>
            </form>
          ) : sent ? (
            <>
              <p className="text-sm text-gray-400">
                If an account exists for {email}, you will receive a reset link shortly.
              </p>
              <Button variant="outline" onClick={() => navigate(-1)}>Back to Settings</Button>
            </>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-accent)' }} />
                <div className="flex-1">
                  <p className="text-sm text-gray-400 mb-3">
                    Enter your email and we&apos;ll send a link to reset your password.
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-lg"
                    style={{ backgroundColor: 'var(--sec-bg-hover)', border: '1px solid var(--sec-border)', color: 'var(--sec-text-primary)' }}
                    autoComplete="email"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
