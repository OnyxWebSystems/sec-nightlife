import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TableTierEditor({ tiers = [], onChange, venueMenuItems = [], showSlots = false }) {
  const updateTier = (idx, patch) => {
    const next = tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange(next);
  };

  const addTier = () => {
    onChange([
      ...tiers,
      {
        tier_name: '',
        max_guests: '6',
        min_spend: '2000',
        booking_fee_zar: '0',
        host_table_fee_zar: '0',
        tier_table_slots: showSlots ? '1' : undefined,
        included_items: [],
      },
    ]);
  };

  return (
    <div className="space-y-3">
      {tiers.map((tier, idx) => (
        <div
          key={idx}
          className="rounded-xl border p-3 space-y-2"
          style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Tier {idx + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-400 h-8"
              onClick={() => onChange(tiers.filter((_, i) => i !== idx))}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Name</Label>
              <Input
                value={tier.tier_name || ''}
                onChange={(e) => updateTier(idx, { tier_name: e.target.value })}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max guests</Label>
              <Input
                type="number"
                min={1}
                value={tier.max_guests || ''}
                onChange={(e) => updateTier(idx, { max_guests: e.target.value })}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Min spend (ZAR)</Label>
              <Input
                value={tier.min_spend || ''}
                onChange={(e) => updateTier(idx, { min_spend: e.target.value })}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Guest booking fee (ZAR)</Label>
              <Input
                value={tier.booking_fee_zar ?? ''}
                onChange={(e) => updateTier(idx, { booking_fee_zar: e.target.value })}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Host table fee (ZAR)</Label>
              <Input
                value={tier.host_table_fee_zar ?? ''}
                onChange={(e) => updateTier(idx, { host_table_fee_zar: e.target.value })}
                className="h-9 mt-1"
              />
            </div>
            {showSlots ? (
              <div>
                <Label className="text-xs">Table slots</Label>
                <Input
                  value={tier.tier_table_slots || ''}
                  onChange={(e) => updateTier(idx, { tier_table_slots: e.target.value })}
                  className="h-9 mt-1"
                />
              </div>
            ) : null}
          </div>
          {venueMenuItems.length > 0 && (
            <div>
              <Label className="text-xs text-[var(--sec-text-muted)]">Included menu items (optional)</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {venueMenuItems.map((m) => {
                  const inc = (tier.included_items || []).find((x) => x.menu_item_id === m.id);
                  const on = Boolean(inc);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg border"
                      style={{
                        borderColor: on ? 'var(--sec-accent)' : 'var(--sec-border)',
                        backgroundColor: on ? 'var(--sec-accent-muted)' : 'transparent',
                      }}
                      onClick={() => {
                        let items = [...(tier.included_items || [])];
                        if (on) items = items.filter((x) => x.menu_item_id !== m.id);
                        else items.push({ menu_item_id: m.id, quantity: '1' });
                        updateTier(idx, { included_items: items });
                      }}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addTier} className="w-full">
        <Plus size={14} className="mr-1" /> Add tier
      </Button>
    </div>
  );
}
