import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createPageUrl } from '@/utils';
import { format, parseISO, isToday, isTomorrow, isValid } from 'date-fns';
import { MapPin, Users, Sparkles, Crown } from 'lucide-react';
import { getEventImage, NIGHTLIFE_PLACEHOLDERS } from '@/lib/placeholders';

function offeringHref(offering) {
  if (!offering) return createPageUrl('Tables');
  if (offering.type === 'venue_event' && offering.eventId) {
    return createPageUrl(`EventDetails?id=${offering.eventId}#tables`);
  }
  if (offering.type === 'venue_day' && offering.venueId) {
    return createPageUrl(`VenueBook?venueId=${offering.venueId}`);
  }
  if (offering.type === 'hosted_host' && offering.eventId && offering.hostUserId) {
    return createPageUrl(`EventHostTables?eventId=${offering.eventId}&hostUserId=${offering.hostUserId}`);
  }
  if (offering.type === 'hosted_external' && offering.hostUserId) {
    const first = offering.tables?.[0]?.id;
    if (first) return createPageUrl(`TableDetails?id=${first}&source=hosted`);
    return createPageUrl(`EventHostTables?hostUserId=${offering.hostUserId}`);
  }
  return createPageUrl('Tables');
}

function dateLabel(iso) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso);
  if (!isValid(d)) return '';
  if (isToday(d)) return 'Tonight';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

export default function TableOfferingCard({ offering, wide = false }) {
  const [imgError, setImgError] = useState(false);
  if (!offering?.id) return null;

  const isHosted = offering.type === 'hosted_host' || offering.type === 'hosted_external';
  const imgSrc = imgError ? NIGHTLIFE_PLACEHOLDERS.event : getEventImage(offering.imageUrl);

  const tierLabels = (offering.tiers || [])
    .slice(0, 3)
    .map((t) => t.label || t.tableName)
    .filter(Boolean);
  const tableCount = offering.tableCount || offering.tables?.length || tierLabels.length;

  return (
    <Link
      to={offeringHref(offering)}
      style={{
        display: 'block',
        textDecoration: 'none',
        width: wide ? 320 : 280,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          height: wide ? 260 : 240,
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          border: offering.boosted
            ? '1px solid rgba(212, 175, 55, 0.55)'
            : '1px solid var(--sec-border)',
          boxShadow: offering.boosted
            ? '0 8px 32px rgba(212, 175, 55, 0.12), var(--shadow-card)'
            : 'var(--shadow-card)',
          transition: 'transform 0.2s ease, border-color 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-3px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <img
          src={imgSrc}
          alt=""
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.92) 100%)',
          }}
        />

        {offering.boosted && (
          <motion.div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'linear-gradient(135deg, rgba(212,175,55,0.35), rgba(0,0,0,0.6))',
              border: '1px solid rgba(212, 175, 55, 0.5)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#f5e6b8',
            }}
          >
            <Sparkles size={11} />
            Promoted
          </motion.div>
        )}

        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            padding: '5px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--sec-text-secondary)',
          }}
        >
          {isHosted ? 'Community table' : offering.type === 'venue_day' ? 'Book on SEC' : 'Venue tables'}
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 16px 16px' }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              marginBottom: 4,
              letterSpacing: '-0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {offering.title}
          </h3>
          <p
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.65)',
              marginBottom: 10,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {offering.subtitle}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {tierLabels.map((label) => (
              <span
                key={label}
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {label}
              </span>
            ))}
            {tableCount > tierLabels.length && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                +{tableCount - tierLabels.length} more
              </span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            {offering.eventDate && <span>{dateLabel(offering.eventDate)}</span>}
            {offering.city && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={10} />
                {offering.city}
              </span>
            )}
            {offering.totalSpots > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Users size={10} />
                {offering.totalSpots} spots
              </span>
            )}
            {isHosted && offering.minJoinFeeZar != null && offering.minJoinFeeZar > 0 && (
              <span style={{ color: 'rgba(212,175,55,0.9)', fontWeight: 600 }}>
                Join from R{Number(offering.minJoinFeeZar).toFixed(0)}
              </span>
            )}
            {!isHosted && offering.minBookingFeeZar > 0 && (
              <span style={{ color: 'rgba(212,175,55,0.9)', fontWeight: 600 }}>
                From R{Number(offering.minBookingFeeZar).toFixed(0)} fee
              </span>
            )}
            {isHosted && (offering.minJoinFeeZar == null || offering.minJoinFeeZar === 0) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.7)' }}>
                <Crown size={10} />
                Free join
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
