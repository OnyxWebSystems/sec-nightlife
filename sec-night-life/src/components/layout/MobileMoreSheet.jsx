import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import VenueSwitcher from '@/components/business/VenueSwitcher';

/**
 * Mobile More sheet — mirrors desktop primary+secondary destinations not on the bottom bar,
 * plus venue switcher (business) and explicit mode switch.
 */
export default function MobileMoreSheet({
  open,
  onOpenChange,
  items = [],
  isActive,
  mode = 'partygoer',
  availableModes = [],
  onSwitchMode,
  onPrefetch,
  onAdminNavClick,
}) {
  const otherMode = availableModes.find((m) => m.id !== mode);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="lg:hidden"
        style={{
          backgroundColor: 'var(--sec-bg-card)',
          borderColor: 'var(--sec-border)',
          color: 'var(--sec-text-primary)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: '85dvh',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <SheetHeader style={{ textAlign: 'left', marginBottom: 12 }}>
          <SheetTitle style={{ color: 'var(--sec-text-primary)', fontSize: 18 }}>More</SheetTitle>
          <SheetDescription style={{ color: 'var(--sec-text-muted)' }}>
            Everything else in {mode === 'business' ? 'Business' : 'Party Goer'} mode
          </SheetDescription>
        </SheetHeader>

        {mode === 'business' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sec-text-muted)', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Venue
            </div>
            <VenueSwitcher className="w-full" />
          </div>
        )}

        {otherMode && (
          <button
            type="button"
            onClick={() => {
              onSwitchMode?.(otherMode.id);
              onOpenChange?.(false);
            }}
            className="sec-card"
            style={{
              width: '100%',
              marginBottom: 16,
              padding: '14px 16px',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: '1px solid var(--sec-border)',
              backgroundColor: 'var(--sec-bg-elevated)',
              color: 'var(--sec-text-primary)',
              cursor: 'pointer',
              minHeight: 48,
            }}
          >
            <ArrowLeftRight size={18} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Switch to {otherMode.label}</div>
              <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Change viewing mode</div>
            </div>
          </button>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            overflowY: 'auto',
            maxHeight: 'calc(85dvh - 220px)',
            paddingBottom: 8,
          }}
        >
          {items.map((item) => {
            const active = isActive?.(item.page);
            const to = item.navTo;
            if (!to) return null;
            const Icon = item.icon;
            return (
              <Link
                key={`${item.page}-${item.query || ''}-${item.name}`}
                to={to}
                onClick={() => {
                  onAdminNavClick?.(item.page);
                  onOpenChange?.(false);
                }}
                onMouseEnter={() => onPrefetch?.(item.page)}
                onFocus={() => onPrefetch?.(item.page)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '14px 8px',
                  minHeight: 88,
                  borderRadius: 14,
                  textDecoration: 'none',
                  border: active ? '1px solid var(--sec-accent-border)' : '1px solid var(--sec-border)',
                  backgroundColor: active ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)',
                  color: active ? 'var(--sec-accent)' : 'var(--sec-text-primary)',
                  position: 'relative',
                }}
              >
                <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                  {item.name}
                </span>
                {item.badge > 0 ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: 'var(--sec-accent)',
                      color: '#000',
                      fontSize: 10,
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
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
