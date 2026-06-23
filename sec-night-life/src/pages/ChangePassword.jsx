import React, { useEffect, useState } from 'react';
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(createPageUrl('ForgotPassword'), { replace: true });
    }
  }, [isAuthenticated, navigate]);

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

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <PageBackHeader title="Change Password" fallbackTo="Settings" pageName="ChangePassword" />

      <div className="px-4 py-6 max-w-xl mx-auto">
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
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
        </div>
      </div>
    </div>
  );
}
