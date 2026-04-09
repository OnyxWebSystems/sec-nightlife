import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPatch, apiPost } from '@/api/client';
import {
  JOB_TYPES,
  COMPENSATION_TYPES,
  COMPENSATION_PER,
  jobPostingToEditForm,
  validateJobEditForm,
  buildJobPatchBody,
} from '@/constants/jobPostingForm';
import * as authService from '@/services/authService';
import { toast } from 'sonner';

function compensationText(job) {
  if (job.compensationPer === 'COMMISSION') return 'Commission based';
  if (job.compensationType === 'NEGOTIABLE') return 'Negotiable';
  if (job.compensationType === 'UNPAID_TRIAL') return 'Unpaid trial';
  if (job.compensationAmount) return `R${Number(job.compensationAmount).toFixed(0)} per ${String(job.compensationPer || 'MONTH').toLowerCase()}`;
  return 'Compensation not specified';
}

function getPublicVisibility(job) {
  if (!job) return { isVisible: false, reason: 'Unknown visibility' };
  if (job.status !== 'OPEN') return { isVisible: false, reason: `Hidden from public (${job.status.toLowerCase()})` };
  if (job.closingDate && new Date(job.closingDate) <= new Date()) return { isVisible: false, reason: 'Hidden from public (expired closing date)' };
  return { isVisible: true, reason: 'Visible to party goers' };
}

export default function JobDetails() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('id');

  const [user, setUser] = useState(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [coverMessage, setCoverMessage] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [cvUrl, setCvUrl] = useState('');
  const [cvFileName, setCvFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [messageBody, setMessageBody] = useState('');
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    requirements: '',
    totalSpots: 1,
    closingDate: '',
  });

  useEffect(() => {
    authService.getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: job, isLoading } = useQuery({
    queryKey: ['public-job', jobId],
    queryFn: () => apiGet(`/api/jobs/public/${jobId}`),
    enabled: !!jobId,
  });

  const { data: ownerJob, isLoading: ownerJobLoading } = useQuery({
    queryKey: ['owner-job', jobId],
    queryFn: async () => {
      try {
        return await apiGet(`/api/jobs/${jobId}`);
      } catch (err) {
        if (err?.status === 403 || err?.status === 404) return null;
        throw err;
      }
    },
    retry: false,
    enabled: !!jobId && !!user,
  });

  const { data: myApplications = [], isLoading: myAppsLoading, isError: myAppsError } = useQuery({
    queryKey: ['my-apps'],
    queryFn: async () => {
      const rows = await apiGet('/api/jobs/my-applications');
      return Array.isArray(rows) ? rows : [];
    },
    retry: false,
    enabled: !!user,
  });

  const selectedMyApplication = useMemo(() => myApplications.find((x) => x.jobPostingId === jobId), [myApplications, jobId]);
  const activeApplicationId = selectedApplication?.id || selectedMyApplication?.id || null;

  const { data: messages = [] } = useQuery({
    queryKey: ['job-messages', activeApplicationId],
    queryFn: () => apiGet(`/api/jobs/applications/${activeApplicationId}/messages`),
    enabled: !!activeApplicationId,
    refetchInterval: 30000,
  });

  const submitApplication = useMutation({
    mutationFn: () => apiPost(`/api/jobs/${jobId}/apply`, { coverMessage, cvUrl: cvUrl || null, cvFileName: cvFileName || null, portfolioUrl: portfolioUrl || null }),
    onSuccess: async () => {
      toast.success('Application submitted');
      setShowApplyDialog(false);
      await queryClient.invalidateQueries({ queryKey: ['my-apps'] });
      await queryClient.refetchQueries({ queryKey: ['my-apps'] });
      queryClient.invalidateQueries({ queryKey: ['public-job', jobId] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to apply'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ applicationId, status }) => apiPatch(`/api/jobs/applications/${applicationId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-job', jobId] });
      toast.success('Application updated');
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to update status'),
  });

  const sendMessage = useMutation({
    mutationFn: () => apiPost(`/api/jobs/applications/${activeApplicationId}/messages`, { body: messageBody }),
    onSuccess: () => {
      setMessageBody('');
      queryClient.invalidateQueries({ queryKey: ['job-messages', activeApplicationId] });
      queryClient.invalidateQueries({ queryKey: ['my-apps'] });
    },
  });

  const saveJobEdits = useMutation({
    mutationFn: () => apiPatch(`/api/jobs/${jobId}`, buildJobPatchBody(editForm)),
    onSuccess: () => {
      toast.success('Job updated');
      setShowEditForm(false);
      queryClient.invalidateQueries({ queryKey: ['owner-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['public-job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['biz-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['public-jobs'] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to update job'),
  });

  const handleSaveJobEdits = () => {
    if (!ownerJob) return;
    const v = validateJobEditForm(editForm, { filledSpots: ownerJob.filledSpots ?? 0 });
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    saveJobEdits.mutate();
  };

  useEffect(() => {
    if (!ownerJob || showEditForm) return;
    setEditForm(jobPostingToEditForm(ownerJob));
  }, [ownerJob, showEditForm]);

  async function uploadCv(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) {
      toast.error('Upload a PDF up to 5MB');
      return;
    }
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      toast.error('Cloudinary env is missing');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', uploadPreset);
      form.append('resource_type', 'raw');
      form.append('folder', 'sec-nightlife/cvs');
      // If 401 persists, verify Cloudinary upload preset is Unsigned + Public in dashboard.
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'Upload failed');
      if (!data?.secure_url) throw new Error('Upload succeeded but secure_url is missing');
      setCvUrl(data.secure_url);
      setCvFileName(file.name);
      toast.success('CV uploaded');
    } catch (e) {
      toast.error(e.message || 'Failed to upload CV');
    } finally {
      setUploading(false);
    }
  }

  async function viewCv(applicationId) {
    try {
      const data = await apiGet(`/api/jobs/applications/${applicationId}/cv`);
      const url = data?.viewUrl || data?.cvUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast.error('No CV on file');
    } catch (err) {
      toast.error(err?.data?.error || 'Cannot access CV');
    }
  }

  if (isLoading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><div className="sec-spinner" /></div>;
  if (!job) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Job not found</div>;

  const spotsRemaining = Math.max((job.totalSpots || 0) - (job.filledSpots || 0), 0);
  const canApply = !!user &&
    !ownerJobLoading &&
    !ownerJob &&
    !myAppsLoading &&
    !myAppsError &&
    !selectedMyApplication &&
    job.status === 'OPEN' &&
    spotsRemaining > 0;
  const visibility = getPublicVisibility(ownerJob || job);

  return (
    <div style={{ minHeight: '100vh', padding: 16, paddingBottom: 120 }}>
      <button onClick={() => navigate(-1)} className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44, marginBottom: 12 }}><ChevronLeft size={18} /></button>
      <div className="sec-card" style={{ padding: 16, borderRadius: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{job.title}</h1>
        <p style={{ marginTop: 6, color: 'var(--sec-text-muted)' }}>{job.venue?.name} · {job.venue?.city} · {job.venue?.venueType}</p>
        <p style={{ marginTop: 8, fontSize: 13 }}><strong>{compensationText(job)}</strong></p>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--sec-text-muted)' }}>{spotsRemaining} spots left</p>
        {job.closingDate ? <p style={{ marginTop: 8, fontSize: 13, color: 'var(--sec-text-muted)' }}>Closes {new Date(job.closingDate).toLocaleDateString()}</p> : <p style={{ marginTop: 8, fontSize: 13, color: 'var(--sec-text-muted)' }}>No closing date</p>}
        <h3 style={{ marginTop: 14 }}>Description</h3>
        <p style={{ color: 'var(--sec-text-secondary)', whiteSpace: 'pre-wrap' }}>{job.description}</p>
        <h3 style={{ marginTop: 14 }}>Requirements</h3>
        <p style={{ color: 'var(--sec-text-secondary)', whiteSpace: 'pre-wrap' }}>{job.requirements}</p>
      </div>

      {canApply ? (
        <button type="button" onClick={() => setShowApplyDialog(true)} className="sec-btn sec-btn-primary w-full" style={{ marginTop: 14, height: 48 }}>Apply</button>
      ) : selectedMyApplication ? (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="sec-badge sec-badge-success">Applied</div>
          <div className="sec-badge sec-badge-muted">Status: {selectedMyApplication.status}</div>
        </div>
      ) : myAppsError ? (
        <p style={{ marginTop: 14, fontSize: 13, color: 'var(--sec-text-muted)' }}>
          Unable to verify application state right now.
        </p>
      ) : user && user.role !== 'USER' && !ownerJob ? (
        <p style={{ marginTop: 14, fontSize: 13, color: 'var(--sec-text-muted)' }}>Switch to Party Goer mode to apply for jobs.</p>
      ) : null}

      {ownerJob ? (
        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          <div>
            <span className={`sec-badge ${visibility.isVisible ? 'sec-badge-success' : 'sec-badge-danger'}`}>{visibility.reason}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h2>Applicants</h2>
            <button
              className="sec-btn sec-btn-secondary"
              type="button"
              style={{ height: 40 }}
              onClick={() => {
                setShowEditForm((v) => {
                  const next = !v;
                  if (next) setEditForm(jobPostingToEditForm(ownerJob));
                  return next;
                });
              }}
            >
              {showEditForm ? 'Cancel Edit' : 'Edit Job'}
            </button>
          </div>
          {showEditForm ? (
            <div className="sec-card" style={{ padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: 'min(85vh, 720px)', overflow: 'hidden' }}>
              <div>
                <span className={`sec-badge ${visibility.isVisible ? 'sec-badge-success' : 'sec-badge-danger'}`}>{visibility.reason}</span>
              </div>
              <div style={{ overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
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
              <div style={{ marginTop: 14, flexShrink: 0, paddingTop: 12, borderTop: '1px solid var(--sec-border)' }}>
                <button
                  className="sec-btn sec-btn-primary w-full"
                  type="button"
                  style={{ height: 48, borderRadius: 12 }}
                  disabled={saveJobEdits.isPending}
                  onClick={handleSaveJobEdits}
                >
                  {saveJobEdits.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : null}
          {ownerJob.applications?.length ? ownerJob.applications.map((a) => (
            <div key={a.id} className="sec-card" style={{ padding: 16, borderRadius: 14, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: 16 }}>{a.applicant?.fullName || 'Applicant'}</p>
                  <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>{a.applicant?.email}</p>
                </div>
                <span className="sec-badge sec-badge-muted">{a.status}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, color: 'var(--sec-text-secondary)' }}>{a.coverMessage}</p>
              {a.portfolioUrl ? (
                <a
                  href={a.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'var(--sec-accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                  Open portfolio
                </a>
              ) : null}
              <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 8 }}>
                <button type="button" className="sec-btn sec-btn-secondary sec-btn-sm" style={{ width: '100%' }} onClick={() => viewCv(a.id)}>View CV</button>
                {a.status !== 'SHORTLISTED' ? <button type="button" className="sec-btn sec-btn-secondary sec-btn-sm" style={{ width: '100%' }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'SHORTLISTED' })}>Shortlist</button> : null}
                {a.status !== 'REJECTED' ? <button type="button" className="sec-btn sec-btn-secondary sec-btn-sm" style={{ width: '100%' }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'REJECTED' })}>Reject</button> : null}
                {a.status !== 'HIRED' ? <button type="button" className="sec-btn sec-btn-primary sec-btn-sm" style={{ width: '100%' }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'HIRED' })}>Hire</button> : null}
                <button type="button" className="sec-btn sec-btn-secondary sec-btn-sm" style={{ width: '100%' }} onClick={() => setSelectedApplication(a)}>Message</button>
              </div>
            </div>
          )) : (
            <div className="sec-card" style={{ padding: 14, borderRadius: 12, color: 'var(--sec-text-muted)' }}>
              No applicants yet.
            </div>
          )}
        </div>
      ) : null}

      {activeApplicationId ? (
        <div className="sec-card" style={{ marginTop: 20, padding: 16, borderRadius: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Messages</h3>
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 8, marginTop: 12 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ justifySelf: m.senderUserId === user?.id ? 'end' : 'start', maxWidth: '90%', background: m.senderUserId === user?.id ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{m.sender?.fullName || 'User'} · {new Date(m.sentAt).toLocaleString()}</div>
                <div style={{ marginTop: 4, fontSize: 14 }}>{m.body}</div>
                <div style={{ fontSize: 10, color: 'var(--sec-text-muted)', marginTop: 4 }}>{m.readAt ? 'Read' : 'Sent'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="sec-input" value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Type a message..." style={{ minHeight: 44 }} />
            <button type="button" className="sec-btn sec-btn-primary" style={{ height: 44, width: '100%' }} disabled={!messageBody.trim() || sendMessage.isPending} onClick={() => sendMessage.mutate()}>
              {sendMessage.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="max-w-md border-[var(--sec-border)] bg-[var(--sec-bg-card)] text-[var(--sec-text-primary)]">
          <DialogHeader>
            <DialogTitle>Apply for {job.title}</DialogTitle>
            <DialogDescription style={{ color: 'var(--sec-text-muted)' }}>Submit your application details.</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <Textarea value={coverMessage} onChange={(e) => setCoverMessage(e.target.value)} placeholder="Cover message (50-1000 characters)" className="min-h-[120px] border-[var(--sec-border)] bg-[var(--sec-bg-elevated)]" />
            <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{coverMessage.length}/1000</div>
            <input type="url" className="sec-input" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="Portfolio URL (optional)" />
            <div>
              <label style={{ fontSize: 12, color: 'var(--sec-text-muted)', display: 'block', marginBottom: 6 }}>CV (PDF, max 5MB)</label>
              <input type="file" accept="application/pdf,.pdf" className="sec-input" style={{ padding: 8 }} onChange={(e) => uploadCv(e.target.files?.[0])} />
            </div>
            {uploading ? <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Uploading CV...</div> : null}
            {cvFileName ? (
              <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--sec-border)', background: 'var(--sec-bg-elevated)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cvFileName}</span>
                <button type="button" className="sec-btn sec-btn-ghost sec-btn-sm" onClick={() => { setCvFileName(''); setCvUrl(''); }}>Remove</button>
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <button type="button" className="sec-btn sec-btn-secondary w-full" style={{ height: 44 }} onClick={() => setShowApplyDialog(false)}>Cancel</button>
              <button
                type="button"
                className="sec-btn sec-btn-primary w-full"
                style={{ height: 48 }}
                disabled={submitApplication.isPending || coverMessage.trim().length < 50 || coverMessage.trim().length > 1000}
                onClick={() => submitApplication.mutate()}
              >
                {submitApplication.isPending ? 'Submitting...' : 'Submit application'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}