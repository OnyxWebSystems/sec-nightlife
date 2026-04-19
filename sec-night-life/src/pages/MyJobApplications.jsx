import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet, apiPost } from '@/api/client';
import { ChevronLeft, Briefcase, Clock, CheckCircle2, XCircle } from 'lucide-react';
import LegalDocLink from '@/components/legal/LegalDocLink';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
  const [authed, setAuthed] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [body, setBody] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await authService.getCurrentUser();
        setAuthed(true);
      } catch {
        authService.redirectToLogin(createPageUrl('MyJobApplications'));
      }
    })();
  }, []);

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const deepLinkApplicationId = urlParams.get('applicationId');
  const deepLinkJobId = urlParams.get('jobId');

  const { data: apps = [], isLoading: appsLoading, isError: appsError, error: appsErrorDetails } = useQuery({
    queryKey: ['my-apps'],
    queryFn: async () => {
      const data = await apiGet('/api/jobs/my-applications');
      return Array.isArray(data) ? data : [];
    },
    enabled: authed,
    refetchInterval: 30000,
    retry: false,
  });

  const autoOpenCandidateId = useMemo(() => {
    if (!apps.length) return null;
    if (deepLinkApplicationId) return deepLinkApplicationId;
    if (deepLinkJobId) return apps.find((a) => a.jobPostingId === deepLinkJobId)?.id || null;
    const unread = apps.find((a) => (a.unreadCount || 0) > 0);
    return unread?.id || null;
  }, [apps, deepLinkApplicationId, deepLinkJobId]);

  useEffect(() => {
    if (selectedId) return;
    if (!autoOpenCandidateId) return;
    setSelectedId(autoOpenCandidateId);
  }, [selectedId, autoOpenCandidateId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['job-messages', selectedId],
    queryFn: async () => {
      const data = await apiGet(`/api/jobs/applications/${selectedId}/messages`);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedId && authed,
    refetchInterval: 30000,
    retry: false,
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      const payload = { body: body.trim() };
      if (!payload.body) return null;
      return apiPost(`/api/jobs/applications/${selectedId}/messages`, payload);
    },
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['job-messages', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['my-apps'] });
    },
  });

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
        {!appsLoading && !appsError && apps.length > 0 && (
          <div
            className="sec-card"
            style={{ padding: '12px 14px', marginBottom: 12, borderRadius: 12, fontSize: 12, color: 'var(--sec-text-muted)', lineHeight: 1.5 }}
          >
            Promoter work is subject to our{' '}
            <LegalDocLink pageName="PromoterCodeOfConduct">Promoter Code of Conduct</LegalDocLink>
            {' '}and{' '}
            <LegalDocLink pageName="CommunityGuidelines">Community Guidelines</LegalDocLink>.
          </div>
        )}
        {appsLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div className="sec-spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--sec-text-muted)' }}>Loading…</p>
          </div>
        ) : appsError ? (
          <div className="sec-card" style={{ padding: 24, borderRadius: 16, textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 6 }}>Unable to load your applications</p>
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 13, marginBottom: 16 }}>
              {appsErrorDetails?.message || 'Please try again.'}
            </p>
            <button
              type="button"
              className="sec-btn sec-btn-primary"
              style={{ height: 42, minWidth: 120 }}
              onClick={() => queryClient.invalidateQueries({ queryKey: ['my-apps'] })}
            >
              Retry
            </button>
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
            {messagesLoading ? (
              <div style={{ padding: 10, color: 'var(--sec-text-muted)', fontSize: 13 }}>Loading messages…</div>
            ) : messages.length === 0 ? (
              <div style={{ padding: 10, color: 'var(--sec-text-muted)', fontSize: 13 }}>No messages yet.</div>
            ) : messages.map((m) => (
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
              disabled={!body.trim() || sendMessage.isPending}
              onClick={() => sendMessage.mutate()}
            >
              {sendMessage.isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

