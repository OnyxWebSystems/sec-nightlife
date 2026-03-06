import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/api/client';
import { toast } from 'sonner';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
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
      await apiPost('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
      toast.success('If an account exists, a password reset link has been sent.');
    } catch (err) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
      >
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold">Change Password</h1>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto">
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          {sent ? (
            <>
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-success)' }} />
                <div>
                  <h2 className="font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                    Check your email
                  </h2>
                  <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    If an account exists for {email}, you will receive a password reset link shortly. Check your spam folder if you don&apos;t see it.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                style={{ borderColor: 'var(--sec-border)' }}
              >
                Back to Settings
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-accent)' }} />
                <div className="flex-1">
                  <h2 className="font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                    Request password reset
                  </h2>
                  <p style={{ color: 'var(--sec-text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </p>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--sec-text-secondary)' }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-lg"
                    style={{
                      backgroundColor: 'var(--sec-bg-hover)',
                      border: '1px solid var(--sec-border)',
                      color: 'var(--sec-text-primary)',
                    }}
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  style={{ borderColor: 'var(--sec-border)' }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
