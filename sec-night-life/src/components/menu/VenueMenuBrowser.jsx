import React, { useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { groupMenuByCategory } from '@/lib/groupMenuByCategory';
import { menuSelectionTotal } from '@/components/menu/MenuPicker';

function normalizeItem(item) {
  return {
    ...item,
    image_url: item.image_url || item.imageUrl || null,
    price: Number(item.price) || 0,
  };
}

function QtyStepper({ qty, onDec, onInc, disabled }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        border: '1px solid var(--sec-border)',
        background: 'var(--sec-bg-elevated)',
        padding: '4px 6px',
      }}
    >
      <button
        type="button"
        disabled={disabled || qty <= 0}
        onClick={onDec}
        aria-label="Decrease quantity"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '1px solid var(--sec-border)',
          background: 'var(--sec-bg-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: qty <= 0 ? 0.35 : 1,
        }}
      >
        <Minus size={14} />
      </button>
      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{qty}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onInc}
        aria-label="Increase quantity"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--sec-accent)',
          color: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * Delivery-style venue menu: category chips, images, +/- quantities, sticky cart bar.
 */
export default function VenueMenuBrowser({
  items = [],
  selected = {},
  onChange,
  disabled = false,
  includedItems = [],
  minimumSpendZar = 0,
  onContinue,
  continueLabel = 'Continue to checkout',
}) {
  const sectionRefs = useRef({});
  const [activeCategory, setActiveCategory] = useState(null);

  const normalized = useMemo(() => items.map(normalizeItem), [items]);
  const sections = useMemo(() => groupMenuByCategory(normalized), [normalized]);
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

  const scrollToCategory = (category) => {
    setActiveCategory(category);
    sectionRefs.current[category]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

      {sections.length > 1 && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'var(--sec-bg-base)',
            paddingBottom: 10,
            marginBottom: 8,
            overflowX: 'auto',
            display: 'flex',
            gap: 8,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {sections.map(({ category }) => (
            <button
              key={category}
              type="button"
              onClick={() => scrollToCategory(category)}
              style={{
                flexShrink: 0,
                padding: '8px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${activeCategory === category ? 'var(--sec-accent)' : 'var(--sec-border)'}`,
                background: activeCategory === category ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                color: activeCategory === category ? 'var(--sec-accent)' : 'var(--sec-text-secondary)',
              }}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {sections.map(({ category, items: catItems }) => (
        <section
          key={category}
          ref={(el) => {
            sectionRefs.current[category] = el;
          }}
          style={{ marginBottom: 20 }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: 'var(--sec-text-primary)' }}>
            {category}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {catItems.map((item) => {
              const qty = Number(selected[item.id] || 0);
              return (
                <div
                  key={item.id}
                  className="sec-card"
                  style={{
                    padding: 12,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    opacity: disabled ? 0.6 : 1,
                  }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 12,
                        background: 'var(--sec-bg-hover)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{item.name}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sec-accent)' }}>
                      R{item.price.toFixed(0)}
                    </div>
                  </div>
                  <QtyStepper
                    qty={qty}
                    disabled={disabled}
                    onDec={() => onChange(item.id, Math.max(0, qty - 1))}
                    onInc={() => onChange(item.id, qty + 1)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {minSpend > 0 && (
        <div className="sec-card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--sec-text-muted)' }}>Minimum spend</span>
            <span style={{ fontWeight: 700, color: minMet ? 'var(--sec-success)' : 'var(--sec-text-primary)' }}>
              R{cartTotal.toFixed(0)} / R{minSpend.toFixed(0)}
            </span>
          </div>
          {!minMet && (
            <p style={{ fontSize: 11, color: 'var(--sec-warning)', marginTop: 8 }}>
              Add R{(minSpend - cartTotal).toFixed(0)} more from the menu to continue.
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
              style={{ height: 48 }}
              disabled={disabled || !minMet}
              onClick={onContinue}
            >
              {continueLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
