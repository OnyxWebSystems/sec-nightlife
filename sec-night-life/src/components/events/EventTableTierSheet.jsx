import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Crown, Users } from 'lucide-react';
import { createPageUrl } from '@/utils';

function SlotRow({ label, sub, actionLabel, onAction, disabled }) {
  return (
    <div
      className="sec-card"
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        border: '1px solid var(--sec-border)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', margin: 0 }}>{label}</p>
        {sub ? <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', margin: '4px 0 0' }}>{sub}</p> : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        className="sec-btn sec-btn-ghost"
        style={{ height: 36, padding: '0 14px', fontSize: 12, flexShrink: 0 }}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default function EventTableTierSheet({ tier, open, onClose }) {
  const navigate = useNavigate();
  if (!open || !tier) return null;

  const unhostedSlots = (tier.slots || []).filter((s) => !s.isHosted && s.spotsRemaining > 0);
  const hostedSlots = (tier.slots || []).filter((s) => s.isHosted && s.hostedTable && s.hostedTable.spotsRemaining > 0);
  const isVip = tier.category === 'vip';

  const goVenue = (venueTableId, mode) => {
    if (!venueTableId) return;
    onClose?.();
    navigate(createPageUrl(`TableDetails?id=${encodeURIComponent(venueTableId)}&source=venue&mode=${mode}`));
  };

  const goHosted = (hostedTableId) => {
    onClose?.();
    navigate(createPageUrl(`TableDetails?id=${encodeURIComponent(hostedTableId)}&source=hosted`));
  };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          maxHeight: '85vh',
          overflowY: 'auto',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          background: 'linear-gradient(180deg, #141414 0%, #000 100%)',
          border: '1px solid var(--sec-border)',
          borderBottom: 'none',
          padding: '20px 16px 32px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sec-text-primary)', margin: 0 }}>
                {tier.tierName}
              </h2>
              {isVip ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}>
                  <Crown size={10} /> VIP
                </span>
              ) : null}
            </div>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 6 }}>
              Min spend R{Number(tier.minSpend).toLocaleString()} · {tier.totalSpotsRemaining} spots left in tier
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--sec-text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {unhostedSlots.length > 0 ? (
          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crown size={14} /> Host a table
            </h3>
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 10 }}>
              {Number(tier.hostBookingFeeZar) > 0
                ? `Pay the host booking fee (R${Number(tier.hostBookingFeeZar).toLocaleString()}), `
                : ''}
              meet minimum spend, and set your table rules.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unhostedSlots.map((s) => (
                <SlotRow
                  key={`host-${s.venueTableId}`}
                  label={s.tableName}
                  sub={`${s.spotsRemaining} spots left${Number(tier.hostBookingFeeZar) > 0 ? ` · Host fee R${Number(tier.hostBookingFeeZar).toLocaleString()}` : ''}`}
                  actionLabel="Host"
                  onAction={() => goVenue(s.venueTableId, 'host')}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} /> Join a table
          </h3>

          {hostedSlots.length > 0 ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 8 }}>Hosted by others</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {hostedSlots.map((s) => {
                  const ht = s.hostedTable;
                  const hostName = ht.host?.username || ht.host?.fullName || 'Host';
                  const joinLabel = ht.isPublic ? 'Join' : 'Request';
                  const feeNote = ht.hasJoiningFee && ht.joiningFee ? ` · Join fee R${Number(ht.joiningFee).toLocaleString()}` : '';
                  return (
                    <SlotRow
                      key={`hosted-${ht.id}`}
                      label={ht.tableName}
                      sub={`Hosted by ${hostName} · ${ht.spotsRemaining} spots left${feeNote}`}
                      actionLabel={joinLabel}
                      onAction={() => goHosted(ht.id)}
                    />
                  );
                })}
              </div>
            </>
          ) : null}

          {unhostedSlots.length > 0 ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 8 }}>Venue spots (not hosted yet)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unhostedSlots.map((s) => (
                  <SlotRow
                    key={`join-${s.venueTableId}`}
                    label={s.tableName}
                    sub={`${s.spotsRemaining} spots left${Number(tier.joinBookingFeeZar) > 0 ? ` · Join fee R${Number(tier.joinBookingFeeZar).toLocaleString()}` : ''}`}
                    actionLabel="Join"
                    onAction={() => goVenue(s.venueTableId, 'join')}
                  />
                ))}
              </div>
            </>
          ) : null}

          {unhostedSlots.length === 0 && hostedSlots.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', textAlign: 'center', padding: '16px 0' }}>
              No tables available in this tier right now.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
