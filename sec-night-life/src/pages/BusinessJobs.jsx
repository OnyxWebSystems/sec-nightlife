import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { asArray, createPageUrl } from '@/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
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
import { useActiveVenueOptional } from '@/context/ActiveVenueContext';
import { businessVenueQuery } from '@/lib/businessVenueQuery';
import SecLogo from '@/components/ui/SecLogo';
import { Building2, Search, Users, UserCheck } from 'lucide-react';

function compensationText(job) {
  if (job.compensationPer === 'COMMISSION') return 'Commission based';
  if (job.compensationType === 'NEGOTIABLE') return 'Negotiable';
  if (job.compensationType === 'UNPAID_TRIAL') return 'Unpaid trial';
  if (job.compensationAmount) {
    return `R${Number(job.compensationAmount).toFixed(0)} per ${String(job.compensationPer || 'MONTH').toLowerCase()}`;
  }
  return 'Compensation not set';
}

function getPublicVisibility(job) {
  if (job.status !== 'OPEN') {
    return { isVisible: false, reason: `Hidden from public (${job.status.toLowerCase()})` };
  }
  if (job.closingDate && new Date(job.closingDate) <= new Date()) {
    return { isVisible: false, reason: 'Hidden from public (expired closing date)' };
  }
  return { isVisible: true, reason: 'Visible to party goers' };
}

function applicantDisplayName(applicant) {
  return applicant?.fullName || (applicant?.username ? `@${applicant.username}` : 'Applicant');
}

export default function BusinessJobs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const activeVenueCtx = useActiveVenueOptional();
  const venueScope = useBusinessVenueScope();

  const [pageTab, setPageTab] = useState(() =>
    searchParams.get('tab') === 'hired' ? 'hired' : 'applicants',
  );
  const [venueFilter, setVenueFilter] = useState('active'); // 'all' | 'active'
  const [activeJobId, setActiveJobId] = useState(null);
  const [editJobId, setEditJobId] = useState(null);
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [hiredJobId, setHiredJobId] = useState(null);
  const [hiredSearch, setHiredSearch] = useState('');
  const [debouncedHiredSearch, setDebouncedHiredSearch] = useState('');
  const [editForm, setEditForm] = useState(() => jobPostingToEditForm(null));

  const focusJobId = searchParams.get('job') || searchParams.get('edit');
  const focusView = searchParams.get('view') || (searchParams.get('edit') ? 'edit' : null);
  const isFocused = Boolean(focusJobId);

  const ownedVenues = asArray(activeVenueCtx?.venues);
  const showVenueControls = !venueScope.inStaffSession && ownedVenues.length > 1;

  const jobsVenueQuery = useMemo(() => {
    if (venueScope.inStaffSession) return venueScope.venueQuery;
    if (venueFilter === 'all') return '';
    return businessVenueQuery({ venueId: venueScope.venueId });
  }, [venueScope.inStaffSession, venueScope.venueQuery, venueScope.venueId, venueFilter]);

  const scopeKey = `${venueScope.staffContextToken || 'owner'}:${venueFilter === 'all' ? 'all' : venueScope.venueId || 'none'}`;

  useQuery({
    queryKey: ['business-jobs-me'],
    queryFn: () => authService.getCurrentUser(),
  });

  const { data: jobsRaw, isLoading } = useQuery({
    queryKey: ['biz-jobs', scopeKey],
    queryFn: () => apiGet(`/api/jobs/by-venue${jobsVenueQuery ? `?${jobsVenueQuery}` : ''}`),
    enabled: venueScope.inStaffSession ? !!venueScope.venueQuery : true,
  });
  const jobs = asArray(jobsRaw);

  const focusedJob = useMemo(
    () => (focusJobId ? jobs.find((j) => j.id === focusJobId) || null : null),
    [jobs, focusJobId],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedHiredSearch(hiredSearch.trim()), 250);
    return () => window.clearTimeout(t);
  }, [hiredSearch]);

  const hiredQuery = useMemo(() => {
    const parts = [];
    if (jobsVenueQuery) parts.push(jobsVenueQuery);
    if (debouncedHiredSearch) parts.push(`q=${encodeURIComponent(debouncedHiredSearch)}`);
    return parts.join('&');
  }, [jobsVenueQuery, debouncedHiredSearch]);

  const { data: hiredGroupsRaw, isLoading: hiredLoading } = useQuery({
    queryKey: ['biz-hired-staff', scopeKey, debouncedHiredSearch],
    queryFn: () => apiGet(`/api/jobs/hired-staff${hiredQuery ? `?${hiredQuery}` : ''}`),
    enabled: pageTab === 'hired' && (venueScope.inStaffSession ? !!venueScope.venueQuery : true),
  });
  const hiredGroups = asArray(hiredGroupsRaw);

  const { data: applications = [] } = useQuery({
    queryKey: ['biz-job-applications', activeJobId],
    queryFn: () => apiGet(`/api/jobs/${activeJobId}/applications`),
    enabled: !!activeJobId,
  });

  const applicantList = useMemo(
    () => asArray(applications).filter((a) => a.status !== 'HIRED' && a.status !== 'RELEASED'),
    [applications],
  );

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
    const next = {};
    if (pageTab === 'hired') next.tab = 'hired';
    setSearchParams(next, { replace: true });
  };

  const deleteJobMutation = useMutation({
    mutationFn: (jobId) => apiDelete(`/api/jobs/${jobId}`),
    onMutate: (jobId) => setDeletingJobId(jobId),
    onSuccess: (data, jobId) => {
      const rejected = data?.rejectedCount || 0;
      toast.success(
        rejected > 0
          ? `Job removed. ${rejected} open application${rejected === 1 ? '' : 's'} auto-rejected. Hired staff kept.`
          : 'Job removed. Hired staff (if any) were kept.',
      );
      qc.setQueryData(['biz-jobs', scopeKey], (old) => asArray(old).filter((j) => j.id !== jobId));
      if (activeJobId === jobId) setActiveJobId(null);
      if (editJobId === jobId) {
        setEditJobId(null);
        setEditForm(jobPostingToEditForm(null));
      }
      if (isFocused && focusJobId === jobId) clearJobFocus();
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
      qc.invalidateQueries({ queryKey: ['biz-hired-staff'] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to delete job'),
    onSettled: () => setDeletingJobId(null),
  });

  const activeJob = useMemo(() => jobs.find((j) => j.id === activeJobId) || null, [jobs, activeJobId]);

  const updateStatus = useMutation({
    mutationFn: ({ applicationId, status }) =>
      apiPatch(`/api/jobs/applications/${applicationId}/status`, { status }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['biz-job-applications', activeJobId] });
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
      qc.invalidateQueries({ queryKey: ['biz-hired-staff'] });
      qc.invalidateQueries({ queryKey: ['business-inbox'] });
      toast.success('Application updated');
      if (variables.status === 'HIRED' && activeJob?.positionRole === 'PROMOTER') {
        navigate(createPageUrl(`BusinessMessages?tab=promoters&application=${variables.applicationId}`));
      }
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Status update failed'),
  });

  const unhireMutation = useMutation({
    mutationFn: (applicationId) => apiPost(`/api/jobs/applications/${applicationId}/unhire`, {}),
    onSuccess: () => {
      toast.success('Removed from staff');
      qc.invalidateQueries({ queryKey: ['biz-hired-staff'] });
      qc.invalidateQueries({ queryKey: ['biz-jobs', scopeKey] });
      qc.invalidateQueries({ queryKey: ['biz-job-applications'] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to remove staff'),
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
      if (readMode() !== 'business' && !venueScope.inStaffSession) {
        navigate(createPageUrl('Jobs'), { replace: true });
      }
    };
    guardMode();
    window.addEventListener('sec_active_mode_changed', guardMode);
    return () => window.removeEventListener('sec_active_mode_changed', guardMode);
  }, [navigate, venueScope.inStaffSession]);

  useEffect(() => {
    const legacyEdit = searchParams.get('edit');
    if (legacyEdit && !searchParams.get('job')) {
      setSearchParams({ job: legacyEdit, view: 'edit' }, { replace: true });
      return;
    }
    if (searchParams.get('tab') === 'hired') setPageTab('hired');
    if (!focusJobId || !jobs.length) return;
    const job = jobs.find((j) => j.id === focusJobId);
    if (!job) return;
    setPageTab('applicants');
    if (focusView === 'edit') {
      setEditJobId(job.id);
      setEditForm(jobPostingToEditForm(job));
      setActiveJobId(null);
    } else if (focusView === 'applicants') {
      setActiveJobId(job.id);
      setEditJobId(null);
    }
  }, [focusJobId, focusView, jobs, searchParams, setSearchParams]);

  const switchPageTab = (tab) => {
    setPageTab(tab);
    setHiredJobId(null);
    if (tab === 'hired') {
      clearJobFocus();
      setSearchParams({ tab: 'hired' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  if (venueScope.inStaffSession && !venueScope.venueQuery) {
    return (
      <div style={{ padding: 16 }}>
        <div className="sec-card" style={{ padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontWeight: 700 }}>Business Jobs</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--sec-text-muted)' }}>
            Staff venue context is missing or expired.
          </p>
          <button
            type="button"
            className="sec-btn sec-btn-primary mt-3"
            onClick={() => navigate(createPageUrl('StaffDashboard'))}
          >
            Go to Staff Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!venueScope.inStaffSession && !venueScope.venueId && ownedVenues.length === 0 && !activeVenueCtx?.isLoading) {
    return (
      <div style={{ padding: 16 }}>
        <div className="sec-card" style={{ padding: 16, borderRadius: 12 }}>
          <h2 style={{ fontWeight: 700 }}>Business Jobs</h2>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--sec-text-muted)' }}>
            No venue found. Register a venue first.
          </p>
        </div>
      </div>
    );
  }

  const confirmDeleteJob = (job) => {
    const msg = `Remove "${job.title}" from your job listings? Open and shortlisted applicants will be auto-rejected (email + notification). Hired staff stay hired and remain under Hired Staff.`;
    if (!window.confirm(msg)) return;
    deleteJobMutation.mutate(job.id);
  };

  const confirmUnhire = (person, jobTitle) => {
    const name = applicantDisplayName(person.applicant);
    if (!window.confirm(`Remove ${name} from ${jobTitle} staff?`)) return;
    unhireMutation.mutate(person.id);
  };

  const renderJobActions = (job) => (
    <div
      style={{
        marginTop: 12,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 8,
      }}
    >
      <button
        className="sec-btn sec-btn-secondary"
        style={{ height: 42, width: '100%' }}
        onClick={() => {
          setPageTab('applicants');
          setSearchParams({ job: job.id, view: 'applicants' }, { replace: true });
        }}
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
        {jobStatusMutation.isPending ? 'Saving...' : job.status === 'OPEN' ? 'Close Job' : 'Open Job'}
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

  const renderJobCard = (job) => {
    const visibility = getPublicVisibility(job);
    return (
      <div
        key={job.id}
        className="sec-card"
        style={{
          borderRadius: 14,
          padding: 16,
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.25) 55%, var(--sec-bg-card) 100%)',
        }}
      >
        <div style={{ position: 'absolute', right: -8, top: -8, opacity: 0.08, pointerEvents: 'none' }}>
          <SecLogo size={88} variant="icon" asset="transparent" />
        </div>
        <div style={{ marginBottom: 8 }}>
          <span className={`sec-badge ${visibility.isVisible ? 'sec-badge-success' : 'sec-badge-danger'}`}>
            {visibility.reason}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {job.title}
              {job.positionRole === 'PROMOTER' ? (
                <span className="sec-badge" style={{ fontSize: 10, color: 'var(--sec-accent)' }}>
                  Promoter
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>
              {job.jobType} · {compensationText(job)}
              {job.venue?.name ? ` · ${job.venue.name}` : ''}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sec-text-muted)' }}>
              {job.filledSpots} of {job.totalSpots} filled ·{' '}
              {job.closingDate ? new Date(job.closingDate).toLocaleDateString() : 'No closing date'}
            </div>
          </div>
          <span
            className={`sec-badge ${
              job.status === 'OPEN'
                ? 'sec-badge-success'
                : job.status === 'FILLED'
                  ? 'sec-badge-gold'
                  : 'sec-badge-muted'
            }`}
          >
            {job.status}
          </span>
        </div>
        {renderJobActions(job)}
      </div>
    );
  };

  const renderHiredGroups = () => {
    if (hiredLoading) return <div className="sec-spinner" />;
    if (!hiredGroups.length) {
      return (
        <div
          className="sec-card"
          style={{
            padding: 28,
            borderRadius: 14,
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', opacity: 0.07 }}>
            <SecLogo size={120} variant="icon" asset="transparent" />
          </div>
          <UserCheck size={28} style={{ color: 'var(--sec-accent)', margin: '0 auto 10px' }} />
          <div style={{ fontWeight: 700 }}>No hired staff yet</div>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--sec-text-muted)' }}>
            Hire applicants from the Applicants tab and they will appear here by job type.
          </p>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--sec-text-muted)',
            }}
          />
          <Input
            value={hiredSearch}
            onChange={(e) => setHiredSearch(e.target.value)}
            placeholder="Search hired staff by username or name..."
            className="h-11 rounded-xl pl-9"
            style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
          />
        </div>

        {hiredGroups.map((group) => {
          const job = group.job;
          const open = hiredJobId === job.id;
          const hired = asArray(group.hired);
          return (
            <div
              key={job.id}
              className="sec-card"
              style={{
                borderRadius: 14,
                padding: 16,
                position: 'relative',
                overflow: 'hidden',
                background:
                  'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.2) 100%)',
              }}
            >
              <div style={{ position: 'absolute', right: -6, bottom: -10, opacity: 0.06, pointerEvents: 'none' }}>
                <SecLogo size={96} variant="icon" asset="transparent" />
              </div>
              <button
                type="button"
                onClick={() => setHiredJobId(open ? null : job.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{job.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                      {job.jobType}
                      {job.venue?.name ? ` · ${job.venue.name}` : ''}
                      {job.deletedAt ? ' · posting removed' : ''}
                    </div>
                  </div>
                  <span className="sec-badge sec-badge-gold">{hired.length} hired</span>
                </div>
              </button>

              {open ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                  {hired.map((person) => (
                    <div
                      key={person.id}
                      style={{
                        border: '1px solid var(--sec-border)',
                        borderRadius: 12,
                        padding: 12,
                        background: 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {person.applicant?.avatarUrl ? (
                            <img
                              src={person.applicant.avatarUrl}
                              alt=""
                              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                display: 'grid',
                                placeItems: 'center',
                                background: 'var(--sec-accent-muted)',
                                color: 'var(--sec-accent)',
                                fontWeight: 700,
                              }}
                            >
                              {(applicantDisplayName(person.applicant) || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700 }}>{applicantDisplayName(person.applicant)}</div>
                            {person.applicant?.username ? (
                              <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                                @{person.applicant.username}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <span className="sec-badge sec-badge-success">HIRED</span>
                      </div>
                      <button
                        type="button"
                        className="sec-btn sec-btn-secondary"
                        style={{
                          marginTop: 10,
                          height: 40,
                          width: '100%',
                          borderColor: 'rgba(217, 85, 85, 0.35)',
                          color: 'var(--sec-error)',
                        }}
                        disabled={unhireMutation.isPending}
                        onClick={() => confirmUnhire(person, job.title)}
                      >
                        Remove from staff
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageBackHeader
        title={isFocused && focusedJob ? focusedJob.title : 'Jobs'}
        subtitle={
          isFocused
            ? focusView === 'edit'
              ? 'Edit this job posting'
              : 'Applicants for this job'
            : 'Applicants and hired staff across your venues'
        }
        onBack={isFocused ? clearJobFocus : undefined}
        fallbackTo={isFocused ? undefined : 'BusinessDashboard'}
        pageName="BusinessJobs"
      />

      <div style={{ padding: 16 }}>
        {!isFocused ? (
          <div
            className="sec-card"
            style={{
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background:
                'radial-gradient(circle at top right, rgba(192,192,192,0.12), transparent 45%), var(--sec-bg-card)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', right: 8, top: 8, opacity: 0.35 }}>
              <SecLogo size={42} variant="icon" asset="transparent" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.2 }}>Business Jobs</div>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>
                  Manage applications and hired staff
                </div>
              </div>
              <Link
                to={createPageUrl('CreateJob')}
                className="sec-btn sec-btn-primary sec-btn-md"
                style={{ textDecoration: 'none', flexShrink: 0 }}
              >
                Post Job
              </Link>
            </div>

            {showVenueControls ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Building2 size={14} style={{ color: 'var(--sec-accent)' }} />
                <Select
                  value={venueFilter === 'all' ? 'all' : String(activeVenueCtx?.activeVenueId || '')}
                  onValueChange={(v) => {
                    if (v === 'all') {
                      setVenueFilter('all');
                      return;
                    }
                    setVenueFilter('active');
                    activeVenueCtx?.setActiveVenueId?.(v);
                  }}
                >
                  <SelectTrigger
                    className="w-full"
                    style={{
                      background: 'var(--sec-bg-elevated)',
                      borderColor: 'var(--sec-border)',
                      color: 'var(--sec-text-primary)',
                      height: 38,
                      maxWidth: 320,
                    }}
                  >
                    <SelectValue placeholder="Select venue" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    className="bg-[var(--sec-bg-card)] border-[var(--sec-border)] text-[var(--sec-text-primary)]"
                  >
                    <SelectItem value="all">All venues</SelectItem>
                    {ownedVenues.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : venueScope.venueName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sec-text-muted)' }}>
                <Building2 size={14} />
                <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>{venueScope.venueName}</span>
              </div>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                padding: 4,
                borderRadius: 12,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--sec-border)',
              }}
            >
              {[
                { id: 'applicants', label: 'Applicants', icon: Users },
                { id: 'hired', label: 'Hired Staff', icon: UserCheck },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = pageTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchPageTab(tab.id)}
                    className="sec-btn"
                    style={{
                      height: 42,
                      borderRadius: 10,
                      border: 'none',
                      background: active
                        ? 'linear-gradient(135deg, #d7d7d7 0%, #9a9a9a 100%)'
                        : 'transparent',
                      color: active ? '#111' : 'var(--sec-text-muted)',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {pageTab === 'hired' && !isFocused ? renderHiredGroups() : null}

        {pageTab === 'applicants' || isFocused ? (
          <>
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

            {!isFocused && pageTab === 'applicants' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {jobs.length === 0 && !isLoading ? (
                  <div
                    className="sec-card"
                    style={{ padding: 28, borderRadius: 14, textAlign: 'center', position: 'relative', overflow: 'hidden' }}
                  >
                    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', opacity: 0.07 }}>
                      <SecLogo size={120} variant="icon" asset="transparent" />
                    </div>
                    <Users size={28} style={{ color: 'var(--sec-accent)', margin: '0 auto 10px' }} />
                    <div style={{ fontWeight: 700 }}>No job postings yet</div>
                    <p style={{ marginTop: 6, fontSize: 13, color: 'var(--sec-text-muted)' }}>
                      Post a job to start receiving applications.
                    </p>
                  </div>
                ) : null}
                {jobs.map((job) => renderJobCard(job))}
              </div>
            ) : null}

            {activeJobId && (!isFocused || focusView === 'applicants') ? (
              <div className="sec-card" style={{ marginTop: 14, borderRadius: 14, padding: 14 }}>
                <h3 style={{ fontWeight: 700 }}>Applicants</h3>
                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  {applicantList.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
                      No open applicants for this job. Hired people are under Hired Staff.
                    </p>
                  ) : null}
                  {applicantList.map((a) => (
                    <div key={a.id} style={{ border: '1px solid var(--sec-border)', borderRadius: 12, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{applicantDisplayName(a.applicant)}</div>
                          {a.applicant?.username ? (
                            <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>@{a.applicant.username}</div>
                          ) : null}
                          <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                            {new Date(a.appliedAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="sec-badge sec-badge-muted">{a.status}</span>
                      </div>
                      <p style={{ marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{a.coverMessage}</p>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="sec-btn sec-btn-secondary"
                          style={{ height: 44, minWidth: 44 }}
                          onClick={async () => {
                            try {
                              const cv = await apiGet(`/api/jobs/applications/${a.id}/cv`);
                              const url = cv?.viewUrl || cv?.cvUrl;
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              else toast.error('No CV on file');
                            } catch (err) {
                              toast.error(err?.data?.error || err?.message || 'Cannot access CV');
                            }
                          }}
                        >
                          View CV
                        </button>
                        {a.portfolioUrl ? (
                          <a
                            href={a.portfolioUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="sec-btn sec-btn-secondary"
                            style={{ textDecoration: 'none', height: 44, minWidth: 44 }}
                          >
                            Portfolio
                          </a>
                        ) : null}
                        {a.status !== 'SHORTLISTED' ? (
                          <button
                            className="sec-btn sec-btn-secondary"
                            style={{ height: 44, minWidth: 44 }}
                            onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'SHORTLISTED' })}
                          >
                            Shortlist
                          </button>
                        ) : null}
                        {a.status !== 'REJECTED' ? (
                          <button
                            className="sec-btn sec-btn-secondary"
                            style={{ height: 44, minWidth: 44 }}
                            onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'REJECTED' })}
                          >
                            Reject
                          </button>
                        ) : null}
                        <button
                          className="sec-btn sec-btn-primary"
                          style={{ height: 44, minWidth: 44 }}
                          onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'HIRED' })}
                        >
                          Hire
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {editJobId && (!isFocused || focusView === 'edit') ? (
              <div
                className="sec-card"
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  maxHeight: 'min(85vh, 720px)',
                  overflow: 'hidden',
                }}
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
                      <SelectTrigger
                        className="mt-1.5 h-11 rounded-xl"
                        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                        {JOB_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
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
                      <Select
                        value={editForm.compensationType}
                        onValueChange={(v) => setEditForm((p) => ({ ...p, compensationType: v }))}
                      >
                        <SelectTrigger
                          className="mt-1.5 h-11 rounded-xl"
                          style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                          {COMPENSATION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
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
                        <Select
                          value={editForm.compensationPer}
                          onValueChange={(v) => setEditForm((p) => ({ ...p, compensationPer: v }))}
                        >
                          <SelectTrigger
                            className="mt-1.5 h-11 rounded-xl"
                            style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                            {COMPENSATION_PER.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
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
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginTop: 16,
                    flexShrink: 0,
                    paddingTop: 12,
                    borderTop: '1px solid var(--sec-border)',
                  }}
                >
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
          </>
        ) : null}
      </div>
    </div>
  );
}
