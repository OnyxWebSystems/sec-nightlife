import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import SecLogo from '@/components/ui/SecLogo';

export default function CustomTableRequestModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const [form, setForm] = useState({
    guestCount: 4,
    preferredTime: '',
    proposedMinimumSpend: '',
    notes: '',
  });

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 300 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 'min(480px, calc(100vw - 32px))',
          zIndex: 301,
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          background: 'linear-gradient(180deg, #161616 0%, #000 100%)',
          border: '1px solid var(--sec-border)',
          borderBottom: 'none',
          padding: '24px 20px 32px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            background: 'var(--sec-gradient-silver)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 18px',
            marginBottom: 20,
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              background: 'rgba(0,0,0,0.35)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            <X size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <SecLogo
              size={44}
              variant="mark"
              asset="transparent"
              className="custom-table-request-modal__logo"
            />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: 0 }}>Custom table request</h2>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', margin: 0 }}>
            Tell the venue what you need. They review before you pay.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', display: 'block', marginBottom: 8 }}>
              Guest count
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={form.guestCount}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setForm((f) => ({
                  ...f,
                  guestCount: Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 1,
                }));
              }}
              className="w-full"
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--sec-border)',
                backgroundColor: 'var(--sec-bg-card)',
                color: 'var(--sec-text-primary)',
                fontSize: 14,
              }}
            />
            <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 6 }}>Up to 500 guests</p>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', display: 'block', marginBottom: 8 }}>
              Preferred time
            </label>
            <input
              type="time"
              value={form.preferredTime}
              onChange={(e) => setForm((f) => ({ ...f, preferredTime: e.target.value }))}
              className="w-full"
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--sec-border)',
                backgroundColor: 'var(--sec-bg-card)',
                color: 'var(--sec-text-primary)',
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', display: 'block', marginBottom: 8 }}>
              Your minimum spend (ZAR)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)', fontSize: 14 }}>R</span>
              <input
                type="number"
                min={0}
                value={form.proposedMinimumSpend}
                onChange={(e) => setForm((f) => ({ ...f, proposedMinimumSpend: e.target.value }))}
                placeholder="e.g. 5000"
                style={{
                  width: '100%',
                  height: 44,
                  padding: '0 14px 0 28px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--sec-border)',
                  backgroundColor: 'var(--sec-bg-card)',
                  color: 'var(--sec-text-primary)',
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', display: 'block', marginBottom: 8 }}>
              Notes for the venue
            </label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Seating preferences, occasion, special requests…"
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--sec-border)',
                backgroundColor: 'var(--sec-bg-card)',
                color: 'var(--sec-text-primary)',
              }}
            />
          </div>

          <button
            type="button"
            disabled={submitting}
            className="sec-btn sec-btn-primary sec-btn-full"
            style={{ height: 48, marginTop: 4 }}
            onClick={() =>
              onSubmit?.({
                guestCount: form.guestCount,
                proposedMinimumSpend: form.proposedMinimumSpend ? parseFloat(form.proposedMinimumSpend) : undefined,
                notes: form.notes,
                preferredTime: form.preferredTime,
              })
            }
          >
            {submitting ? 'Submitting…' : 'Submit request for review'}
          </button>
        </div>
      </div>
    </>
  );
}
