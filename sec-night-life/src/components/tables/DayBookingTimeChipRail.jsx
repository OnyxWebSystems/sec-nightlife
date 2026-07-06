import React, { useEffect, useRef } from 'react';

/**
 * Horizontally scrollable time chip rail with auto-scroll to selected value.
 */
export default function DayBookingTimeChipRail({
  label,
  options = [],
  value,
  onChange,
  disabled = false,
}) {
  const scrollRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    if (!selectedRef.current || !scrollRef.current) return;
    const container = scrollRef.current;
    const chip = selectedRef.current;
    const chipLeft = chip.offsetLeft;
    const chipWidth = chip.offsetWidth;
    const containerWidth = container.offsetWidth;
    const targetScroll = chipLeft - containerWidth / 2 + chipWidth / 2;
    container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [value, options.length]);

  if (!options.length) return null;

  return (
    <div className="space-y-2">
      {label ? (
        <p className="text-xs font-medium tracking-wide text-[var(--sec-text-secondary)]">{label}</p>
      ) : null}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {options.map((time) => {
          const isActive = value === time;
          return (
            <button
              key={time}
              ref={isActive ? selectedRef : null}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(time)}
              className="flex-shrink-0 rounded-full px-4 text-sm font-medium transition-all duration-150"
              style={{
                minHeight: 44,
                minWidth: 64,
                border: `1px solid ${isActive ? 'var(--sec-accent)' : 'var(--sec-border)'}`,
                background: isActive ? 'var(--sec-accent-muted)' : 'var(--sec-bg-base)',
                color: isActive ? 'var(--sec-accent-bright)' : 'var(--sec-text-secondary)',
                boxShadow: isActive ? '0 0 0 1px var(--sec-accent-border)' : 'none',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {time}
            </button>
          );
        })}
      </div>
    </div>
  );
}
