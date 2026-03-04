import React, { useState } from 'react';

/**
 * SEC Logo — uses official logo from /Logo folder.
 * Fallback: inline SVG matching brand (stroke + gold accent).
 */
export default function SecLogo({ size = 32, variant = 'full' }) {
  const [imgError, setImgError] = useState(false);
  const showText = variant === 'full';

  const logoSrc = '/Logo/sec-logo.png';

  if (!imgError) {
    return (
      <div className="sec-logo-wrap" style={{ background: 'transparent' }}>
        <img
          src={logoSrc}
          alt="SEC"
          onError={() => setImgError(true)}
          style={{
            height: size,
            width: 'auto',
            display: 'block',
            objectFit: 'contain'
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size,
          height: size * 0.7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={size}
          height={size * 0.73}
          viewBox="0 0 30 22"
          fill="none"
          style={{ display: 'block' }}
        >
          <path
            d="M22 0H8C3.582 0 0 3.582 0 8s3.582 8 8 8h14c4.418 0 8 3.582 8 8s-3.582 8-8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="15" cy="11" r="4" fill="var(--sec-accent, #B8B8B8)" />
        </svg>
      </div>
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--sec-text-primary)',
              lineHeight: 1,
            }}
          >
            SEC
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--sec-text-muted)',
            }}
          >
            Your Night. Simplified.
          </span>
        </div>
      )}
    </div>
  );
}
