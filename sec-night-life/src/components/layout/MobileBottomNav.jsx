import React, { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MOBILE_NAV_FLOATING_MARGIN } from '@/lib/layoutConstants';

export default function MobileBottomNav({
  items,
  isActive,
  hidden = false,
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
        left: 16,
        right: 16,
        bottom: `calc(${MOBILE_NAV_FLOATING_MARGIN}px + env(safe-area-inset-bottom))`,
        zIndex: 50,
        transform: hidden ? 'translateY(calc(100% + 24px))' : 'translateY(0)',
        transition: 'transform 0.22s ease',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
      aria-hidden={hidden}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          height: 56,
          borderRadius: 9999,
          backgroundColor: 'rgba(10, 10, 11, 0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--sec-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          padding: '0 6px',
        }}
      >
        {items.map((item) => {
          const active = isActive(item.page);
          const isCreateTab = item.isCreate || (item.name === 'Create' && item.query === '?create=table');
          const isProfile = item.page === 'Profile';
          const to = item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page);

          const iconEl = isCreateTab ? (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--sec-gradient-silver)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(192,192,192,0.2)',
                color: 'var(--sec-bg-base)',
              }}
            >
              <item.icon size={20} strokeWidth={2} />
            </div>
          ) : (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <item.icon size={22} strokeWidth={active ? 2 : 1.5} />
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

          const inner = active && !isCreateTab ? (
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isCreateTab ? 0 : '8px 10px' }}>
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
