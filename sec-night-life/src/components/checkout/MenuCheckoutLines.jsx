import React from 'react';
import { menuSelectionToPayload } from '@/components/menu/MenuPicker';

/** Per-item menu rows for ticket/entrance checkout (name ×qty and line total). */
export default function MenuCheckoutLines({ items = [], selected = {} }) {
  const lines = menuSelectionToPayload(items, selected).filter((line) => Number(line.quantity) > 0);
  if (!lines.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      {lines.map((line) => {
        const qty = Number(line.quantity) || 1;
        const amount = Math.round(Number(line.unitPrice || 0) * qty * 100) / 100;
        return (
          <div
            key={line.menuItemId}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}
          >
            <span style={{ color: 'var(--sec-text-secondary)', minWidth: 0 }}>
              {line.name || 'Item'} ×{qty}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--sec-text-primary)', flexShrink: 0 }}>
              R{amount.toFixed(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
