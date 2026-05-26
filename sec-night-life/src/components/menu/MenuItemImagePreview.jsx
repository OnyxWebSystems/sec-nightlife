import React from 'react';
import { X } from 'lucide-react';

export default function MenuItemImagePreview({ open, imageUrl, itemName, onClose }) {
  if (!open || !imageUrl) return null;

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 400 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={itemName ? `Photo of ${itemName}` : 'Menu item photo'}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 401,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="sec-btn sec-btn-ghost"
          style={{
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            right: 16,
            width: 44,
            height: 44,
            padding: 0,
            borderRadius: '50%',
            pointerEvents: 'auto',
          }}
        >
          <X size={20} />
        </button>
        {itemName ? (
          <p
            style={{
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              marginBottom: 12,
              textAlign: 'center',
              pointerEvents: 'auto',
            }}
          >
            {itemName}
          </p>
        ) : null}
        <img
          src={imageUrl}
          alt={itemName || ''}
          style={{
            maxWidth: 'min(100%, 560px)',
            maxHeight: 'min(75vh, 720px)',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            borderRadius: 12,
            pointerEvents: 'auto',
          }}
        />
      </div>
    </>
  );
}
