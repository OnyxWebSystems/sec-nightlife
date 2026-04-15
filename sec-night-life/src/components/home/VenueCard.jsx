import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { MapPin, Star, Check } from 'lucide-react';
import { getVenueImage, NIGHTLIFE_PLACEHOLDERS } from '@/lib/placeholders';

export default function VenueCard({ venue }) {
  const [mounted, setMounted] = useState(false);
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !venue?.id) return null;

  const venueTypeLabel = venue.venue_type
    ? venue.venue_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  const imgSrc = imgError ? NIGHTLIFE_PLACEHOLDERS.venue : getVenueImage(venue.cover_image_url, venue.venue_type);

  return (
    <Link to={createPageUrl(`VenueProfile?id=${venue.id}`)} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        style={{ transition: 'transform var(--transition-base)' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {/* Image container */}
        <div style={{
          width: '100%',
          aspectRatio: '2 / 1',
          maxHeight: 140,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          backgroundColor: 'var(--sec-bg-card)',
          border: '1px solid var(--sec-border)',
          marginBottom: 10,
          position: 'relative',
        }}>
          <img
            src={imgSrc}
            alt={venue.name}
            onError={() => setImgError(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center',
              transition: 'transform 0.35s ease', display: 'block',
            }}
            loading="lazy"
          />

          {/* Bottom scrim for legibility */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)',
          }} />

          {/* Verified badge — top-right, glass pill */}
          {venue.is_verified && (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              backgroundColor: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              border: '1px solid var(--sec-accent-border)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 8px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Check size={9} strokeWidth={2.5} style={{ color: 'var(--sec-accent)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--sec-accent)', textTransform: 'uppercase' }}>
                Verified
              </span>
            </div>
          )}

          {/* Logo bottom-left if exists */}
          {venue.logo_url && (
            <div style={{
              position: 'absolute', bottom: 8, left: 8,
              width: 26, height: 26, borderRadius: 6,
              overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'var(--sec-bg-base)',
            }}>
              <img src={venue.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div>
          <h3 style={{
            fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)',
            marginBottom: 4, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {venue.name}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: venueTypeLabel ? 6 : 0 }}>
            {venue.city && (
              <span style={{ fontSize: 11, color: 'var(--sec-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} strokeWidth={1.5} />
                {venue.city}
              </span>
            )}
            {venue.review_count > 0 && venue.review_average > 0 && (
              <span style={{ fontSize: 11, color: 'var(--sec-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Star size={10} strokeWidth={1.5} fill="var(--sec-accent)" stroke="var(--sec-accent)" />
                {Number(venue.review_average).toFixed(1)}
              </span>
            )}
          </div>
          {venueTypeLabel && (
            <span className="sec-badge sec-badge-muted" style={{ display: 'inline-flex' }}>
              {venueTypeLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
