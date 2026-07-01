import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Crown, Users, Sparkles } from 'lucide-react';
import { buildPageUrl } from '@/utils';

function SlotRow({ label, sub, actionLabel, onAction, disabled, extra }) {
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
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', margin: 0 }}>{label}</p>
        {sub ? <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', margin: '4px 0 0' }}>{sub}</p> : null}
        {extra}
      </div>
      <button
        type="button"
        disabled={disabled}
        className="sec-btn sec-btn-primary"
        style={{ height: 36, padding: '0 14px', fontSize: 12, flexShrink: 0 }}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function OccupancyBlocks({ occupancy }) {
  if (!occupancy?.length) return null;
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {occupancy.map((o) => (
        <span
          key={`${o.startTime}-${o.endTime}-${o.hostedTableId}`}
          style={{
            fontSize: 11,
            color: 'var(--sec-text-muted)',
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--sec-border)',
          }}
        >
          Occupied {o.startTime}–{o.endTime}
          {o.hostedTable?.host?.username ? ` · ${o.hostedTable.host.username}` : ''}
        </span>
      ))}
    </div>
  );
}

export default function EventTableTierSheet({
  tier,
  open,
  onClose,
  customListingId,
  allowsCustomRequests,
  eventId,
  bookingWindow,
}) {
  const navigate = useNavigate();
  if (!open || !tier) return null;

  const windowQs =
    bookingWindow?.startTime && bookingWindow?.endTime
      ? { windowStart: bookingWindow.startTime, windowEnd: bookingWindow.endTime }
      : {};

  const hostableSlots = (tier.slots || []).filter((s) => s.canHost !== false);
  const joinableFromSessions = (tier.slots || []).flatMap((s) =>
    (s.joinableSessions || []).map((j) => ({
      ...j,
      tableName: s.tableName,
      venueTableId: s.venueTableId,
    })),
  );
  const isVip = tier.category === 'vip';

  const goVenue = (venueTableId, mode) => {
    if (!venueTableId) return;
    onClose?.();
    navigate(buildPageUrl('TableDetails', { id: venueTableId, source: 'venue', mode, ...windowQs }));
  };

  const goCustomRequest = () => {
    if (!customListingId) return;
    onClose?.();
    navigate(buildPageUrl('TableDetails', { id: customListingId, source: 'venue', request: '1', ...windowQs }));
  };

  const goHosted = (hostedTableId) => {
    onClose?.();
    navigate(buildPageUrl('TableDetails', { id: hostedTableId, source: 'hosted', ...windowQs }));
  };

  const showCustomTable = Boolean(
    customListingId && (allowsCustomRequests || tier.allowsCustomRequests),
  );

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
              {bookingWindow?.startTime && bookingWindow?.endTime
                ? `Your window ${bookingWindow.startTime}–${bookingWindow.endTime} · `
                : ''}
              Min spend R{Number(tier.minSpend).toLocaleString()}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--sec-text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {hostableSlots.length > 0 ? (
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
              {hostableSlots.map((s) => (
                <SlotRow
                  key={`host-${s.venueTableId}`}
                  label={s.tableName}
                  sub={
                    s.canHost === false
                      ? 'Already hosted during your selected time'
                      : `${tier.maxGuestsPerTable} guests max${Number(tier.hostBookingFeeZar) > 0 ? ` · Host fee R${Number(tier.hostBookingFeeZar).toLocaleString()}` : ''}`
                  }
                  extra={<OccupancyBlocks occupancy={s.occupancy} />}
                  actionLabel="Host"
                  disabled={s.canHost === false}
                  onAction={() => goVenue(s.venueTableId, 'host')}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section style={{ marginBottom: showCustomTable ? 20 : 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} /> Join a table
          </h3>

          {joinableFromSessions.length > 0 ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 8 }}>Hosted during your window</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {joinableFromSessions.map((j) => {
                  const ht = j.hostedTable;
                  const hostName = ht?.host?.username || ht?.host?.fullName || 'Host';
                  const joinLabel = ht?.isPublic ? 'Join' : 'Request';
                  const spotsLabel = `${ht?.spotsRemaining ?? 0} spots left`;
                  return (
                    <SlotRow
                      key={`hosted-${j.hostedTableId}`}
                      label={j.tableName || ht?.tableName}
                      sub={`${j.startTime}–${j.endTime} · Hosted by ${hostName} · ${spotsLabel}`}
                      actionLabel={joinLabel}
                      onAction={() => goHosted(j.hostedTableId)}
                    />
                  );
                })}
              </div>
            </>
          ) : null}

          {joinableFromSessions.length === 0 && hostableSlots.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', textAlign: 'center', padding: '16px 0' }}>
              No tables available for your selected time right now.
            </p>
          ) : null}
        </section>

        {showCustomTable ? (
          <section
            style={{
              marginTop: 8,
              padding: '16px 14px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(20, 20, 20, 0.6) 100%)',
            }}
          >
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} style={{ color: 'var(--sec-accent)' }} /> Custom table
            </h3>
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Request a bespoke table — guest count, minimum spend, and menu picks. The venue reviews before checkout.
            </p>
            <button
              type="button"
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={goCustomRequest}
            >
              <Sparkles size={16} />
              Request Custom Table
            </button>
          </section>
        ) : null}
      </div>
    </>
  );
}
