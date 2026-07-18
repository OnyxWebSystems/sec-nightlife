import React, { useState } from 'react';
import { apiPost } from '@/api/client';
import { CheckCircle2, AlertCircle, CreditCard, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import PayoutTrustBanner from '@/components/wallet/PayoutTrustBanner';

const EMPTY_BANK = { account_name: '', account_number: '', bank_code: '' };

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
        autoComplete="off"
      />
    </label>
  );
}

function BankFormFields({ bank, setBank }) {
  return (
    <>
      <InputField
        label="Account holder name"
        placeholder="e.g. Siya Ndlovu"
        value={bank.account_name}
        onChange={(e) => setBank((s) => ({ ...s, account_name: e.target.value }))}
      />
      <InputField
        label="Account number"
        placeholder="e.g. 1234567890"
        value={bank.account_number}
        onChange={(e) => setBank((s) => ({ ...s, account_number: e.target.value }))}
      />
      <InputField
        label="Bank code"
        placeholder="e.g. 250655"
        value={bank.bank_code}
        onChange={(e) => setBank((s) => ({ ...s, bank_code: e.target.value }))}
      />
    </>
  );
}

export function UserPayoutSetup({ profile, onProfileUpdated }) {
  const [bank, setBank] = useState(EMPTY_BANK);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const complete = Boolean(profile?.payment_setup_complete);

  const save = async () => {
    setSaving(true);
    try {
      await apiPost('/api/payments/payout-recipient', {
        holder_type: 'USER',
        account_name: bank.account_name.trim(),
        account_number: bank.account_number.trim(),
        bank_code: bank.bank_code.trim(),
        currency: 'ZAR',
      });
      onProfileUpdated?.({
        payment_setup_complete: true,
      });
      setBank(EMPTY_BANK);
      setEditing(false);
      toast.success('Sec wallet set');
    } catch (e) {
      toast.error(e?.message || 'Could not save payout details');
    } finally {
      setSaving(false);
    }
  };

  const showForm = !complete || editing;

  return (
    <div className="rounded-xl border border-[#262629] bg-[#141416] p-4 space-y-3">
      <PayoutTrustBanner compact />
      {complete && !editing ? (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
          <span className="text-sm text-white font-medium">Sec wallet set</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span className="text-gray-400">
            {editing
              ? 'Enter new bank details to replace your current Sec wallet payout'
              : 'Add bank details so earnings can reach your account'}
          </span>
        </div>
      )}
      {showForm ? (
        <>
          <BankFormFields bank={bank} setBank={setBank} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="w-full px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 bg-[var(--sec-accent)] text-black"
            >
              <CreditCard className="w-4 h-4" />
              {saving ? 'Saving...' : editing ? 'Save new Sec wallet' : 'Save payout details'}
            </button>
            {editing ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setBank(EMPTY_BANK);
                  setEditing(false);
                }}
                className="w-full px-4 py-2.5 rounded-xl text-sm text-gray-400 border border-[#262629]"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setBank(EMPTY_BANK);
            setEditing(true);
          }}
          className="w-full px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 border border-[#262629] text-white hover:bg-[#1a1a1c]"
        >
          Update Sec wallet
        </button>
      )}
    </div>
  );
}

export function VenuePayoutSetup({ venues, selectedVenueId, onVenueChange, onVenuesUpdated }) {
  const [bank, setBank] = useState(EMPTY_BANK);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
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
        venues.map((v) =>
          v.id === selectedVenueId
            ? { ...v, paystackRecipientCode: resp?.recipient_code, paystack_recipient_code: resp?.recipient_code }
            : v,
        ),
      );
      setBank(EMPTY_BANK);
      setEditing(false);
      toast.success('Venue Sec wallet set');
    } catch (e) {
      toast.error(e?.message || 'Could not save payout details');
    } finally {
      setSaving(false);
    }
  };

  if (!venues.length) {
    return <p className="text-sm text-gray-500">No venues linked to this account.</p>;
  }

  const showForm = !complete || editing;

  return (
    <div className="rounded-xl border border-[#262629] bg-[#141416] p-4 space-y-3">
      <PayoutTrustBanner compact />
      {venues.length > 1 ? (
        <label className="block">
          <span className="text-xs text-gray-500">Venue</span>
          <select
            value={selectedVenueId}
            onChange={(e) => {
              onVenueChange?.(e.target.value);
              setBank(EMPTY_BANK);
              setEditing(false);
            }}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-[#262629] bg-[#0A0A0B] text-white"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      ) : venue ? (
        <div>
          <p className="text-xs text-gray-500">Venue</p>
          <p className="text-white font-medium mt-1">{venue.name}</p>
        </div>
      ) : null}
      {complete && !editing ? (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
          <span className="text-sm text-white font-medium">Venue Sec wallet set</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span className="text-gray-400">
            {editing
              ? 'Enter new bank details to replace this venue’s Sec wallet payout'
              : 'Venue payout setup missing'}
          </span>
        </div>
      )}
      {showForm ? (
        <>
          <BankFormFields bank={bank} setBank={setBank} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={saving || !selectedVenueId}
              onClick={save}
              className="w-full px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 bg-[var(--sec-accent)] text-black"
            >
              <Landmark className="w-4 h-4" />
              {saving ? 'Saving...' : editing ? 'Save new Sec wallet' : 'Save venue payout details'}
            </button>
            {editing ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setBank(EMPTY_BANK);
                  setEditing(false);
                }}
                className="w-full px-4 py-2.5 rounded-xl text-sm text-gray-400 border border-[#262629]"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setBank(EMPTY_BANK);
            setEditing(true);
          }}
          className="w-full px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 border border-[#262629] text-white hover:bg-[#1a1a1c]"
        >
          Update Sec wallet
        </button>
      )}
    </div>
  );
}
