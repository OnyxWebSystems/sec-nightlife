import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SecLogo from '@/components/ui/SecLogo';

export const FEED_BOOST_ZAR_PER_DAY = 150;
export const FEED_BOOST_MAX_DAYS = 30;

/** Ceiling of days from now until endAt (ISO/date), capped 1–30. */
export function maxBoostDaysUntil(endAt) {
  if (!endAt) return FEED_BOOST_MAX_DAYS;
  const end = endAt instanceof Date ? endAt : new Date(endAt);
  if (Number.isNaN(end.getTime())) return FEED_BOOST_MAX_DAYS;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.min(FEED_BOOST_MAX_DAYS, Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000))));
}

/**
 * Day-slider boost checkout dialog — SEC silver theme + watermark logo.
 */
export default function FeedBoostDialog({
  open,
  onOpenChange,
  title = 'Boost in Home feed',
  description = 'Boosted listings appear more often for nearby users.',
  maxDays = 7,
  busy = false,
  onConfirm,
}) {
  const safeMax = Math.max(1, Math.min(FEED_BOOST_MAX_DAYS, maxDays || 1));
  const [days, setDays] = useState(Math.min(3, safeMax));

  useEffect(() => {
    if (open) setDays(Math.min(3, safeMax));
  }, [open, safeMax]);

  const total = useMemo(() => days * FEED_BOOST_ZAR_PER_DAY, [days]);

  if (maxDays < 1) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--sec-text-muted)]">
            This listing window has ended, so it cannot be boosted.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[110]"
        className="z-[110] bg-[var(--sec-bg-card)] border-[var(--sec-border)] max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--sec-text-muted)] mb-4">{description}</p>

        <div
          className="relative overflow-hidden rounded-2xl border p-4 space-y-3"
          style={{
            borderColor: 'var(--sec-accent-border)',
            background:
              'linear-gradient(145deg, rgba(184,184,184,0.08) 0%, var(--sec-bg-elevated) 45%, rgba(184,184,184,0.04) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div style={{ opacity: 0.07, transform: 'scale(2.2)' }}>
              <SecLogo size={72} asset="transparent" variant="mark" />
            </div>
          </div>

          <div className="relative flex justify-between items-baseline gap-3 text-sm">
            <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>
              Boost · {days} day{days === 1 ? '' : 's'}
            </span>
            <span style={{ color: 'var(--sec-accent-bright)', fontWeight: 700, fontSize: 16 }}>
              R{total}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={safeMax}
            value={Math.min(Math.max(1, days), safeMax)}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="relative w-full"
            style={{ accentColor: 'var(--sec-accent, #B8B8B8)' }}
          />

          <p className="relative text-xs" style={{ color: 'var(--sec-text-muted)' }}>
            R{FEED_BOOST_ZAR_PER_DAY}/day · silver priority in the Home feed · max {safeMax} day
            {safeMax === 1 ? '' : 's'} until this listing ends
          </p>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm?.(days)}
            disabled={busy}
            style={{ backgroundColor: 'var(--sec-accent)', color: '#000', fontWeight: 650 }}
          >
            {busy ? 'Starting…' : `Pay R${total}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
