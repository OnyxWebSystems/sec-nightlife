import React from 'react';
import { getDirectionsActions } from '@/lib/openDirections';

/**
 * Primary + secondary map openers (Apple Maps first on iOS).
 */
export default function DirectionsLinks({
  address,
  lat,
  lng,
  className = '',
  linkClassName = '',
  primaryStyle,
  secondaryStyle,
}) {
  const actions = getDirectionsActions({ address, lat, lng });
  if (!actions.query) return null;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <a
        href={actions.primary.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        style={primaryStyle}
      >
        {actions.primary.label}
      </a>
      <a
        href={actions.secondary.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        style={secondaryStyle}
      >
        {actions.secondary.label}
      </a>
    </div>
  );
}
