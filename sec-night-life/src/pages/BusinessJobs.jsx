import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch } from '@/api/client';
import { dataService } from '@/services/dataService';
import * as authService from '@/services/authService';
import { toast } from 'sonner';

function compensationText(job) {
  if (job.compensationPer === 'COMMISSION') return 'Commission based';
  if (job.compensationType === 'NEGOTIABLE') return 'Negotiable';
  if (job.compensationType === 'UNPAID_TRIAL') return 'Unpaid trial';
  if (job.compensationAmount) return `R${Number(job.compensationAmount).toFixed(0)} per ${String(job.compensationPer || 'MONTH').toLowerCase()}`;
  return 'Compensation not set';
}

export default function BusinessJobs() {
  const qc = useQueryClient();
  const [activeJobId, setActiveJobId] = useState(null);
  const [editJobId, setEditJobId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', requirements: '', totalSpots: 1, closingDate: '' });

  const { data: user } = useQuery({
    queryKey: ['business-jobs-me'],
    queryFn: () => authService.getCurrentUser(),
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['biz-jobs-venues'],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user.id }),
    enabled: !!user?.id,
  });
  const venue = Array.isArray(venues) ? venues[0] : null;

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['biz-jobs', venue?.id],
    queryFn: () => apiGet(`/api/jobs/venue/${venue.id}`),
    enabled: !!venue?.id,
  });

  const { data: applications = [] } = useQuery({
    queryKey: ['biz-job-applications', activeJobId],
    queryFn: () => apiGet(`/api/jobs/${activeJobId}/applications`),
    enabled: !!activeJobId,
  });

  const unreadByJob = useMemo(() => {
    const map = {};
    for (const job of jobs) map[job.id] = 0;
    return map;
  }, [jobs]);

  const jobStatusMutation = useMutation({
    mutationFn: ({ jobId, status }) => apiPatch(`/api/jobs/${jobId}`, { status }),
    onSuccess: () => {
      toast.success('Job status updated');
      qc.invalidateQueries({ queryKey: ['biz-jobs', venue?.id] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to update job status'),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId) => apiDelete(`/api/jobs/${jobId}`),
    onSuccess: () => {
      toast.success('Job deleted');
      qc.invalidateQueries({ queryKey: ['biz-jobs', venue?.id] });
      if (activeJobId) {
        setActiveJobId(null);
        qc.invalidateQueries({ queryKey: ['biz-job-applications', activeJobId] });
      }
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to delete job'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ applicationId, status }) => apiPatch(`/api/jobs/applications/${applicationId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biz-job-applications', activeJobId] });
      qc.invalidateQueries({ queryKey: ['biz-jobs', venue?.id] });
      toast.success('Application updated');
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Status update failed'),
  });

  const editMutation = useMutation({
    mutationFn: () => apiPatch(`/api/jobs/${editJobId}`, {
      title: editForm.title,
      description: editForm.description,
      requirements: editForm.requirements,
      totalSpots: Number(editForm.totalSpots),
      closingDate: editForm.closingDate || null,
    }),
    onSuccess: () => {
      toast.success('Job updated');
      setEditJobId(null);
      qc.invalidateQueries({ queryKey: ['biz-jobs', venue?.id] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Update failed'),
  });

  if (!venue?.id) {
    return (
      <div style={{ padding: 16 }}>
        <div className="sec-card" style={{ padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontWeight: 700 }}>Business Jobs</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--sec-text-muted)' }}>No venue found. Register a venue first.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Jobs</h1>
        <Link to={createPageUrl('CreateJob')} className="sec-btn sec-btn-primary" style={{ textDecoration: 'none', height: 44, minWidth: 44 }}>
          Post Job
        </Link>
      </div>

      {isLoading ? <div className="sec-spinner" /> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {jobs.map((job) => (
          <div key={job.id} className="sec-card" style={{ borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{job.title}</div>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{job.jobType} · {compensationText(job)}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sec-text-muted)' }}>
                  {job.filledSpots} of {job.totalSpots} filled · {job.closingDate ? new Date(job.closingDate).toLocaleDateString() : 'No closing date'}
                </div>
              </div>
              <span className={`sec-badge ${job.status === 'OPEN' ? 'sec-badge-success' : job.status === 'FILLED' ? 'sec-badge-gold' : 'sec-badge-muted'}`}>{job.status}</span>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              <button className="sec-btn sec-btn-secondary" style={{ height: 42, width: '100%' }} onClick={() => setActiveJobId(job.id)}>
                View Applicants ({job._count?.applications || 0})
              </button>
              <button
                className="sec-btn sec-btn-secondary"
                style={{ height: 42, width: '100%' }}
                onClick={() => {
                  setEditJobId(job.id);
                  setEditForm({
                    title: job.title || '',
                    description: job.description || '',
                    requirements: job.requirements || '',
                    totalSpots: job.totalSpots || 1,
                    closingDate: job.closingDate ? new Date(job.closingDate).toISOString().slice(0, 10) : '',
                  });
                }}
              >
                Edit
              </button>
              <button
                className={`sec-btn ${job.status === 'OPEN' ? 'sec-btn-secondary' : 'sec-btn-primary'}`}
                style={{ height: 42, width: '100%' }}
                disabled={jobStatusMutation.isPending}
                onClick={() => {
                  const status = job.status === 'OPEN' ? 'CLOSED' : 'OPEN';
                  jobStatusMutation.mutate({ jobId: job.id, status });
                }}
              >
                {jobStatusMutation.isPending ? 'Saving...' : (job.status === 'OPEN' ? 'Close Job' : 'Open Job')}
              </button>
              <button
                className="sec-btn sec-btn-secondary"
                style={{ height: 42, width: '100%', borderColor: 'rgba(217, 85, 85, 0.35)', color: 'var(--sec-error)' }}
                disabled={deleteJobMutation.isPending}
                onClick={() => {
                  const ok = window.confirm('Delete this job post? This action cannot be undone.');
                  if (!ok) return;
                  deleteJobMutation.mutate(job.id);
                }}
              >
                {deleteJobMutation.isPending ? 'Deleting...' : 'Delete Job'}
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="sec-badge sec-badge-muted">Unread {unreadByJob[job.id] || 0}</span>
            </div>
          </div>
        ))}
      </div>

      {activeJobId ? (
        <div className="sec-card" style={{ marginTop: 14, borderRadius: 12, padding: 14 }}>
          <h3 style={{ fontWeight: 700 }}>Applicants</h3>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {applications.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--sec-border)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{a.applicant?.fullName || 'Applicant'}</div>
                    <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{new Date(a.appliedAt).toLocaleString()}</div>
                  </div>
                  <span className="sec-badge sec-badge-muted">{a.status}</span>
                </div>
                <p style={{ marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{a.coverMessage}</p>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={async () => {
                    const cv = await apiGet(`/api/jobs/applications/${a.id}/cv`);
                    if (cv?.cvUrl) window.open(cv.cvUrl, '_blank');
                  }}>
                    View CV
                  </button>
                  {a.portfolioUrl ? <a href={a.portfolioUrl} target="_blank" rel="noreferrer" className="sec-btn sec-btn-secondary" style={{ textDecoration: 'none', height: 44, minWidth: 44 }}>Portfolio</a> : null}
                  {a.status !== 'SHORTLISTED' ? <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'SHORTLISTED' })}>Shortlist</button> : null}
                  {a.status !== 'REJECTED' ? <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'REJECTED' })}>Reject</button> : null}
                  {a.status !== 'HIRED' ? <button className="sec-btn sec-btn-primary" style={{ height: 44, minWidth: 44 }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'HIRED' })}>Hire</button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {editJobId ? (
        <div className="sec-card" style={{ marginTop: 14, borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
          <h3 style={{ fontWeight: 700 }}>Edit Job</h3>
          <input className="sec-input" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" />
          <textarea className="sec-input" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
          <textarea className="sec-input" value={editForm.requirements} onChange={(e) => setEditForm((p) => ({ ...p, requirements: e.target.value }))} placeholder="Requirements" />
          <input className="sec-input" type="number" min="1" value={editForm.totalSpots} onChange={(e) => setEditForm((p) => ({ ...p, totalSpots: e.target.value }))} />
          <input className="sec-input" type="date" value={editForm.closingDate} onChange={(e) => setEditForm((p) => ({ ...p, closingDate: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => setEditJobId(null)}>Cancel</button>
            <button className="sec-btn sec-btn-primary" style={{ height: 44, minWidth: 44 }} onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
