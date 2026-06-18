import React, { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MOBILE_NAV_FLOATING_MARGIN } from '@/lib/layoutConstants';

export default function MobileBottomNav({
  items,
  isActive,
  compact = false,
  availableModes = [],
  onOpenModeSwitcher,
  onPrefetch,
}) {
  const navigate = useNavigate();
  const longPressTimerRef = useRef(null);

  return (
    <nav
      className="lg:hidden"
      style={{
        position: 'fixed',
        left: compact ? 24 : 16,
        right: compact ? 24 : 16,
        bottom: `calc(${MOBILE_NAV_FLOATING_MARGIN}px + env(safe-area-inset-bottom))`,
        zIndex: 50,
        transform: compact ? 'scale(0.92)' : 'scale(1)',
        transformOrigin: 'center bottom',
        transition: 'transform 0.22s ease, left 0.22s ease, right 0.22s ease',
        pointerEvents: 'auto',
      }}
      aria-label="Main navigation"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          height: compact ? 48 : 56,
          borderRadius: 9999,
          backgroundColor: 'rgba(10, 10, 11, 0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--sec-border)',
          boxShadow: compact ? '0 4px 20px rgba(0,0,0,0.35)' : '0 8px 32px rgba(0,0,0,0.45)',
          padding: compact ? '0 4px' : '0 6px',
          transition: 'height 0.22s ease, padding 0.22s ease, box-shadow 0.22s ease',
        }}
      >
        {items.map((item) => {
          const active = isActive(item.page);
          const isCreateTab = item.isCreate || (item.name === 'Create' && item.query === '?create=table');
          const isProfile = item.page === 'Profile';
          const to = item.navTo || (item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page));
          const iconSize = compact ? 20 : 22;

          const iconEl = isCreateTab ? (
            <div
              style={{
                width: compact ? 36 : 40,
                height: compact ? 36 : 40,
                borderRadius: 12,
                background: 'var(--sec-gradient-silver)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(192,192,192,0.2)',
                color: 'var(--sec-bg-base)',
                transition: 'width 0.22s ease, height 0.22s ease',
              }}
            >
              <item.icon size={compact ? 18 : 20} strokeWidth={2} />
            </div>
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <item.icon size={iconSize} strokeWidth={active ? 2 : 1.5} />
              {(item.page === 'Messages' || item.page === 'BusinessMessages' || item.page === 'HostDashboard') &&
              item.badge > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: 'var(--sec-accent)',
                    color: '#000',
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </div>
          );

          const inner = active && !isCreateTab && !compact ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 9999,
                backgroundColor: 'var(--sec-accent-muted)',
                border: '1px solid var(--sec-accent-border)',
              }}
            >
              {iconEl}
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sec-accent)', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isCreateTab ? 0 : compact ? '6px 8px' : '8px 10px' }}>
              {iconEl}
            </div>
          );

          const commonStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textDecoration: 'none',
            color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
          };

          if (isProfile) {
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => navigate(createPageUrl(item.page))}
                onPointerDown={() => onPrefetch?.(item.page)}
                onDoubleClick={() => availableModes.length > 1 && onOpenModeSwitcher?.()}
                onTouchStart={() => {
                  if (availableModes.length <= 1) return;
                  longPressTimerRef.current = window.setTimeout(() => onOpenModeSwitcher?.(), 450);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onTouchCancel={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                style={commonStyle}
              >
                {inner}
              </button>
            );
          }

          if (!item.page && item.isCreate) {
            return (
              <button
                key="create"
                type="button"
                onClick={() => navigate(createPageUrl('BusinessEvents'))}
                style={commonStyle}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={item.page + (item.query || '') + item.name}
              to={to}
              onMouseEnter={() => onPrefetch?.(item.page)}
              onFocus={() => onPrefetch?.(item.page)}
              style={commonStyle}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
