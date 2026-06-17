import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { asArray, buildPageUrl, createPageUrl } from '@/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch } from '@/api/client';
import { dataService } from '@/services/dataService';
import * as authService from '@/services/authService';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  JOB_TYPES,
  COMPENSATION_TYPES,
  COMPENSATION_PER,
  jobPostingToEditForm,
  validateJobEditForm,
  buildJobPatchBody,
} from '@/constants/jobPostingForm';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';

function compensationText(job) {
  if (job.compensationPer === 'COMMISSION') return 'Commission based';
  if (job.compensationType === 'NEGOTIABLE') return 'Negotiable';
  if (job.compensationType === 'UNPAID_TRIAL') return 'Unpaid trial';
  if (job.compensationAmount) return `R${Number(job.compensationAmount).toFixed(0)} per ${String(job.compensationPer || 'MONTH').toLowerCase()}`;
  return 'Compensation not set';
}

function getPublicVisibility(job) {
  if (job.status !== 'OPEN') return { isVisible: false, reason: `Hidden from public (${job.status.toLowerCase()})` };
  if (job.closingDate && new Date(job.closingDate) <= new Date()) return { isVisible: false, reason: 'Hidden from public (expired closing date)' };
  return { isVisible: true, reason: 'Visible to party goers' };
}

export default function BusinessJobs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const [activeJobId, setActiveJobId] = useState(null);
  const [editJobId, setEditJobId] = useState(null);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [editForm, setEditForm] = useState(() => jobPostingToEditForm(null));

  const focusJobId = searchParams.get('job') || searchParams.get('edit');
  const focusView = searchParams.get('view') || (searchParams.get('edit') ? 'edit' : null);
  const isFocused = Boolean(focusJobId);

  const { data: user } = useQuery({
    queryKey: ['business-jobs-me'],
    queryFn: () => authService.getCurrentUser(),
  });

  const venueScope = useBusinessVenueScope();
  const scopeKey = venueScope.staffContextToken || venueScope.venueId;

  const { data: jobsRaw, isLoading } = useQuery({
    queryKey: ['biz-jobs', scopeKey],
    queryFn: () => apiGet(`/api/jobs/by-venue?${venueScope.venueQuery}`),
    enabled: !!venueScope.venueQuery,
  });
  const jobs = asArray(jobsRaw);
  const focusedJob = useMemo(
    () => (focusJobId ? jobs.find((j) => j.id === focusJobId) || null : null),
    [jobs, focusJobId],
  );

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
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to update job status'),
  });

  const clearJobFocus = () => {
    setActiveJobId(null);
    setEditJobId(null);
    setEditForm(jobPostingToEditForm(null));
    setSearchParams({}, { replace: true });
  };

  const deleteJobMutation = useMutation({
    mutationFn: (jobId) => apiDelete(`/api/jobs/${jobId}`),
    onMutate: (jobId) => setDeletingJobId(jobId),
    onSuccess: (data, jobId) => {
      const n = data?.applicationCount || 0;
      toast.success(
        n > 0
          ? `Job deleted (${n} application${n === 1 ? '' : 's'} removed)`
          : 'Job deleted',
      );
      qc.setQueryData(['biz-jobs', scopeKey], (old) =>
        asArray(old).filter((j) => j.id !== jobId),
      );
      if (activeJobId === jobId) setActiveJobId(null);
      if (editJobId === jobId) {
        setEditJobId(null);
        setEditForm(jobPostingToEditForm(null));
      }
      if (isFocused && focusJobId === jobId) clearJobFocus();
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to delete job'),
    onSettled: () => setDeletingJobId(null),
  });

  const activeJob = useMemo(() => jobs.find((j) => j.id === activeJobId) || null, [jobs, activeJobId]);

  const updateStatus = useMutation({
    mutationFn: ({ applicationId, status }) => apiPatch(`/api/jobs/applications/${applicationId}/status`, { status }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['biz-job-applications', activeJobId] });
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
      qc.invalidateQueries({ queryKey: ['business-inbox'] });
      toast.success('Application updated');
      if (variables.status === 'HIRED' && activeJob?.positionRole === 'PROMOTER') {
        navigate(createPageUrl(`BusinessMessages?tab=promoters&application=${variables.applicationId}`));
      }
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Status update failed'),
  });

  const editMutation = useMutation({
    mutationFn: () => apiPatch(`/api/jobs/${editJobId}`, buildJobPatchBody(editForm)),
    onSuccess: () => {
      toast.success('Job updated');
      if (isFocused && focusView === 'edit') {
        setSearchParams({ job: editJobId, view: 'applicants' }, { replace: true });
      } else {
        setEditJobId(null);
        setEditForm(jobPostingToEditForm(null));
      }
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Update failed'),
  });

  const handleSaveEdit = () => {
    const job = jobs.find((j) => j.id === editJobId);
    const v = validateJobEditForm(editForm, { filledSpots: job?.filledSpots ?? 0 });
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    editMutation.mutate();
  };

  useEffect(() => {
    const readMode = () => localStorage.getItem('sec_active_mode') || 'partygoer';
    const guardMode = () => {
      if (readMode() !== 'business') {
        navigate(createPageUrl('Jobs'), { replace: true });
      }
    };
    guardMode();
    window.addEventListener('sec_active_mode_changed', guardMode);
    return () => window.removeEventListener('sec_active_mode_changed', guardMode);
  }, [navigate]);

  useEffect(() => {
    const legacyEdit = searchParams.get('edit');
    if (legacyEdit && !searchParams.get('job')) {
      setSearchParams({ job: legacyEdit, view: 'edit' }, { replace: true });
      return;
    }
    if (!focusJobId || !jobs.length) return;
    const job = jobs.find((j) => j.id === focusJobId);
    if (!job) return;
    if (focusView === 'edit') {
      setEditJobId(job.id);
      setEditForm(jobPostingToEditForm(job));
      setActiveJobId(null);
    } else if (focusView === 'applicants') {
      setActiveJobId(job.id);
      setEditJobId(null);
    }
  }, [focusJobId, focusView, jobs, searchParams, setSearchParams]);

  if (!venueScope.venueQuery) {
    return (
      <div style={{ padding: 16 }}>
        <div className="sec-card" style={{ padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontWeight: 700 }}>Business Jobs</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--sec-text-muted)' }}>No venue found. Register a venue first.</p>
        </div>
      </div>
    );
  }

  const confirmDeleteJob = (job) => {
    const appCount = job._count?.applications || 0;
    const msg =
      appCount > 0
        ? `Delete "${job.title}"? This will permanently remove ${appCount} application${appCount === 1 ? '' : 's'} and all related messages.`
        : `Delete "${job.title}"? This action cannot be undone.`;
    if (!window.confirm(msg)) return;
    deleteJobMutation.mutate(job.id);
  };

  const renderJobActions = (job) => (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
      <button
        className="sec-btn sec-btn-secondary"
        style={{ height: 42, width: '100%' }}
        onClick={() => setSearchParams({ job: job.id, view: 'applicants' }, { replace: true })}
      >
        View Applicants ({job._count?.applications || 0})
      </button>
      <button
        className="sec-btn sec-btn-secondary"
        style={{ height: 42, width: '100%' }}
        onClick={() => setSearchParams({ job: job.id, view: 'edit' }, { replace: true })}
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
        disabled={deletingJobId === job.id}
        onClick={() => confirmDeleteJob(job)}
      >
        {deletingJobId === job.id ? 'Deleting...' : 'Delete Job'}
      </button>
    </div>
  );

  const renderJobCard = (job) => (
    <div key={job.id} className="sec-card" style={{ borderRadius: 12, padding: 14 }}>
      {(() => {
        const visibility = getPublicVisibility(job);
        return (
          <div style={{ marginBottom: 8 }}>
            <span className={`sec-badge ${visibility.isVisible ? 'sec-badge-success' : 'sec-badge-danger'}`}>
              {visibility.reason}
            </span>
          </div>
        );
      })()}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {job.title}
            {job.positionRole === 'PROMOTER' ? (
              <span className="sec-badge" style={{ fontSize: 10, color: 'var(--sec-accent)' }}>Promoter</span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{job.jobType} · {compensationText(job)}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sec-text-muted)' }}>
            {job.filledSpots} of {job.totalSpots} filled · {job.closingDate ? new Date(job.closingDate).toLocaleDateString() : 'No closing date'}
          </div>
        </div>
        <span className={`sec-badge ${job.status === 'OPEN' ? 'sec-badge-success' : job.status === 'FILLED' ? 'sec-badge-gold' : 'sec-badge-muted'}`}>{job.status}</span>
      </div>
      {renderJobActions(job)}
      {!isFocused ? (
        <div style={{ marginTop: 8 }}>
          <span className="sec-badge sec-badge-muted">Unread {unreadByJob[job.id] || 0}</span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageBackHeader
        title={isFocused && focusedJob ? focusedJob.title : 'Jobs'}
        subtitle={
          isFocused
            ? focusView === 'edit'
              ? 'Edit this job posting'
              : 'Applicants for this job'
            : 'Manage venue job postings'
        }
        onBack={isFocused ? clearJobFocus : undefined}
        fallbackTo={isFocused ? undefined : 'BusinessDashboard'}
        pageName="BusinessJobs"
      />
      <div style={{ padding: 16 }}>
      {!isFocused ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, gap: 12 }}>
          <Link to={createPageUrl('CreateJob')} className="sec-btn sec-btn-primary sec-btn-md" style={{ textDecoration: 'none', flexShrink: 0 }}>
            Post Job
          </Link>
        </div>
      ) : null}

      {isLoading ? <div className="sec-spinner" /> : null}

      {isFocused && !focusedJob && !isLoading ? (
        <div className="sec-card" style={{ padding: 16, borderRadius: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Job not found or it was removed.</p>
          <button type="button" className="sec-btn sec-btn-secondary mt-3" onClick={clearJobFocus}>
            Back to all jobs
          </button>
        </div>
      ) : null}

      {isFocused && focusedJob && focusView !== 'edit' ? renderJobCard(focusedJob) : null}

      {!isFocused ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {jobs.map((job) => renderJobCard(job))}
        </div>
      ) : null}

      {activeJobId && (!isFocused || focusView === 'applicants') ? (
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
                    try {
                      const cv = await apiGet(`/api/jobs/applications/${a.id}/cv`);
                      const url = cv?.viewUrl || cv?.cvUrl;
                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      else toast.error('No CV on file');
                    } catch (err) {
                      toast.error(err?.data?.error || err?.message || 'Cannot access CV');
                    }
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

      {editJobId && (!isFocused || focusView === 'edit') ? (
        <div
          className="sec-card"
          style={{ marginTop: 14, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 'min(85vh, 720px)', overflow: 'hidden' }}
        >
          <h3 style={{ fontWeight: 700, marginBottom: 12, flexShrink: 0 }}>Edit Job</h3>
          <div style={{ overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label className="text-gray-400 text-sm">Job title *</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Job type *</Label>
              <Select value={editForm.jobType} onValueChange={(v) => setEditForm((p) => ({ ...p, jobType: v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                  {JOB_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Job description *</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                className="mt-1.5 rounded-xl resize-y min-h-[100px]"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                rows={4}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Requirements *</Label>
              <Textarea
                value={editForm.requirements}
                onChange={(e) => setEditForm((p) => ({ ...p, requirements: e.target.value }))}
                className="mt-1.5 rounded-xl resize-y min-h-[100px]"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                rows={4}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label className="text-gray-400 text-sm">Compensation type *</Label>
                <Select value={editForm.compensationType} onValueChange={(v) => setEditForm((p) => ({ ...p, compensationType: v }))}>
                  <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                    {COMPENSATION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Currency</Label>
                <Input
                  value={editForm.currency}
                  onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>
            {['FIXED', 'NEGOTIABLE'].includes(editForm.compensationType) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Label className="text-gray-400 text-sm">Amount</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editForm.compensationAmount}
                    onChange={(e) => setEditForm((p) => ({ ...p, compensationAmount: e.target.value }))}
                    className="mt-1.5 h-11 rounded-xl"
                    style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-sm">Paid per</Label>
                  <Select value={editForm.compensationPer} onValueChange={(v) => setEditForm((p) => ({ ...p, compensationPer: v }))}>
                    <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                      {COMPENSATION_PER.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label className="text-gray-400 text-sm">Total spots</Label>
                <Input
                  type="number"
                  min={1}
                  value={editForm.totalSpots}
                  onChange={(e) => setEditForm((p) => ({ ...p, totalSpots: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Closing date</Label>
                <Input
                  type="date"
                  value={editForm.closingDate}
                  onChange={(e) => setEditForm((p) => ({ ...p, closingDate: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, flexShrink: 0, paddingTop: 12, borderTop: '1px solid var(--sec-border)' }}>
            <button
              type="button"
              className="sec-btn sec-btn-primary w-full"
              style={{ height: 48, borderRadius: 12 }}
              onClick={handleSaveEdit}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? 'Saving...' : 'Save changes'}
            </button>
            <button
              type="button"
              className="sec-btn sec-btn-secondary w-full"
              style={{ height: 44, borderRadius: 12 }}
              onClick={() => {
                if (isFocused) {
                  setSearchParams({ job: editJobId, view: 'applicants' }, { replace: true });
                } else {
                  setEditJobId(null);
                  setEditForm(jobPostingToEditForm(null));
                }
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
