import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  MIN_WINDOW_MINUTES,
  SLOT_STEP_MINUTES,
  buildTimelineSegments,
  defaultWindowFromGaps,
  formatDurationLabel,
  formatWindowLabel,
  latestBookableEndTime,
  listTimeOptionsInGap,
  validateBookingWindow,
  findGapContainingWindow,
} from '@/lib/dayBookingSlotUtils';

export { isWindowValid } from '@/lib/dayBookingSlotUtils';

function TimeSelect({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <Label className="text-xs text-[var(--sec-text-muted)]">{label}</Label>
      <select
        value={value || ''}
        disabled={disabled || !options.length}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 rounded-lg border px-3 text-sm bg-[var(--sec-bg-elevated)] text-[var(--sec-text-primary)]"
        style={{ borderColor: 'var(--sec-border)' }}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function DayBookingTimeSlotPicker({
  venueWindow,
  value,
  onChange,
  occupancy = [],
  availableGaps = [],
  serviceDay,
  latestBookableEnd: latestBookableEndProp,
  isOvernight = false,
  mode = 'host',
  readOnly = false,
  compact = false,
}) {
  const latestBookableEnd = latestBookableEndProp || latestBookableEndTime(venueWindow);
  const gaps = availableGaps?.length
    ? availableGaps
    : [];

  const [activeGap, setActiveGap] = useState(null);

  useEffect(() => {
    if (!venueWindow || readOnly || value?.startTime) return;
    const initial = defaultWindowFromGaps(gaps, venueWindow);
    if (initial) {
      onChange?.(initial);
      const gap = findGapContainingWindow(gaps, initial.startTime, initial.endTime, venueWindow);
      if (gap) setActiveGap(gap);
    }
  }, [venueWindow?.startTime, venueWindow?.endTime, gaps.length]);

  useEffect(() => {
    if (!value?.startTime || !value?.endTime || !venueWindow) return;
    const gap = findGapContainingWindow(gaps, value.startTime, value.endTime, venueWindow);
    if (gap) setActiveGap(gap);
  }, [value?.startTime, value?.endTime, gaps, venueWindow]);

  const validation = useMemo(
    () => validateBookingWindow(value, venueWindow, occupancy, { mode }),
    [value, venueWindow, occupancy, mode],
  );

  const { segments, ticks } = useMemo(
    () => buildTimelineSegments(venueWindow, occupancy, value, latestBookableEnd),
    [venueWindow, occupancy, value, latestBookableEnd],
  );

  const startOptions = useMemo(() => {
    if (!activeGap) return [];
    const all = listTimeOptionsInGap(activeGap, SLOT_STEP_MINUTES);
    const endM = value?.endTime
      ? parseInt(value.endTime.split(':')[0], 10) * 60 + parseInt(value.endTime.split(':')[1], 10)
      : null;
    return all.filter((t) => {
      if (endM == null) return true;
      const tm = parseInt(t.split(':')[0], 10) * 60 + parseInt(t.split(':')[1], 10);
      let em = endM;
      let sm = tm;
      if (em <= sm) return false;
      return em - sm >= MIN_WINDOW_MINUTES;
    });
  }, [activeGap, value?.endTime]);

  const endOptions = useMemo(() => {
    if (!activeGap || !value?.startTime) return [];
    const all = listTimeOptionsInGap(activeGap, SLOT_STEP_MINUTES);
    const startM = parseInt(value.startTime.split(':')[0], 10) * 60 + parseInt(value.startTime.split(':')[1], 10);
    return all.filter((t) => {
      const tm = parseInt(t.split(':')[0], 10) * 60 + parseInt(t.split(':')[1], 10);
      let em = tm;
      let sm = startM;
      if (em <= sm) em += 1440;
      if (sm < startM) sm += 1440;
      return em - sm >= MIN_WINDOW_MINUTES;
    });
  }, [activeGap, value?.startTime]);

  if (!venueWindow) return null;

  const dayLabel = serviceDay?.label || 'Today';
  const serviceLabel = formatWindowLabel(venueWindow.startTime, venueWindow.endTime, isOvernight);

  if (readOnly && value?.startTime && value?.endTime) {
    return (
      <div
        className="rounded-xl border p-4"
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
            <p className="text-sm font-semibold text-[var(--sec-text-primary)]">Table time</p>
            <p className="text-sm text-[var(--sec-accent)] mt-1 font-medium">
              {value.startTime} – {value.endTime}
              {isOvernight ? ' (+1)' : ''}
            </p>
            <p className="text-xs text-[var(--sec-text-muted)] mt-1">
              Joining during the host&apos;s booking window
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleGapSelect = (gap) => {
    setActiveGap(gap);
    const initial = defaultWindowFromGaps([gap], venueWindow, { defaultDurationMinutes: 120 });
    if (initial) onChange?.(initial);
  };

  return (
    <div
      className={`rounded-xl border space-y-4 ${compact ? 'p-3' : 'p-4'}`}
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
          <p className="text-sm font-semibold text-[var(--sec-text-primary)]">
            {dayLabel} · Service {serviceLabel}
          </p>
          <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
            {mode === 'host' ? 'Choose when you will host this table' : 'Choose when you will join'}
            {latestBookableEnd ? ` · Last booking ends by ${latestBookableEnd}` : ''}
          </p>
        </div>
      </div>

      {gaps.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--sec-text-secondary)]">Available periods</p>
          <div className="flex flex-wrap gap-2">
            {gaps.map((gap) => {
              const isActive =
                activeGap?.startTime === gap.startTime && activeGap?.endTime === gap.endTime;
              return (
                <button
                  key={`${gap.startTime}-${gap.endTime}`}
                  type="button"
                  onClick={() => handleGapSelect(gap)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    border: `1px solid ${isActive ? 'var(--sec-accent)' : 'var(--sec-border)'}`,
                    background: isActive ? 'var(--sec-accent-muted)' : 'var(--sec-bg-base)',
                    color: isActive ? 'var(--sec-accent)' : 'var(--sec-text-secondary)',
                  }}
                >
                  {gap.startTime} – {gap.endTime}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-400">No available time slots on this table today.</p>
      )}

      <div className="space-y-2">
        <div
          className="relative h-10 rounded-lg overflow-hidden"
          style={{ background: 'var(--sec-bg-base)', border: '1px solid var(--sec-border)' }}
        >
          {segments
            .filter((s) => s.type === 'booked')
            .map((seg, i) => (
              <div
                key={`booked-${i}`}
                title={seg.spotsRemaining != null ? `Booked · ${seg.spotsRemaining} spots left` : seg.label}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${seg.left}%`,
                  width: `${Math.max(seg.width, 1)}%`,
                  background:
                    'repeating-linear-gradient(-45deg, rgba(239,68,68,0.35), rgba(239,68,68,0.35) 4px, rgba(239,68,68,0.15) 4px, rgba(239,68,68,0.15) 8px)',
                  borderRight: '1px solid rgba(239,68,68,0.4)',
                }}
              />
            ))}
          {segments
            .filter((s) => s.type === 'selected')
            .map((seg, i) => (
              <div
                key={`selected-${i}`}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${seg.left}%`,
                  width: `${Math.max(seg.width, 2)}%`,
                  background: 'var(--sec-accent-muted)',
                  border: '1px solid var(--sec-accent)',
                  borderRadius: 4,
                }}
              />
            ))}
        </div>
        <div className="relative h-4 text-[10px] text-[var(--sec-text-muted)]">
          {ticks.map((tick) => (
            <span
              key={tick.time}
              className="absolute -translate-x-1/2"
              style={{ left: `${tick.pct}%` }}
            >
              {tick.time}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-[var(--sec-text-muted)]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.4)' }} />
            Booked
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent)' }}
            />
            Your booking
          </span>
        </div>
      </div>

      {occupancy.length > 0 ? (
        <div className="space-y-2">
          {occupancy.map((o) => (
            <div
              key={o.hostedTableId || `${o.startTime}-${o.endTime}`}
              className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--sec-bg-base)', border: '1px solid var(--sec-border)' }}
            >
              <Users size={12} style={{ color: 'var(--sec-text-muted)' }} />
              <span className="text-[var(--sec-text-secondary)]">
                Booked {o.startTime}–{o.endTime}
                {o.hostName ? ` · ${o.hostName}` : ''}
                {o.spotsRemaining != null ? ` · ${o.spotsRemaining} spots left` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {activeGap ? (
        <div className="grid grid-cols-2 gap-3">
          <TimeSelect
            label="Arrive from"
            value={value?.startTime}
            options={startOptions.length ? startOptions : listTimeOptionsInGap(activeGap)}
            onChange={(startTime) => onChange?.({ startTime, endTime: value?.endTime || activeGap.endTime })}
          />
          <TimeSelect
            label="Leave by"
            value={value?.endTime}
            options={endOptions.length ? endOptions : listTimeOptionsInGap(activeGap)}
            onChange={(endTime) => onChange?.({ startTime: value?.startTime || activeGap.startTime, endTime })}
          />
        </div>
      ) : null}

      {validation ? (
        <p className="text-xs text-red-400">{validation}</p>
      ) : value?.startTime && value?.endTime ? (
        <p className="text-xs text-[var(--sec-text-muted)]">
          Your booking: {value.startTime} – {value.endTime}
          {formatDurationLabel(value.startTime, value.endTime, venueWindow)
            ? ` (${formatDurationLabel(value.startTime, value.endTime, venueWindow)})`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
