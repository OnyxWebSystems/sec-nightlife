import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet, apiPost } from '@/api/client';
import { ChevronLeft, Briefcase, Clock, CheckCircle2, XCircle } from 'lucide-react';

function StatusPill({ status }) {
  const s = (status || 'pending').toLowerCase();
  const styles = s === 'hired'
    ? { bg: 'var(--sec-success-muted)', bd: 'var(--sec-success-muted)', fg: 'var(--sec-success)', icon: CheckCircle2 }
    : s === 'rejected'
    ? { bg: 'var(--sec-error-muted)', bd: 'var(--sec-error-muted)', fg: 'var(--sec-error)', icon: XCircle }
    : { bg: 'var(--sec-accent-muted)', bd: 'var(--sec-accent-border)', fg: 'var(--sec-text-secondary)', icon: Clock };
  const Icon = styles.icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        backgroundColor: styles.bg,
        border: `1px solid ${styles.bd}`,
        color: styles.fg,
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      <Icon size={14} strokeWidth={1.5} />
      {s}
    </span>
  );
}

export default function MyJobApplications() {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await authService.getCurrentUser();
        const data = await apiGet('/api/jobs/my-applications');
        setApps(Array.isArray(data) ? data : []);
      } catch {
        authService.redirectToLogin(createPageUrl('MyJobApplications'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return undefined;
    let mounted = true;
    const load = async () => {
      try {
        const data = await apiGet(`/api/jobs/applications/${selectedId}/messages`);
        if (mounted) setMessages(Array.isArray(data) ? data : []);
      } catch {}
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} className="sec-nav-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--sec-text-primary)' }}>My Applications</h1>
        </div>
      </header>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div className="sec-spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--sec-text-muted)' }}>Loading…</p>
          </div>
        ) : apps.length === 0 ? (
          <div className="sec-card" style={{ padding: 24, borderRadius: 16, textAlign: 'center' }}>
            <Briefcase size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 6 }}>No applications yet</p>
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 13, marginBottom: 16 }}>Apply to jobs and track your status here.</p>
            <Link to={createPageUrl('Jobs')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', textDecoration: 'none', padding: '10px 18px' }}>
              Browse Jobs
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apps.map((a) => (
              <div key={a.id} className="sec-card" style={{ padding: 16, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.jobTitle}
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--sec-text-muted)', fontSize: 12 }}>
                      {a.appliedAt ? `Applied ${new Date(a.appliedAt).toLocaleDateString()}` : 'Applied'} · {a.venueName}
                    </div>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <Link to={createPageUrl(`JobDetails?id=${a.jobPostingId}`)} className="sec-btn sec-btn-secondary" style={{ textDecoration: 'none', height: 44, minWidth: 44 }}>
                    View job
                  </Link>
                  <button className="sec-btn sec-btn-primary" style={{ height: 44, minWidth: 44 }} onClick={() => setSelectedId(a.id)}>
                    Messages {a.unreadCount > 0 ? `(${a.unreadCount})` : ''}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedId ? (
        <div style={{ padding: 16, borderTop: '1px solid var(--sec-border)' }}>
          <h3 style={{ marginBottom: 8 }}>Messages</h3>
          <div className="sec-card" style={{ padding: 10, maxHeight: 240, overflowY: 'auto', borderRadius: 12, display: 'grid', gap: 8 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ background: 'var(--sec-bg-elevated)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{m.sender?.fullName || 'User'} · {new Date(m.sentAt).toLocaleString()}</div>
                <div>{m.body}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <input className="sec-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type message" />
            <button
              className="sec-btn sec-btn-primary"
              style={{ height: 44, minWidth: 44 }}
              onClick={async () => {
                if (!body.trim()) return;
                await apiPost(`/api/jobs/applications/${selectedId}/messages`, { body });
                setBody('');
                const data = await apiGet(`/api/jobs/applications/${selectedId}/messages`);
                setMessages(Array.isArray(data) ? data : []);
              }}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

