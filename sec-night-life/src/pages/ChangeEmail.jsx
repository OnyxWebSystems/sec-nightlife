import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { apiPost } from '@/api/client';
import { toast } from 'sonner';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useAuth } from '@/lib/AuthContext';

export default function ChangeEmail() {
  const navigate = useNavigate();
  const { user, checkAppState } = useAuth();
  const [step, setStep] = useState(1);
  const [currentOtp, setCurrentOtp] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newOtp, setNewOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCurrentOtp = async () => {
    setLoading(true);
    try {
      await apiPost('/api/auth/change-email/request');
      setStep(2);
      toast.success('Code sent to your current email');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyCurrent = async () => {
    if (currentOtp.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/change-email/verify-current', { otp: currentOtp });
      setStep(3);
      toast.success('Current email verified');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const sendNewEmailOtp = async () => {
    if (!newEmail.trim()) {
      toast.error('Enter your new email');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/auth/change-email/confirm', { new_email: newEmail.trim().toLowerCase() });
      toast.success('Code sent to your new email');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const confirmNewEmail = async () => {
    if (!newEmail.trim() || newOtp.length !== 6) {
      toast.error('Enter new email and 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost('/api/auth/change-email/confirm', {
        new_email: newEmail.trim().toLowerCase(),
        otp: newOtp,
      });
      toast.success('Email updated successfully');
      await checkAppState?.();
      navigate(-1);
      if (res?.email) {
        // Auth context will refresh on next load
      }
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not update email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <PageBackHeader title="Change Email" fallbackTo="Settings" />

      <div className="px-4 py-6 max-w-xl mx-auto">
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
        >
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--sec-accent)' }} />
            <div className="flex-1 space-y-4">
              <p className="text-sm text-gray-400">
                Current email: <span className="text-white">{user?.email || '—'}</span>
              </p>

              {step === 1 && (
                <>
                  <p className="text-sm text-gray-400">
                    We&apos;ll send a 6-digit code to your current email to confirm it&apos;s you.
                  </p>
                  <Button
                    onClick={requestCurrentOtp}
                    disabled={loading}
                    style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send verification code'}
                  </Button>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="text-sm text-gray-400">Enter the code from your current email.</p>
                  <InputOTP maxLength={6} value={currentOtp} onChange={setCurrentOtp}>
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot key={i} index={i} className="bg-[#141416] border-[#262629] text-white" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={verifyCurrent}
                      disabled={loading || currentOtp.length !== 6}
                      style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
                    >
                      Verify current email
                    </Button>
                    <Button variant="outline" onClick={requestCurrentOtp} disabled={loading}>
                      Resend code
                    </Button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <p className="text-sm text-gray-400">Enter your new email, then verify the code we send there.</p>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new@email.com"
                    className="w-full px-4 py-3 rounded-lg"
                    style={{
                      backgroundColor: 'var(--sec-bg-hover)',
                      border: '1px solid var(--sec-border)',
                      color: 'var(--sec-text-primary)',
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={sendNewEmailOtp}
                    disabled={loading || !newEmail.trim()}
                  >
                    Send code to new email
                  </Button>
                  <InputOTP maxLength={6} value={newOtp} onChange={setNewOtp}>
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot key={i} index={i} className="bg-[#141416] border-[#262629] text-white" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <Button
                    onClick={confirmNewEmail}
                    disabled={loading || newOtp.length !== 6}
                    style={{ backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
                  >
                    Confirm new email
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
