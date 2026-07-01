import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Crown, Users, Sparkles, ChevronLeft } from 'lucide-react';
import { buildPageUrl } from '@/utils';
import { apiGet } from '@/api/client';
import { toast } from 'sonner';
import DayBookingWindowPicker, { isWindowValid } from '@/components/tables/DayBookingWindowPicker';

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
  venueWindow,
  venueId,
  onRefetchTiers,
}) {
  const navigate = useNavigate();
  const [pickTarget, setPickTarget] = useState(null);
  const [bookingWindow, setBookingWindow] = useState(null);

  const { data: windowedTierData } = useQuery({
    queryKey: ['venue-day-table-tier-window', venueId, tier?.tierKey, bookingWindow?.startTime, bookingWindow?.endTime],
    queryFn: () => {
      const qs = new URLSearchParams({
        windowStart: bookingWindow.startTime,
        windowEnd: bookingWindow.endTime,
      });
      return apiGet(`/api/venues/${venueId}/day-table-tiers?${qs.toString()}`);
    },
    enabled: Boolean(open && venueId && tier?.tierKey && bookingWindow?.startTime && bookingWindow?.endTime),
  });

  const windowedTier =
    windowedTierData?.tiers?.find((t) => t.tierKey === tier?.tierKey) || tier;

  const handleClose = () => {
    setPickTarget(null);
    setBookingWindow(null);
    onClose?.();
  };

  if (!open || !tier) return null;

  const activeTier = pickTarget && isWindowValid(venueWindow, bookingWindow) ? windowedTier : tier;
  const slots = activeTier?.slots || tier.slots || [];

  const joinableVenueSlots = slots.filter((s) => s.canHost !== false);
  const joinableFromSessions = slots.flatMap((s) =>
    (s.joinableSessions || []).map((j) => ({
      ...j,
      tableName: s.tableName,
      venueTableId: s.venueTableId,
    })),
  );
  const isVip = tier.category === 'vip';
  const windowReady = isWindowValid(venueWindow, bookingWindow);

  const finishAndNavigate = () => {
    if (!pickTarget || !windowReady) {
      toast.error('Choose a valid arrival and leave time');
      return;
    }
    const windowQs = {
      windowStart: bookingWindow.startTime,
      windowEnd: bookingWindow.endTime,
    };
    onRefetchTiers?.();
    handleClose();
    if (pickTarget.type === 'venue') {
      navigate(buildPageUrl('TableDetails', {
        id: pickTarget.venueTableId,
        source: 'venue',
        mode: pickTarget.mode,
        ...windowQs,
      }));
    } else if (pickTarget.type === 'hosted') {
      navigate(buildPageUrl('TableDetails', {
        id: pickTarget.hostedTableId,
        source: 'hosted',
        ...windowQs,
      }));
    }
  };

  const goCustomRequest = () => {
    if (!customListingId) return;
    handleClose();
    navigate(buildPageUrl('TableDetails', { id: customListingId, source: 'venue', request: '1' }));
  };

  const showCustomTable = Boolean(
    customListingId && (allowsCustomRequests || tier.allowsCustomRequests),
  );

  if (pickTarget) {
    const slot =
      pickTarget.type === 'venue'
        ? slots.find((s) => s.venueTableId === pickTarget.venueTableId)
        : null;
    const blocked =
      pickTarget.type === 'venue' &&
      pickTarget.mode === 'host' &&
      slot &&
      slot.canHost === false;

    return (
      <>
        <div role="presentation" onClick={handleClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 200 }} />
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
            padding: '20px 16px 32px',
          }}
        >
          <button
            type="button"
            className="sec-btn sec-btn-ghost sec-btn-sm mb-4"
            onClick={() => {
              setPickTarget(null);
              setBookingWindow(null);
            }}
          >
            <ChevronLeft size={16} /> Back to tables
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sec-text-primary)', margin: '0 0 8px' }}>
            Pick your time
          </h2>
          <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 16 }}>
            {pickTarget.type === 'venue'
              ? `${pickTarget.mode === 'host' ? 'Hosting' : 'Joining'} ${slot?.tableName || 'table'}`
              : 'Joining a hosted table'}
          </p>

          <DayBookingWindowPicker
            venueWindow={venueWindow}
            value={bookingWindow}
            onChange={setBookingWindow}
            compact
          />

          {blocked ? (
            <p style={{ fontSize: 12, color: '#f87171', marginTop: 12 }}>
              This table is already hosted during your selected time. Choose a different time or table.
            </p>
          ) : null}

          <button
            type="button"
            className="sec-btn sec-btn-primary sec-btn-full mt-4"
            style={{ height: 46 }}
            disabled={!windowReady || blocked}
            onClick={finishAndNavigate}
          >
            Continue to checkout
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        role="presentation"
        onClick={handleClose}
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
              {venueWindow ? `Open today ${venueWindow.startTime}–${venueWindow.endTime} · ` : ''}
              Min spend R{Number(tier.minSpend).toLocaleString()}
            </p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--sec-text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 16 }}>
          Choose a table below, then pick your arrival and leave time.
        </p>

        {slots.length > 0 ? (
          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crown size={14} /> Host a table
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slots.map((s) => (
                <SlotRow
                  key={`host-${s.venueTableId}`}
                  label={s.tableName}
                  sub={
                    s.occupancy?.length
                      ? `${s.occupancy.length} booking(s) today — pick your time next`
                      : `${tier.maxGuestsPerTable} guests max · Available to host`
                  }
                  extra={<OccupancyBlocks occupancy={s.occupancy} />}
                  actionLabel="Host"
                  disabled={false}
                  onAction={() => setPickTarget({ type: 'venue', venueTableId: s.venueTableId, mode: 'host' })}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section style={{ marginBottom: joinableFromSessions.length > 0 ? 20 : 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} /> Join without a host
          </h3>

          {joinableVenueSlots.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: joinableFromSessions.length > 0 ? 16 : 0 }}>
              {joinableVenueSlots.map((s) => (
                <SlotRow
                  key={`join-venue-${s.venueTableId}`}
                  label={s.tableName}
                  sub={`${tier.maxGuestsPerTable} guests max · Book your own spot — no host required`}
                  actionLabel="Join"
                  onAction={() => setPickTarget({ type: 'venue', venueTableId: s.venueTableId, mode: 'join' })}
                />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: joinableFromSessions.length > 0 ? 16 : 0 }}>
              All tables in this tier are currently hosted. Join a host&apos;s table below or pick another tier.
            </p>
          )}
        </section>

        {joinableFromSessions.length > 0 ? (
        <section style={{ marginBottom: showCustomTable ? 20 : 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} /> Join a hosted table
          </h3>

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
                    onAction={() => setPickTarget({ type: 'hosted', hostedTableId: j.hostedTableId })}
                  />
                );
              })}
          </div>
        </section>
        ) : null}

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
