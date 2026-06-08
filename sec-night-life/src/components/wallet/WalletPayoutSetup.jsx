import React, { useState } from 'react';
import { apiPatch, apiPost } from '@/api/client';
import { CheckCircle2, AlertCircle, CreditCard, Landmark } from 'lucide-react';
import { toast } from 'sonner';

function InputField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[#262629] bg-[#0A0A0B] text-white"
      />
    </label>
  );
}

export function UserPayoutSetup({ profile, onProfileUpdated }) {
  const [bank, setBank] = useState({ account_name: '', account_number: '', bank_code: '' });
  const [saving, setSaving] = useState(false);
  const complete = Boolean(profile?.payment_setup_complete);

  const save = async () => {
    setSaving(true);
    try {
      const resp = await apiPost('/api/payments/payout-recipient', {
        holder_type: 'USER',
        account_name: bank.account_name.trim(),
        account_number: bank.account_number.trim(),
        bank_code: bank.bank_code.trim(),
        currency: 'ZAR',
      });
      await apiPatch('/api/users/profile', {
        payment_setup_complete: true,
        paystack_recipient_code: resp?.recipient_code || null,
      });
      onProfileUpdated?.({
        payment_setup_complete: true,
        paystack_recipient_code: resp?.recipient_code || null,
      });
      toast.success('Payout details saved');
    } catch (e) {
      toast.error(e?.message || 'Could not save payout details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#262629] bg-[#141416] p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        {complete ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-gray-400">Payout setup complete</span>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-gray-400">Add bank details so earnings can reach your account</span>
          </>
        )}
      </div>
      <InputField label="Account holder name" placeholder="e.g. Siya Ndlovu" value={bank.account_name} onChange={(e) => setBank((s) => ({ ...s, account_name: e.target.value }))} />
      <InputField label="Account number" placeholder="e.g. 1234567890" value={bank.account_number} onChange={(e) => setBank((s) => ({ ...s, account_number: e.target.value }))} />
      <InputField label="Bank code" placeholder="e.g. 250655" value={bank.bank_code} onChange={(e) => setBank((s) => ({ ...s, bank_code: e.target.value }))} />
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="w-full px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 bg-[var(--sec-accent)] text-black"
      >
        <CreditCard className="w-4 h-4" />
        {saving ? 'Saving...' : complete ? 'Update payout details' : 'Save payout details'}
      </button>
    </div>
  );
}

export function VenuePayoutSetup({ venues, selectedVenueId, onVenueChange, onVenuesUpdated }) {
  const [bank, setBank] = useState({ account_name: '', account_number: '', bank_code: '' });
  const [saving, setSaving] = useState(false);
  const venue = venues.find((v) => v.id === selectedVenueId);
  const complete = Boolean(venue?.paystack_recipient_code || venue?.paystackRecipientCode);

  const save = async () => {
    if (!selectedVenueId) return;
    setSaving(true);
    try {
      const resp = await apiPost('/api/payments/payout-recipient', {
        holder_type: 'VENUE',
        venue_id: selectedVenueId,
        account_name: bank.account_name.trim(),
        account_number: bank.account_number.trim(),
        bank_code: bank.bank_code.trim(),
        currency: 'ZAR',
      });
      onVenuesUpdated?.(
        venues.map((v) => (v.id === selectedVenueId ? { ...v, paystackRecipientCode: resp?.recipient_code } : v)),
      );
      toast.success('Venue payout details saved');
    } catch (e) {
      toast.error(e?.message || 'Could not save payout details');
    } finally {
      setSaving(false);
    }
  };

  if (!venues.length) {
    return <p className="text-sm text-gray-500">No venues linked to this account.</p>;
  }

  return (
    <div className="rounded-xl border border-[#262629] bg-[#141416] p-4 space-y-3">
      {venues.length > 1 ? (
        <label className="block">
          <span className="text-xs text-gray-500">Venue</span>
          <select
            value={selectedVenueId}
            onChange={(e) => onVenueChange?.(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[#262629] bg-[#0A0A0B] text-white"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
      ) : venue ? (
        <div>
          <p className="text-xs text-gray-500">Venue</p>
          <p className="text-white font-medium mt-1">{venue.name}</p>
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-xs">
        {complete ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-gray-400">Venue payout setup complete</span>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-gray-400">Venue payout setup missing</span>
          </>
        )}
      </div>
      <InputField label="Account holder name" value={bank.account_name} onChange={(e) => setBank((s) => ({ ...s, account_name: e.target.value }))} />
      <InputField label="Account number" value={bank.account_number} onChange={(e) => setBank((s) => ({ ...s, account_number: e.target.value }))} />
      <InputField label="Bank code" value={bank.bank_code} onChange={(e) => setBank((s) => ({ ...s, bank_code: e.target.value }))} />
      <button
        type="button"
        disabled={saving || !selectedVenueId}
        onClick={save}
        className="w-full px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 bg-[var(--sec-accent)] text-black"
      >
        <Landmark className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save venue payout details'}
      </button>
    </div>
  );
}
