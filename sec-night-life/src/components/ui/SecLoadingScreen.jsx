import React from 'react';
import SecLogo from '@/components/ui/SecLogo';

/**
 * Full-screen luxury loading state — SEC brand, metallic shimmer, minimal motion.
 */
export default function SecLoadingScreen({
  fullScreen = true,
  message = 'Your Night. Simplified.',
  compact = false,
}) {
  return (
    <div
      className={`sec-loading-screen ${fullScreen ? 'sec-loading-screen--fullscreen' : 'sec-loading-screen--inline'} ${compact ? 'sec-loading-screen--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading SEC Nightlife"
    >
      <div className="sec-loading-screen__glow" aria-hidden />
      <div className="sec-loading-screen__content">
        <div className="sec-loading-screen__logo">
          <SecLogo size={compact ? 72 : 96} asset="transparent" />
        </div>
        <div className="sec-loading-screen__brand sec-display">SEC</div>
        {!compact && (
          <p className="sec-loading-screen__tagline">{message}</p>
        )}
        <div className="sec-loading-screen__track" aria-hidden>
          <div className="sec-loading-screen__bar" />
        </div>
      </div>
    </div>
  );
}
