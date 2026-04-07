import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiGet, apiPatch, apiPost } from '@/api/client';
import * as authService from '@/services/authService';
import { toast } from 'sonner';

function compensationText(job) {
  if (job.compensationPer === 'COMMISSION') return 'Commission based';
  if (job.compensationType === 'NEGOTIABLE') return 'Negotiable';
  if (job.compensationType === 'UNPAID_TRIAL') return 'Unpaid trial';
  if (job.compensationAmount) return `R${Number(job.compensationAmount).toFixed(0)} per ${String(job.compensationPer || 'MONTH').toLowerCase()}`;
  return 'Compensation not specified';
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

  useEffect(() => {
    authService.getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: job, isLoading } = useQuery({
    queryKey: ['public-job', jobId],
    queryFn: () => apiGet(`/api/jobs/public/${jobId}`),
    enabled: !!jobId,
  });

  const { data: ownerJob } = useQuery({
    queryKey: ['owner-job', jobId],
    queryFn: () => apiGet(`/api/jobs/${jobId}`),
    retry: false,
    enabled: !!jobId && !!user && user.role === 'VENUE',
  });

  const { data: myApplications = [] } = useQuery({
    queryKey: ['my-apps'],
    queryFn: () => apiGet('/api/jobs/my-applications'),
    retry: false,
    enabled: !!user && user.role === 'USER',
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
    onSuccess: () => {
      toast.success('Application submitted');
      setShowApplyDialog(false);
      queryClient.invalidateQueries({ queryKey: ['my-apps'] });
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
    },
  });

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
      if (data?.cvUrl) window.open(data.cvUrl, '_blank');
    } catch (err) {
      toast.error(err?.data?.error || 'Cannot access CV');
    }
  }

  if (isLoading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><div className="sec-spinner" /></div>;
  if (!job) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Job not found</div>;

  const spotsRemaining = Math.max((job.totalSpots || 0) - (job.filledSpots || 0), 0);
  const canApply = user?.role === 'USER' && !selectedMyApplication && job.status === 'OPEN' && spotsRemaining > 0;

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
        <button onClick={() => setShowApplyDialog(true)} className="sec-btn sec-btn-primary w-full" style={{ marginTop: 14, height: 48 }}>Apply</button>
      ) : selectedMyApplication ? (
        <div className="sec-badge sec-badge-success" style={{ marginTop: 14 }}>Applied</div>
      ) : null}

      {ownerJob?.applications?.length ? (
        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          <h2>Applicants</h2>
          {ownerJob.applications.map((a) => (
            <div key={a.id} className="sec-card" style={{ padding: 14, borderRadius: 12 }}>
              <p style={{ fontWeight: 700 }}>{a.applicant?.fullName || 'Applicant'}</p>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{a.applicant?.email}</p>
              <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{a.coverMessage}</p>
              {a.portfolioUrl ? <a href={a.portfolioUrl} target="_blank" rel="noreferrer">Portfolio</a> : null}
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => viewCv(a.id)}>View CV</button>
                {a.status !== 'SHORTLISTED' ? <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'SHORTLISTED' })}>Shortlist</button> : null}
                {a.status !== 'REJECTED' ? <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'REJECTED' })}>Reject</button> : null}
                {a.status !== 'HIRED' ? <button className="sec-btn sec-btn-primary" style={{ height: 44, minWidth: 44 }} onClick={() => updateStatus.mutate({ applicationId: a.id, status: 'HIRED' })}>Hire</button> : null}
                <button className="sec-btn sec-btn-secondary" style={{ height: 44, minWidth: 44 }} onClick={() => setSelectedApplication(a)}>Message</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeApplicationId ? (
        <div className="sec-card" style={{ marginTop: 20, padding: 14, borderRadius: 12 }}>
          <h3>Messages</h3>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, marginTop: 8 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ justifySelf: m.senderUserId === user?.id ? 'end' : 'start', maxWidth: '85%', background: m.senderUserId === user?.id ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{m.sender?.fullName || 'User'} · {new Date(m.sentAt).toLocaleString()}</div>
                <div>{m.body}</div>
                <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{m.readAt ? 'Read' : 'Sent'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <input className="sec-input" value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Type a message..." />
            <button className="sec-btn sec-btn-primary" style={{ height: 44, minWidth: 44 }} disabled={!messageBody.trim() || sendMessage.isPending} onClick={() => sendMessage.mutate()}>
              {sendMessage.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply for {job.title}</DialogTitle>
            <DialogDescription>Submit your application details.</DialogDescription>
          </DialogHeader>
          <div style={{ display: 'grid', gap: 10 }}>
            <Textarea value={coverMessage} onChange={(e) => setCoverMessage(e.target.value)} placeholder="Cover message (50-1000 chars)" />
            <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>{coverMessage.length}/1000</div>
            <input type="url" className="sec-input" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="Portfolio URL (optional)" />
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => uploadCv(e.target.files?.[0])} />
            {uploading ? <div style={{ fontSize: 12 }}>Uploading CV...</div> : null}
            {cvFileName ? (
              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>{cvFileName}</span>
                <button onClick={() => { setCvFileName(''); setCvUrl(''); }} type="button">Remove</button>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="outline" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
              <button
                className="sec-btn sec-btn-primary"
                disabled={submitApplication.isPending || coverMessage.trim().length < 50 || coverMessage.trim().length > 1000}
                onClick={() => submitApplication.mutate()}
              >
                {submitApplication.isPending ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}