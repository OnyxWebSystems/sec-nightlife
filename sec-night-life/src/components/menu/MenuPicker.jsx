import React, { useMemo } from 'react';

const QTY_PRESETS = [1, 2, 3, 4];

export function menuSelectionTotal(items, selected, includedItems = []) {
  let sum = 0;
  for (const [id, qty] of Object.entries(selected || {})) {
    const item = items.find((m) => m.id === id);
    if (item) sum += Number(item.price) * Number(qty || 0);
  }
  for (const inc of includedItems) {
    sum += Number(inc.price || 0) * Number(inc.quantity || 0);
  }
  return sum;
}

export function menuSelectionToPayload(items, selected) {
  return Object.entries(selected || {})
    .filter(([, qty]) => Number(qty) > 0)
    .map(([menuItemId, quantity]) => {
      const item = items.find((m) => m.id === menuItemId);
      return {
        menuItemId,
        quantity: Number(quantity),
        unitPrice: item ? Number(item.price) : 0,
        name: item?.name || '',
        image_url: item?.image_url || null,
      };
    });
}

/**
 * @param {object} props
 * @param {Array<{ id: string, name: string, price: number, image_url?: string, category?: string }>} props.items
 * @param {Record<string, number>} props.selected
 * @param {(id: string, qty: number) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {Array<{ name: string, quantity: number, image_url?: string, price?: number }>} [props.includedItems]
 */
export default function MenuPicker({
  items = [],
  selected = {},
  onChange,
  disabled = false,
  includedItems = [],
}) {
  const grouped = useMemo(() => {
    const acc = {};
    for (const item of items) {
      const key = item.category || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
    }
    return acc;
  }, [items]);

  const cartTotal = menuSelectionTotal(items, selected, includedItems);

  if (!items.length && !includedItems.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
        This venue has not added menu items yet.
      </p>
    );
  }

  return (
    <div>
      {includedItems.length > 0 && (
        <div className="sec-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Included with your tier</div>
          {includedItems.map((inc, i) => (
            <div key={`inc-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              {inc.image_url ? (
                <img src={inc.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--sec-bg-hover)' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{inc.name}</div>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                  ×{inc.quantity}
                  {inc.price != null ? ` · R${Number(inc.price).toFixed(0)} each` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.entries(grouped).map(([category, catItems]) => (
        <div key={category} className="sec-card" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{category}</div>
          {catItems.map((item) => {
            const qty = Number(selected[item.id] || 0);
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 12,
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 8,
                      background: 'var(--sec-bg-hover)',
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--sec-accent)' }}>R{Number(item.price).toFixed(0)}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {QTY_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(item.id, qty === n ? 0 : n)}
                      className="sec-btn"
                      style={{
                        minWidth: 36,
                        height: 32,
                        padding: '0 8px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: qty === n ? 'var(--sec-accent)' : 'var(--sec-bg-elevated)',
                        color: qty === n ? '#000' : 'var(--sec-text-secondary)',
                        border: `1px solid ${qty === n ? 'var(--sec-accent)' : 'var(--sec-border)'}`,
                      }}
                    >
                      ×{n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div
        style={{
          marginTop: 8,
          padding: 12,
          borderRadius: 10,
          border: '1px solid var(--sec-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Selection total</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>R{cartTotal.toFixed(0)}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 12, textAlign: 'center' }}>
        Menu photos and descriptions are provided by the venue.
      </p>
    </div>
  );
}
