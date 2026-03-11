/**
 * Host Event Details — informal events (house parties, boat parties, etc.)
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Calendar, MapPin, Users, DollarSign } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getEventImage } from '@/lib/placeholders';

export default function HostEventDetails() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('id');

  const { data: event, isLoading } = useQuery({
    queryKey: ['host-event', eventId],
    queryFn: async () => {
      const list = await dataService.HostEvent.filter({ id: eventId });
      return list[0];
    },
    enabled: !!eventId,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: 'var(--sec-text-muted)' }}>Event not found</p>
        <Link to={createPageUrl('Events')} style={{ color: 'var(--sec-accent)' }}>Back to Events</Link>
      </div>
    );
  }

  const dateLabel = event.date ? format(parseISO(event.date), 'EEEE, MMMM d, yyyy') : 'TBA';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Host Event</h1>
        </div>
      </header>

      <div style={{ padding: 20 }}>
        <div className="sec-card" style={{ overflow: 'hidden' }}>
          <div style={{ height: 200 }}>
            <img
              src={getEventImage(event.cover_image_url)}
              alt={event.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ padding: 20 }}>
            <span className="sec-badge sec-badge-muted" style={{ marginBottom: 12, display: 'inline-block' }}>Host Event</span>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>{event.title}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calendar size={18} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0 }} />
                <span>{dateLabel}</span>
              </div>
              {(event.city || event.location) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MapPin size={18} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0 }} />
                  <span>{event.location || event.city}</span>
                </div>
              )}
              {event.capacity > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Users size={18} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0 }} />
                  <span>Capacity: {event.capacity}</span>
                </div>
              )}
              {(event.entry_cost != null && event.entry_cost > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <DollarSign size={18} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0 }} />
                  <span>R{event.entry_cost} entry</span>
                </div>
              )}
            </div>

            {event.description && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--sec-border)' }}>
                <p style={{ color: 'var(--sec-text-secondary)', whiteSpace: 'pre-wrap' }}>{event.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
