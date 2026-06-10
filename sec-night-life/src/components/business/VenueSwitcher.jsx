import React from 'react';
import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActiveVenueOptional } from '@/context/ActiveVenueContext';
import { asArray } from '@/utils';

export default function VenueSwitcher({ className = '' }) {
  const ctx = useActiveVenueOptional();
  const venues = asArray(ctx?.venues);
  if (!ctx || venues.length <= 1) {
    if (!ctx?.activeVenue) return null;
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: 'var(--sec-text-muted)',
        }}
      >
        <Building2 size={14} />
        <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{ctx.activeVenue.name}</span>
      </div>
    );
  }

  const { activeVenueId, setActiveVenueId } = ctx;

  return (
    <div className={className} style={{ minWidth: 160, maxWidth: 280 }}>
      <Select value={String(activeVenueId || '')} onValueChange={setActiveVenueId}>
        <SelectTrigger
          className="w-full"
          style={{
            background: 'var(--sec-bg-elevated)',
            borderColor: 'var(--sec-border)',
            color: 'var(--sec-text-primary)',
            height: 36,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <Building2 size={14} style={{ flexShrink: 0, color: 'var(--sec-accent)' }} />
            <SelectValue placeholder="Select venue" />
          </div>
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)] w-[var(--radix-select-trigger-width)]"
        >
          {venues.map((v) => (
            <SelectItem
              key={v.id}
              value={String(v.id)}
              className="text-[var(--sec-text-primary)] focus:bg-[var(--sec-bg-elevated)]"
            >
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
