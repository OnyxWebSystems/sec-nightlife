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
  onOpenMore,
  moreActive = false,
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
        transform: hidden ? 'translateY(calc(120% + env(safe-area-inset-bottom)))' : 'translateY(0)',
        opacity: hidden ? 0 : 1,
        transition: 'transform 0.25s ease, opacity 0.25s ease',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
      aria-label="Main navigation"
      aria-hidden={hidden}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
          borderRadius: 9999,
          backgroundColor: 'rgba(10, 10, 11, 0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--sec-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          padding: '0 4px',
          overflow: 'hidden',
        }}
      >
        {items.map((item) => {
          const isMoreTab = Boolean(item.isMore);
          const active = isMoreTab ? moreActive : isActive(item.page);
          const isCreateTab = item.isCreate || (item.name === 'Create' && item.query === '?create=table');
          const isProfile = item.page === 'Profile';
          const to = item.navTo || (item.query ? `${createPageUrl(item.page)}${item.query}` : createPageUrl(item.page));
          const iconSize = 20;

          const iconEl = isCreateTab ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--sec-gradient-silver)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(192,192,192,0.2)',
                color: 'var(--sec-bg-base)',
                flexShrink: 0,
              }}
            >
              <item.icon size={iconSize} strokeWidth={2} />
            </div>
          ) : (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 9999,
                backgroundColor: active ? 'var(--sec-accent-muted)' : 'transparent',
                border: active ? '1px solid var(--sec-accent-border)' : '1px solid transparent',
                flexShrink: 0,
              }}
            >
              <item.icon
                size={iconSize}
                strokeWidth={active ? 2 : 1.5}
                color={active ? 'var(--sec-accent)' : undefined}
              />
              {(item.page === 'Messages' || item.page === 'BusinessMessages' || item.page === 'HostDashboard') &&
              item.badge > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -4,
                    minWidth: 14,
                    height: 14,
                    borderRadius: 7,
                    background: 'var(--sec-accent)',
                    color: '#000',
                    fontSize: 8,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    lineHeight: 1,
                  }}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              ) : null}
            </div>
          );

          const inner = (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
                padding: isCreateTab ? '2px 0' : '4px 2px',
              }}
            >
              {iconEl}
              {!isCreateTab ? (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                    lineHeight: 1.1,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}
                >
                  {item.name}
                </span>
              ) : null}
            </div>
          );

          const commonStyle = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '1 1 0',
            width: 0,
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textDecoration: 'none',
            color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
            padding: 0,
          };

          if (isMoreTab) {
            return (
              <button
                key="more"
                type="button"
                onClick={() => onOpenMore?.()}
                style={commonStyle}
                aria-label="More navigation"
                aria-current={active ? 'page' : undefined}
              >
                {inner}
              </button>
            );
          }

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
                aria-current={active ? 'page' : undefined}
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
                aria-label="Create"
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
              aria-current={active ? 'page' : undefined}
              aria-label={item.name}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
