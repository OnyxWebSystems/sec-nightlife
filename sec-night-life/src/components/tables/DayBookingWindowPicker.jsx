import React, { useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function parseMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export default function DayBookingWindowPicker({
  venueWindow,
  value,
  onChange,
  compact = false,
}) {
  const start = value?.startTime || venueWindow?.startTime || '12:00';
  const end = value?.endTime || venueWindow?.endTime || '18:00';

  useEffect(() => {
    if (!value?.startTime && venueWindow?.startTime && venueWindow?.endTime) {
      onChange?.({ startTime: venueWindow.startTime, endTime: venueWindow.endTime });
    }
  }, [venueWindow?.startTime, venueWindow?.endTime]);

  const validation = useMemo(() => {
    const s = parseMinutes(start);
    const e = parseMinutes(end);
    const vs = parseMinutes(venueWindow?.startTime);
    const ve = parseMinutes(venueWindow?.endTime);
    if (s == null || e == null) return 'Enter valid times';
    if (e <= s) return 'End time must be after start time';
    if (e - s < 30) return 'Minimum booking is 30 minutes';
    if (vs != null && s < vs) return `Start must be from ${venueWindow.startTime}`;
    if (ve != null && e > ve) return `End must be by ${venueWindow.endTime}`;
    return null;
  }, [start, end, venueWindow]);

  if (!venueWindow) return null;

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{
        borderColor: 'var(--sec-border)',
        background: 'linear-gradient(145deg, var(--sec-bg-card) 0%, var(--sec-bg-elevated) 100%)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}
        >
          <Clock size={16} style={{ color: 'var(--sec-accent)' }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--sec-text-primary)]">Your time at the venue</p>
          <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
            Service window today: {venueWindow.startTime}–{venueWindow.endTime}. Choose when you want to arrive and leave.
          </p>
        </div>
      </div>

      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2'}`}>
        <div>
          <Label className="text-xs text-[var(--sec-text-muted)]">Arrive from</Label>
          <Input
            type="time"
            value={start}
            min={venueWindow.startTime}
            max={venueWindow.endTime}
            onChange={(e) => onChange?.({ startTime: e.target.value, endTime: end })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-[var(--sec-text-muted)]">Leave by</Label>
          <Input
            type="time"
            value={end}
            min={start || venueWindow.startTime}
            max={venueWindow.endTime}
            onChange={(e) => onChange?.({ startTime: start, endTime: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      {validation ? (
        <p className="text-xs text-red-400">{validation}</p>
      ) : (
        <p className="text-xs text-[var(--sec-text-muted)]">
          Booking: {start}–{end}
        </p>
      )}
    </div>
  );
}

export function isWindowValid(venueWindow, value) {
  if (!venueWindow || !value?.startTime || !value?.endTime) return false;
  const s = parseMinutes(value.startTime);
  const e = parseMinutes(value.endTime);
  const vs = parseMinutes(venueWindow.startTime);
  const ve = parseMinutes(venueWindow.endTime);
  if (s == null || e == null || vs == null || ve == null) return false;
  return e > s && e - s >= 30 && s >= vs && e <= ve;
}
