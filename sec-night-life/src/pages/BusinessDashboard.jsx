import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { toast } from 'sonner';
import LegalDocLink from '@/components/legal/LegalDocLink';
import { Button } from "@/components/ui/button";
import {
  Calendar, BookOpen, Megaphone, BarChart3,
  Star, Users, ArrowRight, Building2, Plus,
  ChevronRight, AlertCircle, Briefcase, Loader2, ShieldCheck, FileText, Upload
} from 'lucide-react';

/** Matches backend REQUIRED_DOC_TYPES (excludes optional OTHER). */
const REQUIRED_COMPLIANCE_DOC_TYPES = [
  'LIQUOR_LICENCE',
  'BUSINESS_REGISTRATION',
  'HEALTH_CERTIFICATE',
  'TAX_CLEARANCE',
];

/** Latest payload from GET /api/compliance-documents/venue/:id/latest */
function isVenueComplianceComplete(latestPayload) {
  const docs = latestPayload?.documents;
  if (!Array.isArray(docs) || docs.length === 0) return false;
  const byType = (t) => docs.find((d) => d.documentType === t);
  for (const t of REQUIRED_COMPLIANCE_DOC_TYPES) {
    const d = byType(t);
    if (!d || d.status !== 'APPROVED') return false;
  }
  const other = byType('OTHER');
  if (other?.id && other.status !== 'APPROVED') return false;
  return true;
}

function getPublicVisibility(job) {
  if (job.status !== 'OPEN') return { isVisible: false, reason: `Hidden from public (${job.status.toLowerCase()})` };
  if (job.closingDate && new Date(job.closingDate) <= new Date()) return { isVisible: false, reason: 'Hidden from public (expired closing date)' };
  return { isVisible: true, reason: 'Visible to party goers' };
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="sec-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          backgroundColor: 'var(--sec-accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} style={{ color: 'var(--sec-accent)' }} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--sec-text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function QuickAction({ icon: Icon, label, page }) {
  return (
    <Link
      to={createPageUrl(page)}
      className="sec-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', textDecoration: 'none',
        color: 'var(--sec-text-primary)', transition: 'border-color 0.15s',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: 'var(--sec-accent-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: 'var(--sec-accent)' }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--sec-text-muted)' }} />
    </Link>
  );
}

export default function BusinessDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user?.id,
  });

  const venue = venues[0];

  useEffect(() => {
    if (!import.meta.env.DEV || !user) return;
    // Debug: remove before production deploy — confirms auth role + /api/venues/mine payload
    console.log('[BusinessDashboard] auth user', { id: user.id, role: user.role, email: user.email });
  }, [user]);

  useEffect(() => {
    if (!import.meta.env.DEV || venuesLoading) return;
    console.log('[BusinessDashboard] GET /api/venues/mine', {
      venueCount: venues?.length ?? 0,
      venues,
    });
  }, [user, venuesLoading, venues]);

  const DOC_TYPES = [
    { type: 'LIQUOR_LICENCE', label: 'Liquor Licence' },
    { type: 'BUSINESS_REGISTRATION', label: 'Business Registration' },
    { type: 'HEALTH_CERTIFICATE', label: 'Health Certificate' },
    { type: 'TAX_CLEARANCE', label: 'Tax Clearance' },
    { type: 'OTHER', label: 'Other' },
  ];

  const [complianceError, setComplianceError] = useState('');
  const [uploading, setUploading] = useState({});

  const cloudinaryConfig = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  };

  const { data: complianceLatest, refetch: refetchCompliance } = useQuery({
    queryKey: ['biz-compliance-latest', venue?.id],
    queryFn: async () => apiGet(`/api/compliance-documents/venue/${venue.id}/latest`),
    enabled: !!venue,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['biz-events', venue?.id],
    queryFn: () => dataService.Event.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['biz-tables', venue?.id],
    queryFn: () => dataService.Table.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['biz-reviews', venue?.id],
    queryFn: () => dataService.Review.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['biz-jobs', venue?.id],
    queryFn: () => apiGet(`/api/jobs/venue/${venue.id}`),
    enabled: !!venue,
  });

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
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to delete job'),
  });

  if (!user) return null;

  if (venuesLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div style={{ padding: 24, maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
          backgroundColor: 'var(--sec-accent-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={28} style={{ color: 'var(--sec-accent)' }} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No Venue Registered</h2>
        <p style={{ color: 'var(--sec-text-muted)', fontSize: 14, marginBottom: 24 }}>
          Register your venue to access the full business dashboard with analytics, event management, and more.
        </p>
        <Button
          onClick={() => navigate(createPageUrl('VenueOnboarding'))}
          className="sec-btn sec-btn-primary h-12 px-8 rounded-xl"
        >
          Register Your Venue
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = events
    .filter(e => e.date >= today && e.status === 'published')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const totalBookings = tables.length;
  const activeBookings = tables.filter(t => t.status === 'open' || t.status === 'active').length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '—';
  const totalGuests = tables.reduce((s, t) => s + (t.current_guests || 0), 0);

  const complianceCompleteFromApi = complianceLatest
    ? isVenueComplianceComplete(complianceLatest)
    : null;
  const showComplianceSection =
    !complianceLatest || !complianceCompleteFromApi;
  const headerComplianceLabel =
    complianceCompleteFromApi !== null
      ? (complianceCompleteFromApi ? 'approved' : 'pending')
      : (venue.compliance_status || 'Pending');
  const headerComplianceApproved =
    complianceCompleteFromApi === true ||
    (complianceCompleteFromApi === null && venue.compliance_status === 'approved');

  const getDocStatus = (docType) => {
    const list = complianceLatest?.documents || [];
    return list.find((d) => d.documentType === docType) || null;
  };

  const handleUploadDoc = async (docType, file) => {
    setComplianceError('');

    if (!file) return;
    if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
      setComplianceError('Cloudinary is not configured. Please contact support.');
      return;
    }

    const MAX_MB = 10;
    const maxBytes = MAX_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setComplianceError(`File is too large. Max is ${MAX_MB}MB.`);
      return;
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setComplianceError('Invalid file type. Upload PDF, JPG, or PNG only.');
      return;
    }

    const isPdf = file.type === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf');

    setUploading((prev) => ({ ...prev, [docType]: true }));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', cloudinaryConfig.uploadPreset);
      form.append('public_id', `${Date.now()}-${file.name.replace(/\.[^.]+$/, '')}`.replace(/[^a-zA-Z0-9/_-]/g, '-'));
      form.append('filename_override', file.name);
      form.append('resource_type', isPdf ? 'raw' : 'image');

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/upload`, {
        method: 'POST',
        body: form,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData?.error?.message || 'Cloudinary upload failed');
      }

      const fileUrl = uploadData.secure_url;
      if (!fileUrl) throw new Error('Cloudinary returned no secure_url');

      await apiPost('/api/compliance-documents', {
        venueId: venue.id,
        documentType: docType,
        fileUrl,
        fileName: file.name,
      });

      await refetchCompliance();
    } catch (err) {
      setComplianceError(err?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading((prev) => ({ ...prev, [docType]: false }));
    }
  };

  return (
    <div style={{ padding: 'var(--space-6) var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {venue.logo_url && (
            <img src={venue.logo_url} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--sec-border)' }} />
          )}
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)' }}>
              {venue.name}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
              {venue.city} &middot; {venue.venue_type?.replace('_', ' ')}
              {' '}&middot;{' '}
              <span style={{
                color: headerComplianceApproved
                  ? 'var(--sec-success)'
                  : 'var(--sec-warning)',
              }}>
                {headerComplianceLabel}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Compliance Notice */}
      {showComplianceSection &&
        (complianceLatest ? !complianceCompleteFromApi : venue.compliance_status !== 'approved') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderRadius: 12, marginBottom: 20,
          backgroundColor: 'var(--sec-warning-muted)', border: '1px solid rgba(212,160,23,0.2)',
        }}>
          <AlertCircle size={18} style={{ color: 'var(--sec-warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--sec-warning)' }}>
            Your venue compliance is pending review. Some features may be limited until documents are submitted and approved.
          </span>
        </div>
      )}

      {/* Compliance Documents Upload */}
      {showComplianceSection && (
      <div className="sec-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={18} style={{ color: 'var(--sec-accent)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--sec-text-primary)', margin: 0 }}>Compliance Documents</h3>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
              Upload required documents for verification. See the{' '}
              <LegalDocLink pageName="VenueComplianceCharter">Venue Compliance Charter</LegalDocLink>.
            </p>
          </div>
        </div>

        {complianceError && (
          <div style={{ padding: '10px 12px', borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
            {complianceError}
          </div>
        )}

        {!complianceLatest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--sec-text-muted)', fontSize: 13 }}>
            <Loader2 size={16} className="animate-spin" /> Loading compliance status...
          </div>
        )}

        {complianceLatest && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {DOC_TYPES.map((d) => {
              const status = getDocStatus(d.type);
              const uploadedAt = status?.uploadedAt ? new Date(status.uploadedAt).toLocaleDateString() : null;
              const currentStatus = status?.status || 'PENDING';
              const hasFile = Boolean(status?.id);
              const isApproved = currentStatus === 'APPROVED';
              const isRejected = currentStatus === 'REJECTED';
              const canUpload = !isApproved;

              const statusText = !hasFile
                ? 'Not submitted'
                : isApproved
                  ? 'Approved'
                  : isRejected
                    ? 'Rejected'
                    : 'Pending';

              return (
                <div key={d.type} style={{ padding: 14, borderRadius: 14, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={16} style={{ color: 'var(--sec-accent)' }} />
                        <p style={{ fontWeight: 900, fontSize: 13, color: 'var(--sec-text-primary)', margin: 0 }}>{d.label}</p>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
                        Status:{' '}
                        <span style={{ color: isApproved ? 'var(--sec-success)' : (isRejected ? 'var(--sec-warning)' : 'var(--sec-accent)') }}>
                          {statusText}
                        </span>
                        {uploadedAt ? ` · ${uploadedAt}` : ''}
                      </p>
                      {isRejected && status?.rejectionReason && (
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
                          Rejection reason: {status.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: canUpload ? 'pointer' : 'not-allowed', opacity: canUpload ? 1 : 0.55 }}>
                      <Upload size={16} />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {isApproved ? 'Approved' : uploading[d.type] ? 'Uploading...' : hasFile && isRejected ? 'Re-upload' : 'Upload'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        style={{ display: 'none' }}
                        disabled={!canUpload || uploading[d.type]}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          handleUploadDoc(d.type, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Max 10MB · PDF/JPG/PNG</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard icon={Calendar} label="Total Events" value={events.length} sub={`${upcomingEvents.length} upcoming`} />
        <StatCard icon={BookOpen} label="Table Bookings" value={totalBookings} sub={`${activeBookings} active`} />
        <StatCard icon={Star} label="Average Rating" value={avgRating} sub={`${reviews.length} reviews`} />
        <StatCard icon={Users} label="Total Guests" value={totalGuests} />
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <QuickAction icon={Plus} label="Create Event" page="BusinessEvents" />
          <QuickAction icon={BookOpen} label="Manage Bookings" page="BusinessBookings" />
          <QuickAction icon={BarChart3} label="View Analytics" page="VenueAnalytics" />
          <QuickAction icon={Megaphone} label="Promotions" page="BusinessPromotions" />
          <QuickAction icon={Briefcase} label="Post a Job" page="CreateJob" />
        </div>
      </div>

      <div className="sec-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Jobs</h3>
          <Link
            to={createPageUrl('CreateJob')}
            className="sec-btn sec-btn-primary sec-btn-md"
            style={{ textDecoration: 'none', flexShrink: 0 }}
          >
            Post Job
          </Link>
        </div>
        {jobs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>No job postings yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {jobs.map((j) => (
              <div key={j.id} style={{ border: '1px solid var(--sec-border)', borderRadius: 12, padding: 14 }}>
                {(() => {
                  const visibility = getPublicVisibility(j);
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
                    <p style={{ fontWeight: 700, margin: 0 }}>{j.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                      {j.jobType} · {j._count?.applications || 0} applications
                    </p>
                    <p style={{ marginTop: 8, fontSize: 12, color: 'var(--sec-text-muted)' }}>
                      {j.filledSpots} of {j.totalSpots} filled
                      {j.closingDate ? ` · closes ${new Date(j.closingDate).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <span className={`sec-badge ${j.status === 'OPEN' ? 'sec-badge-success' : j.status === 'FILLED' ? 'sec-badge-gold' : 'sec-badge-muted'}`}>{j.status}</span>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                  <Link
                    to={createPageUrl(`JobDetails?id=${j.id}`)}
                    className="sec-btn sec-btn-secondary"
                    style={{ textDecoration: 'none', height: 42, width: '100%', boxSizing: 'border-box' }}
                  >
                    View Applicants
                  </Link>
                  <Link
                    to={`${createPageUrl('BusinessJobs')}?edit=${encodeURIComponent(j.id)}`}
                    className="sec-btn sec-btn-secondary"
                    style={{ textDecoration: 'none', height: 42, width: '100%', boxSizing: 'border-box' }}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className={`sec-btn ${j.status === 'OPEN' ? 'sec-btn-secondary' : 'sec-btn-primary'}`}
                    style={{ height: 42, width: '100%' }}
                    disabled={jobStatusMutation.isPending}
                    onClick={() => {
                      const status = j.status === 'OPEN' ? 'CLOSED' : 'OPEN';
                      jobStatusMutation.mutate({ jobId: j.id, status });
                    }}
                  >
                    {jobStatusMutation.isPending ? 'Saving...' : (j.status === 'OPEN' ? 'Close Job' : 'Open Job')}
                  </button>
                  <button
                    type="button"
                    className="sec-btn sec-btn-secondary"
                    style={{ height: 42, width: '100%', borderColor: 'rgba(217, 85, 85, 0.35)', color: 'var(--sec-error)' }}
                    disabled={deleteJobMutation.isPending}
                    onClick={() => {
                      const ok = window.confirm('Delete this job post? This action cannot be undone.');
                      if (!ok) return;
                      deleteJobMutation.mutate(j.id);
                    }}
                  >
                    {deleteJobMutation.isPending ? 'Deleting...' : 'Delete Job'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="biz-grid-responsive">
        {/* Upcoming Events */}
        <div className="sec-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Upcoming Events</h3>
            <Link to={createPageUrl('BusinessEvents')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none' }}>View all</Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Calendar size={24} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>No upcoming events</p>
              <Link to={createPageUrl('BusinessEvents')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none', marginTop: 6, display: 'inline-block' }}>
                Create your first event
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcomingEvents.map(evt => (
                <div key={evt.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    backgroundColor: 'var(--sec-accent-muted)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sec-accent)', lineHeight: 1 }}>
                      {new Date(evt.date + 'T00:00').toLocaleDateString('en', { day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--sec-text-muted)', textTransform: 'uppercase' }}>
                      {new Date(evt.date + 'T00:00').toLocaleDateString('en', { month: 'short' })}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {evt.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>{evt.city}</div>
                  </div>
                  <span className={`sec-badge ${evt.status === 'published' ? 'sec-badge-success' : 'sec-badge-gold'}`}>
                    {evt.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Bookings */}
        <div className="sec-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Recent Bookings</h3>
            <Link to={createPageUrl('BusinessBookings')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none' }}>View all</Link>
          </div>
          {tables.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <BookOpen size={24} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>No table bookings yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tables.slice(0, 5).map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    backgroundColor: 'var(--sec-accent-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Users size={16} style={{ color: 'var(--sec-accent)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
                      {t.current_guests || 0}/{t.max_guests || '—'} guests
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>
                      Min spend: R{t.min_spend || 0}
                    </div>
                  </div>
                  <span className={`sec-badge ${t.status === 'open' ? 'sec-badge-success' : 'sec-badge-muted'}`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .biz-grid-responsive { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
