import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { format, parseISO } from 'date-fns';
import { Calendar, UserPlus, ChevronRight } from 'lucide-react';

export default function TrendingTableCard({ table }) {
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [host, setHost] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || !table?.id) return;
    loadDetails();
  }, [table, mounted]);

  const loadDetails = async () => {
    try {
      if (table?.event_id) {
        const events = await dataService.Event.filter({ id: table.event_id });
        if (events?.length > 0) setEvent(events[0]);
      }
      if (table?.host_user_id) {
        const hosts = await dataService.User.filter({ id: table.host_user_id });
        if (hosts?.length > 0) setHost(hosts[0]);
      }
    } catch (e) {}
  };

  const current = table.current_guests || 1;
  const max = table.max_guests || 10;
  const spotsLeft = max - current;
  const pct = Math.min((current / max) * 100, 100);
  const capacityState = pct < 50 ? 'open' : pct < 85 ? 'filling' : 'full';
  const capacityColor = {
    open: 'var(--sec-success)',
    filling: 'var(--sec-accent)',
    full: 'var(--sec-error)',
  }[capacityState];

  const handleJoinClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(createPageUrl(`TableJoinOnboarding?id=${table.id}`));
  };

  return (
    <div className="sec-card" style={{ padding: '14px 16px 14px' }}>
      <Link to={createPageUrl(`TableDetails?id=${table.id}`)} style={{ display: 'block', textDecoration: 'none' }}>

        {/* List-row layout: avatar + body + right badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: event ? 10 : 12 }}>

          {/* Host avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {host?.avatar_url ? (
              <img src={host.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-secondary)' }}>
                {(host?.username || 'H')[0].toUpperCase()}
              </span>
            )}
          </div>

          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)',
              marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {table.name}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
              Hosted by {host?.username || 'Anonymous'}
            </p>
          </div>

          {/* Capacity badge — right aligned */}
          <span className="sec-badge" style={{
            flexShrink: 0,
            backgroundColor: 'var(--sec-bg-elevated)',
            color: capacityColor,
            border: `1px solid ${capacityColor}22`,
            borderRadius: 'var(--radius-pill)',
          }}>
            {spotsLeft > 0 ? `${spotsLeft} left` : 'Full'}
          </span>
        </div>

        {/* Event context row */}
        {event && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 12, color: 'var(--sec-text-muted)', fontSize: 12,
            paddingLeft: 52,
          }}>
            <Calendar size={11} strokeWidth={1.5} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {event.title}
            </span>
            {event.date && (
              <span style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }}>
                · {format(parseISO(event.date), 'MMM d')}
              </span>
            )}
          </div>
        )}

        {/* Capacity bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 0 }}>
          <div className="sec-progress" style={{ flex: 1 }}>
            <div className="sec-progress-fill" style={{ width: `${pct}%`, backgroundColor: capacityColor }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--sec-text-muted)', flexShrink: 0 }}>
            <span style={{ color: 'var(--sec-text-primary)', fontWeight: 700 }}>{current}</span>
            <span style={{ color: 'var(--sec-border-strong)' }}>/{max}</span>
          </span>
        </div>
      </Link>

      {/* Join CTA — only if spots available */}
      {spotsLeft > 0 && (
        <button
          onClick={handleJoinClick}
          className="sec-btn sec-btn-primary"
          style={{ width: '100%', marginTop: 12, padding: '10px 16px' }}
        >
          <UserPlus size={14} strokeWidth={2} />
          Join Table
        </button>
      )}
    </div>
  );
}
