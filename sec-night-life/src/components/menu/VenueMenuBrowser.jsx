import React from 'react';
import { menuSelectionTotal } from '@/components/menu/MenuPicker';
import VenueMenuNavigator from '@/components/menu/VenueMenuNavigator';

function normalizeItem(item) {
  return {
    ...item,
    image_url: item.image_url || item.imageUrl || null,
    price: Number(item.price) || 0,
  };
}

/**
 * Guest table checkout menu: navigator + min-spend progress + sticky cart bar.
 */
export default function VenueMenuBrowser({
  items = [],
  selected = {},
  onChange,
  disabled = false,
  includedItems = [],
  minimumSpendZar = 0,
  venueLogoUrl,
  onContinue,
  onPayMinimumLump,
  continueLabel = 'Continue to checkout',
}) {
  const normalized = items.map(normalizeItem);
  const cartTotal = menuSelectionTotal(normalized, selected, includedItems);
  const minSpend = Number(minimumSpendZar) || 0;
  const minMet = minSpend <= 0 || cartTotal >= minSpend;
  const itemCount = Object.values(selected).reduce((s, q) => s + (Number(q) > 0 ? Number(q) : 0), 0);

  if (!normalized.length && !includedItems.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
        This venue has not added menu items yet.
      </p>
    );
  }

  return (
    <div style={{ paddingBottom: 120 }}>
      {includedItems.length > 0 && (
        <div className="sec-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Included with your tier</div>
          {includedItems.map((inc, i) => (
            <div key={`inc-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              {inc.image_url ? (
                <img src={inc.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--sec-bg-hover)' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{inc.name}</div>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>×{inc.quantity} · included</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <VenueMenuNavigator
        items={normalized}
        mode="cart"
        selected={selected}
        onChange={onChange}
        disabled={disabled}
        venueLogoUrl={venueLogoUrl}
      />

      {minSpend > 0 && (
        <div className="sec-card" style={{ padding: 12, marginTop: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--sec-text-muted)' }}>Minimum spend</span>
            <span style={{ fontWeight: 700, color: minMet ? 'var(--sec-success)' : 'var(--sec-text-primary)' }}>
              R{cartTotal.toFixed(0)} / R{minSpend.toFixed(0)}
            </span>
          </div>
          {!minMet && (
            <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 8 }}>
              Add items from the menu, or pay the minimum upfront without selecting items.
            </p>
          )}
        </div>
      )}

      <div
        className="sec-bottom-bar"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(0,0,0,0.94)',
          borderTop: '1px solid var(--sec-border)',
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--sec-text-muted)' }}>
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>R{cartTotal.toFixed(0)}</span>
          </div>
          {onContinue ? (
            <button
              type="button"
              className="sec-btn sec-btn-primary sec-btn-full"
              style={{ height: 48, marginBottom: onPayMinimumLump ? 8 : 0 }}
              disabled={disabled || (minSpend > 0 && !minMet)}
              onClick={onContinue}
            >
              {continueLabel}
            </button>
          ) : null}
          {onPayMinimumLump ? (
            <button
              type="button"
              className="sec-btn sec-btn-ghost sec-btn-full"
              style={{ height: 44 }}
              disabled={disabled}
              onClick={onPayMinimumLump}
            >
              Pay R{minSpend.toFixed(0)} minimum without selecting items
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
