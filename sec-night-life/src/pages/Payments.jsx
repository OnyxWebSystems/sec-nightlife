import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CreditCard, Landmark, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiPatch, apiPost } from '@/api/client';
import { toast } from 'sonner';

function SectionCard({ title, subtitle, children }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sec-border)' }}>
        <p className="font-semibold" style={{ color: 'var(--sec-text-primary)' }}>{title}</p>
        {subtitle ? <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>{subtitle}</p> : null}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full mt-1 px-3 py-2.5 rounded-xl border"
        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
      />
    </label>
  );
}

export default function Payments() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);

  const [userBank, setUserBank] = useState({ account_name: '', account_number: '', bank_code: '' });
  const [venueBank, setVenueBank] = useState({ account_name: '', account_number: '', bank_code: '' });

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
        const [profiles, myVenues] = await Promise.all([
          dataService.User.filter({ created_by: u.email }),
          dataService.Venue.mine().catch(() => []),
        ]);
        setProfile(profiles?.[0] || null);
        setVenues(myVenues || []);
        if (myVenues?.[0]?.id) setSelectedVenueId(myVenues[0].id);
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const venueRecipientDone = useMemo(() => {
    const v = venues.find((x) => x.id === selectedVenueId);
    return Boolean(v?.paystack_recipient_code || v?.paystackRecipientCode);
  }, [venues, selectedVenueId]);

  const saveRecipient = async (holderType) => {
    const bank = holderType === 'USER' ? userBank : venueBank;
    const setSaving = holderType === 'USER' ? setSavingUser : setSavingVenue;
    setSaving(true);
    try {
      const payload = {
        holder_type: holderType,
        venue_id: holderType === 'VENUE' ? selectedVenueId : null,
        account_name: bank.account_name.trim(),
        account_number: bank.account_number.trim(),
        bank_code: bank.bank_code.trim(),
        currency: 'ZAR',
      };
      const resp = await apiPost('/api/payments/payout-recipient', payload);
      if (holderType === 'USER') {
        await apiPatch('/api/users/profile', {
          payment_setup_complete: true,
          paystack_recipient_code: resp?.recipient_code || null,
        });
        setProfile((p) => ({ ...(p || {}), payment_setup_complete: true, paystack_recipient_code: resp?.recipient_code || null }));
      } else {
        setVenues((prev) =>
          prev.map((v) => (v.id === selectedVenueId ? { ...v, paystackRecipientCode: resp?.recipient_code } : v)),
        );
      }
      toast.success('Payout details saved');
    } catch (e) {
      toast.error(e?.message || 'Could not save payout details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
        <div className="px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--sec-bg-card)' }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: 'var(--sec-text-primary)' }}>Payment Methods</h1>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-6 space-y-4">
        <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}>
          <p className="text-sm" style={{ color: 'var(--sec-text-primary)' }}>
            Add payout bank details to receive your 85% automatically after successful payments.
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
            If details are missing, payouts remain pending until you complete setup.
          </p>
        </div>

        <SectionCard
          title="Personal payout details"
          subtitle="For hosts and users who earn from joining fees or paid activities."
        >
          <div className="flex items-center gap-2 text-xs">
            {profile?.payment_setup_complete ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span style={{ color: 'var(--sec-text-muted)' }}>Payout setup complete</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span style={{ color: 'var(--sec-text-muted)' }}>Payout setup missing</span>
              </>
            )}
          </div>
          <InputField
            label="Account holder name"
            placeholder="e.g. Siya Ndlovu"
            value={userBank.account_name}
            onChange={(e) => setUserBank((s) => ({ ...s, account_name: e.target.value }))}
          />
          <InputField
            label="Account number"
            placeholder="e.g. 1234567890"
            value={userBank.account_number}
            onChange={(e) => setUserBank((s) => ({ ...s, account_number: e.target.value }))}
          />
          <InputField
            label="Bank code"
            placeholder="e.g. 250655"
            value={userBank.bank_code}
            onChange={(e) => setUserBank((s) => ({ ...s, bank_code: e.target.value }))}
          />
          <button
            disabled={savingUser}
            onClick={() => saveRecipient('USER')}
            className="w-full mt-1 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
          >
            <CreditCard className="w-4 h-4" />
            {savingUser ? 'Saving...' : 'Save personal payout details'}
          </button>
        </SectionCard>

        {venues.length > 0 ? (
          <SectionCard
            title="Venue payout details"
            subtitle="For venue earnings from paid venue table contributions and related flows."
          >
            <label className="block">
              <span className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>Venue</span>
              <select
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 rounded-xl border"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2 text-xs">
              {venueRecipientDone ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span style={{ color: 'var(--sec-text-muted)' }}>Venue payout setup complete</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span style={{ color: 'var(--sec-text-muted)' }}>Venue payout setup missing</span>
                </>
              )}
            </div>
            <InputField
              label="Account holder name"
              placeholder="e.g. Rooftop Lounge PTY LTD"
              value={venueBank.account_name}
              onChange={(e) => setVenueBank((s) => ({ ...s, account_name: e.target.value }))}
            />
            <InputField
              label="Account number"
              placeholder="e.g. 1234567890"
              value={venueBank.account_number}
              onChange={(e) => setVenueBank((s) => ({ ...s, account_number: e.target.value }))}
            />
            <InputField
              label="Bank code"
              placeholder="e.g. 250655"
              value={venueBank.bank_code}
              onChange={(e) => setVenueBank((s) => ({ ...s, bank_code: e.target.value }))}
            />
            <button
              disabled={savingVenue || !selectedVenueId}
              onClick={() => saveRecipient('VENUE')}
              className="w-full mt-1 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
            >
              <Landmark className="w-4 h-4" />
              {savingVenue ? 'Saving...' : 'Save venue payout details'}
            </button>
          </SectionCard>
        ) : (
          <div className="rounded-2xl p-4 border" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}>
            <div className="flex items-start gap-2">
              <Building2 className="w-5 h-5 mt-0.5" style={{ color: 'var(--sec-text-muted)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--sec-text-primary)' }}>No venue account yet</p>
                <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                  Register a venue first to unlock venue payout setup.
                </p>
                <button
                  onClick={() => navigate(createPageUrl('VenueOnboarding'))}
                  className="text-xs mt-2 underline"
                  style={{ color: 'var(--sec-accent)' }}
                >
                  Open venue onboarding
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
