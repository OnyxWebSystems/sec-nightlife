import React from 'react';
import { Clock, CalendarDays } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { WEEKDAY_OPTIONS } from '@/lib/serviceSchedule';

export default function ServiceWeekdayPicker({ value, onChange }) {
  const selected = WEEKDAY_OPTIONS.filter((d) => value?.[d.key]?.enabled);

  const toggleDay = (key) => {
    const current = value?.[key];
    onChange({
      ...value,
      [key]: {
        enabled: !current?.enabled,
        startTime: current?.startTime || '19:00',
        endTime: current?.endTime || '23:00',
      },
    });
  };

  const updateTime = (key, field, next) => {
    onChange({
      ...value,
      [key]: {
        ...value[key],
        enabled: true,
        [field]: next,
      },
    });
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{
        borderColor: 'var(--sec-border)',
        background: 'linear-gradient(145deg, var(--sec-bg-card) 0%, var(--sec-bg-elevated) 100%)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}
        >
          <CalendarDays size={18} style={{ color: 'var(--sec-accent)' }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--sec-text-primary)]">Available days & hours</p>
          <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
            Select which days guests can host or join tables, then set the service window for each day.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {WEEKDAY_OPTIONS.map((day) => {
          const active = Boolean(value?.[day.key]?.enabled);
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => toggleDay(day.key)}
              className="flex flex-col items-center justify-center rounded-xl py-2.5 px-1 transition-all"
              style={{
                border: `1px solid ${active ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
                background: active
                  ? 'linear-gradient(180deg, var(--sec-accent-muted) 0%, rgba(0,0,0,0.15) 100%)'
                  : 'var(--sec-bg-card)',
                color: active ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                boxShadow: active ? '0 0 0 1px var(--sec-accent-border)' : 'none',
                transform: active ? 'translateY(-1px)' : 'none',
              }}
              aria-pressed={active}
            >
              <span className="text-[10px] uppercase tracking-wide font-bold">{day.label}</span>
            </button>
          );
        })}
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-center py-3 rounded-lg border border-dashed" style={{ borderColor: 'var(--sec-border)', color: 'var(--sec-text-muted)' }}>
          Tap at least one day above to open bookings.
        </p>
      ) : (
        <div className="space-y-2">
          {selected.map((day) => (
            <div
              key={day.key}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border px-3 py-3"
              style={{ borderColor: 'var(--sec-border)', background: 'var(--sec-bg-card)' }}
            >
              <div className="flex items-center gap-2 min-w-[108px]">
                <Clock size={14} style={{ color: 'var(--sec-accent)' }} />
                <span className="text-sm font-semibold text-[var(--sec-text-primary)]">{day.full}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 flex-1">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)]">Opens</Label>
                  <Input
                    type="time"
                    value={value[day.key].startTime}
                    onChange={(e) => updateTime(day.key, 'startTime', e.target.value)}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-[var(--sec-text-muted)]">Closes</Label>
                  <Input
                    type="time"
                    value={value[day.key].endTime}
                    onChange={(e) => updateTime(day.key, 'endTime', e.target.value)}
                    className="h-9 mt-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
