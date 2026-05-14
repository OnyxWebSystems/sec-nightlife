import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Star, Users } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function HostedTableCard({ table, onJoin, compact = false }) {
  const title = table?.tableName || table?.venueName || 'Hosted table';
  const location = table?.displayLocation || table?.eventLocation?.displayLabel || table?.event?.city || table?.venueName;
  const hostName = table?.host?.username || table?.host?.fullName || 'Host';
  const rating = table?.host?.averageRating;
  const isVip = String(table?.hostingCategory || '').toUpperCase() === 'VIP';
  const sourceBadge = table?.tableType === 'IN_APP_EVENT' ? 'SEC event' : 'External';
  const joinedCount =
    table?.joinedCount != null
      ? Number(table.joinedCount)
      : Math.max(0, Number(table?.guestQuantity || 0) - Number(table?.spotsRemaining || 0));

  return (
    <div
      className="sec-card"
      style={{
        padding: compact ? 12 : 14,
        borderRadius: 14,
        border: '1px solid var(--sec-border)',
        background: table?.boosted ? 'var(--sec-bg-elevated)' : 'var(--sec-bg-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="sec-badge sec-badge-muted">{sourceBadge}</span>
          {isVip ? <span className="sec-badge sec-badge-gold">VIP</span> : <span className="sec-badge sec-badge-success">General</span>}
          {table?.isPublic === false ? (
            <span className="sec-badge sec-badge-muted">Private</span>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sec-text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <MapPin size={13} />
        <span>{location || 'Location TBC'}</span>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sec-text-secondary)' }}>
        Host: {hostName}
        {rating != null ? (
          <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Star size={12} /> {Number(rating).toFixed(1)}
          </span>
        ) : null}
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--sec-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Users size={13} />
        {joinedCount} joined ·
        {table?.spotsRemaining ?? 0} spots left
        {table?.hasJoiningFee && Number(table?.joiningFee || 0) > 0 ? ` · Join R${Number(table.joiningFee).toFixed(0)}` : ' · Free join'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="sec-btn sec-btn-secondary" style={{ flex: 1 }} onClick={() => onJoin?.(table)}>
          {table?.isPublic === false ? 'Request to join' : 'Join'}
        </button>
        <Link
          to={createPageUrl(`TableDetails?id=${table.id}&source=hosted`)}
          className="sec-btn sec-btn-ghost"
          style={{ flex: 1, textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          Details
        </Link>
      </div>
    </div>
  );
}
