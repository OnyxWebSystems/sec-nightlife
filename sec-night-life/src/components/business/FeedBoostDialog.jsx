import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
 * Day-slider boost checkout dialog (same UX idea as Business Promotions).
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
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              Boost · {days} day{days === 1 ? '' : 's'}
            </span>
            <span className="font-semibold">R{total}</span>
          </div>
          <input
            type="range"
            min={1}
            max={safeMax}
            value={Math.min(Math.max(1, days), safeMax)}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="w-full"
            style={{ accentColor: 'var(--sec-warning)' }}
          />
          <p className="text-xs text-[var(--sec-text-muted)]">
            R{FEED_BOOST_ZAR_PER_DAY}/day · max {safeMax} day{safeMax === 1 ? '' : 's'} until this
            listing ends
          </p>
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm?.(days)} disabled={busy}>
            {busy ? 'Starting…' : `Pay R${total}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
