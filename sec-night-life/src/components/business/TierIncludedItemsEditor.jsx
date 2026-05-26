import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { filterMenuBySearch } from '@/lib/groupMenuHierarchy';

/**
 * Pick menu items included free with a table tier (venues configure; guests pay only for extras).
 */
export default function TierIncludedItemsEditor({
  includedItems = [],
  venueMenuItems = [],
  onChange,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const includedIds = useMemo(
    () => new Set((includedItems || []).map((x) => x.menu_item_id)),
    [includedItems],
  );

  const available = useMemo(
    () => filterMenuBySearch(venueMenuItems, search).filter((m) => !includedIds.has(m.id)),
    [venueMenuItems, search, includedIds],
  );

  const updateQty = (menuItemId, quantity) => {
    const q = Math.max(1, parseInt(String(quantity), 10) || 1);
    onChange(
      includedItems.map((x) => (x.menu_item_id === menuItemId ? { ...x, quantity: String(q) } : x)),
    );
  };

  const remove = (menuItemId) => {
    onChange(includedItems.filter((x) => x.menu_item_id !== menuItemId));
  };

  const add = (menuItemId) => {
    if (includedIds.has(menuItemId)) return;
    onChange([...includedItems, { menu_item_id: menuItemId, quantity: '1' }]);
    setPickerOpen(false);
    setSearch('');
  };

  if (!venueMenuItems.length) {
    return (
      <p className="text-xs text-[var(--sec-text-muted)]">Add menu items to your venue first.</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-[var(--sec-text-muted)]">
        Guests get these quantities included. They can still order anything from your full menu at checkout.
      </p>
      {(includedItems || []).map((inc) => {
        const row = venueMenuItems.find((m) => m.id === inc.menu_item_id);
        if (!row) return null;
        return (
          <div
            key={inc.menu_item_id}
            className="flex items-center gap-2 rounded-lg border p-2"
            style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}
          >
            <span className="text-xs flex-1 truncate">{row.name}</span>
            <input
              type="number"
              min={1}
              max={99}
              className="sec-input-rect h-8 w-14 text-xs"
              value={inc.quantity}
              onChange={(e) => updateQty(inc.menu_item_id, e.target.value)}
            />
            <button
              type="button"
              className="sec-btn sec-btn-ghost h-8 px-2"
              onClick={() => remove(inc.menu_item_id)}
              aria-label="Remove included item"
            >
              <Trash2 size={14} className="text-red-400" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="sec-btn sec-btn-ghost text-xs h-8 w-full"
        onClick={() => setPickerOpen((v) => !v)}
      >
        <Plus size={14} className="inline mr-1" />
        {pickerOpen ? 'Close' : 'Add item from menu'}
      </button>
      {pickerOpen ? (
        <div
          className="rounded-lg border p-2 space-y-2 max-h-40 overflow-y-auto"
          style={{ borderColor: 'var(--sec-border)' }}
        >
          <input
            type="search"
            placeholder="Search menu…"
            className="sec-input-rect h-8 w-full text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {available.length === 0 ? (
            <p className="text-xs text-[var(--sec-text-muted)]">No more items to add.</p>
          ) : (
            available.slice(0, 30).map((m) => (
              <button
                key={m.id}
                type="button"
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-[var(--sec-bg-hover)]"
                onClick={() => add(m.id)}
              >
                {m.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
