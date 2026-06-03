import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import SecLogo from '@/components/ui/SecLogo';
import { menuSelectionTotal, menuSelectionToPayload } from '@/components/menu/MenuPicker';

export default function CustomTableRequestModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
  venueMenuItems = [],
  selectedMenuItems = {},
}) {
  const [minSpendMode, setMinSpendMode] = useState('manual');
  const [form, setForm] = useState({
    guestCount: 4,
    preferredDate: '',
    preferredTime: '',
    proposedMinimumSpend: '',
    notes: '',
  });

  const menuPayload = useMemo(
    () => menuSelectionToPayload(venueMenuItems, selectedMenuItems),
    [venueMenuItems, selectedMenuItems],
  );

  const menuTotal = useMemo(() => {
    if (minSpendMode !== 'menu') return 0;
    return menuSelectionTotal(venueMenuItems, selectedMenuItems);
  }, [venueMenuItems, selectedMenuItems, minSpendMode]);

  const today = new Date().toISOString().slice(0, 10);

  if (!open) return null;

  const handleSubmit = () => {
    const selectedItems =
      minSpendMode === 'menu' && menuPayload.length > 0
        ? menuPayload.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
        : undefined;
    onSubmit?.({
      guestCount: form.guestCount,
      preferredDate: form.preferredDate || undefined,
      proposedMinimumSpend:
        minSpendMode === 'manual' && form.proposedMinimumSpend
          ? parseFloat(form.proposedMinimumSpend)
          : minSpendMode === 'menu' && menuTotal > 0
            ? menuTotal
            : undefined,
      notes: form.notes,
      preferredTime: form.preferredTime,
      minSpendMode,
      selectedMenuItems: selectedItems,
    });
  };

  const canSubmit =
    !submitting &&
    (minSpendMode === 'manual'
      ? Boolean(form.proposedMinimumSpend)
      : menuTotal > 0);

  return (
    <>
      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
          zIndex: 300,
          pointerEvents: 'none',
        }}
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
          padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
          maxHeight: 'min(52vh, 480px)',
          overflowY: 'auto',
          pointerEvents: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            background: 'var(--sec-gradient-silver)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 18px',
            marginBottom: 16,
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
            <SecLogo size={44} variant="mark" asset="transparent" className="custom-table-request-modal__logo" />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: 0 }}>Custom table request</h2>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', margin: 0 }}>
            Tell the venue what you need. They review before you pay.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', display: 'block', marginBottom: 8 }}>
                Preferred date
              </label>
              <input
                type="date"
                min={today}
                value={form.preferredDate}
                onChange={(e) => setForm((f) => ({ ...f, preferredDate: e.target.value }))}
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
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', marginBottom: 8 }}>Minimum spend</p>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                className="flex-1 text-xs py-2 rounded-full border"
                style={{
                  borderColor: minSpendMode === 'menu' ? 'var(--sec-accent-border)' : 'var(--sec-border)',
                  background: minSpendMode === 'menu' ? 'var(--sec-accent-muted)' : 'transparent',
                }}
                onClick={() => setMinSpendMode('menu')}
              >
                From menu
              </button>
              <button
                type="button"
                className="flex-1 text-xs py-2 rounded-full border"
                style={{
                  borderColor: minSpendMode === 'manual' ? 'var(--sec-accent-border)' : 'var(--sec-border)',
                  background: minSpendMode === 'manual' ? 'var(--sec-accent-muted)' : 'transparent',
                }}
                onClick={() => setMinSpendMode('manual')}
              >
                Type amount
              </button>
            </div>
            {minSpendMode === 'menu' ? (
              <div
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}
              >
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 8 }}>
                  Use the menu above to add or change items.
                </p>
                {menuPayload.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13 }}>
                    {menuPayload.map((line) => (
                      <li key={line.menuItemId} style={{ marginBottom: 4 }}>
                        {line.quantity}× {line.name}
                        {line.unitPrice > 0 ? ` · R${(line.unitPrice * line.quantity).toLocaleString('en-ZA')}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--sec-text-secondary)', margin: 0 }}>No items selected yet.</p>
                )}
                {menuTotal > 0 ? (
                  <p className="text-sm mt-2" style={{ color: 'var(--sec-accent)', fontWeight: 600, marginBottom: 0 }}>
                    Estimated total: R{menuTotal.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}
                  </p>
                ) : null}
              </div>
            ) : (
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
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--sec-text-secondary)', display: 'block', marginBottom: 8 }}>
              Notes for the venue
            </label>
            <Textarea
              rows={2}
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
            disabled={!canSubmit}
            className="sec-btn sec-btn-primary sec-btn-full"
            style={{ height: 48 }}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit request for review'}
          </button>
        </div>
      </div>
    </>
  );
}
