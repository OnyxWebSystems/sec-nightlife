import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { asArray, buildPageUrl, createPageUrl } from '@/utils';
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
  ChevronRight, AlertCircle, Briefcase, Loader2, ShieldCheck, FileText, Upload, UtensilsCrossed, Armchair, Wallet,
  Settings,
} from 'lucide-react';
import VenueSecWallet from '@/components/wallet/VenueSecWallet';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import AddStaffModal from '@/components/business/AddStaffModal';
import VenueStaffPanel from '@/components/business/VenueStaffPanel';
import { useVenueStaffAccess } from '@/hooks/useVenueStaffAccess';

const QUICK_ACTIONS = [
  { icon: Plus, label: 'Create Event', page: 'BusinessEvents', perm: 'events' },
  { icon: BookOpen, label: 'Manage Bookings', page: 'BusinessBookings', perm: 'bookings' },
  { icon: Armchair, label: 'Tables & day bookings', page: 'BusinessVenueTables', perm: 'bookings' },
  { icon: BarChart3, label: 'View Analytics', page: 'VenueAnalytics', perm: 'analytics' },
  { icon: Megaphone, label: 'Promotions', page: 'BusinessPromotions', perm: 'promotions' },
  { icon: UtensilsCrossed, label: 'Menu Maker', page: 'BusinessMenu', perm: 'menu' },
  { icon: Briefcase, label: 'Post a Job', page: 'CreateJob', perm: 'jobs' },
];

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
  const [userProfile, setUserProfile] = useState(null);

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

  useEffect(() => {
    if (!user?.email) return;
    dataService.User.filter({ created_by: user.email }).then((profiles) => {
      setUserProfile(profiles?.[0] || null);
    }).catch(() => {});
  }, [user?.email]);

  const { venues, activeVenue: venue, isLoading: venuesLoading, setActiveVenueId, refreshVenues } = useActiveVenue();
  const { isVenueOwner, isStaffOnly, can, venuesLoading } = useVenueStaffAccess();

  useEffect(() => {
    if (venuesLoading || !isStaffOnly) return;
    if (!can('dashboard')) {
      navigate(createPageUrl('StaffDashboard'), { replace: true });
    }
  }, [isStaffOnly, can, navigate, venuesLoading]);

  const DOC_TYPES = [
    { type: 'LIQUOR_LICENCE', label: 'Liquor Licence' },
    { type: 'BUSINESS_REGISTRATION', label: 'Business Registration' },
    { type: 'HEALTH_CERTIFICATE', label: 'Health Certificate' },
    { type: 'TAX_CLEARANCE', label: 'Tax Clearance' },
    { type: 'OTHER', label: 'Other' },
  ];

  const [complianceError, setComplianceError] = useState('');
  const [uploading, setUploading] = useState({});
  const [staffModalOpen, setStaffModalOpen] = useState(false);

  const cloudinaryConfig = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  };

  const { data: complianceLatest, refetch: refetchCompliance } = useQuery({
    queryKey: ['biz-compliance-latest', venue?.id],
    queryFn: async () => apiGet(`/api/compliance-documents/venue/${venue.id}/latest`),
    enabled: !!venue && isVenueOwner,
  });

  const { data: eventsRaw } = useQuery({
    queryKey: ['biz-events', venue?.id],
    queryFn: () => dataService.Event.filter({ venue_id: venue.id }),
    enabled: !!venue && (!isStaffOnly || can('events')),
    staleTime: 3 * 60_000,
  });

  const { data: bookingStatsRaw, isLoading: bookingStatsLoading } = useQuery({
    queryKey: ['biz-dashboard-booking-stats', venue?.id],
    queryFn: () => apiGet(`/api/business/dashboard-booking-stats?venue_id=${encodeURIComponent(venue.id)}`),
    enabled: !!venue && (!isStaffOnly || can('bookings')),
    staleTime: 2 * 60_000,
  });

  const { data: reviewsRaw } = useQuery({
    queryKey: ['biz-reviews', venue?.id],
    queryFn: () => dataService.Review.filter({ venue_id: venue.id }),
    enabled: !!venue && (!isStaffOnly || can('analytics')),
    staleTime: 5 * 60_000,
  });

  const { data: jobsRaw } = useQuery({
    queryKey: ['biz-jobs', venue?.id],
    queryFn: () => apiGet(`/api/jobs/venue/${venue.id}`),
    enabled: !!venue && (!isStaffOnly || can('jobs')),
    staleTime: 2 * 60_000,
  });

  const events = asArray(eventsRaw);
  const reviews = asArray(reviewsRaw);
  const jobs = asArray(jobsRaw);
  const bookingStats = bookingStatsRaw || {};
  const recentBookings = asArray(bookingStats.recentBookings);

  const jobStatusMutation = useMutation({
    mutationFn: ({ jobId, status }) => apiPatch(`/api/jobs/${jobId}`, { status }),
    onSuccess: () => {
      toast.success('Job status updated');
      qc.invalidateQueries({ queryKey: ['biz-jobs', venue?.id] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to update job status'),
  });

  const [deletingJobId, setDeletingJobId] = useState(null);

  const deleteJobMutation = useMutation({
    mutationFn: (jobId) => apiDelete(`/api/jobs/${jobId}`),
    onMutate: (jobId) => {
      setDeletingJobId(jobId);
    },
    onSuccess: (data, jobId) => {
      const n = data?.applicationCount || 0;
      toast.success(
        n > 0
          ? `Job deleted (${n} application${n === 1 ? '' : 's'} removed)`
          : 'Job deleted',
      );
      qc.setQueryData(['biz-jobs', venue?.id], (old) =>
        asArray(old).filter((j) => j.id !== jobId),
      );
      qc.invalidateQueries({ queryKey: ['biz-jobs', venue?.id] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Failed to delete job'),
    onSettled: () => setDeletingJobId(null),
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
    if (isStaffOnly) {
      return (
        <div style={{ padding: 24, maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
            backgroundColor: 'var(--sec-accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={28} style={{ color: 'var(--sec-accent)' }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No venue assigned</h2>
          <p style={{ color: 'var(--sec-text-muted)', fontSize: 14, marginBottom: 24 }}>
            You don&apos;t have active staff access to any venue. Check your Staff Dashboard for assignments.
          </p>
          <Button
            onClick={() => navigate(createPageUrl('StaffDashboard'))}
            className="sec-btn sec-btn-primary h-12 px-8 rounded-xl"
          >
            Go to Staff Dashboard
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      );
    }
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
  const totalBookings = bookingStats.totalBookings ?? 0;
  const activeBookings = bookingStats.activeBookings ?? 0;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '—';
  const totalGuests = bookingStats.totalGuests ?? 0;

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

  const visibleQuickActions = QUICK_ACTIONS.filter((a) => !isStaffOnly || can(a.perm));
  const showEventsStats = !isStaffOnly || can('events');
  const showBookingsStats = !isStaffOnly || can('bookings');
  const showAnalyticsStats = !isStaffOnly || can('analytics');

  return (
    <div className="pb-10" style={{ padding: 'var(--space-6) var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ marginBottom: 16 }}>
          <VenueSwitcher />
        </div>
        <div
          className="sec-card"
          style={{
            padding: '20px 22px',
            background: 'linear-gradient(145deg, var(--sec-bg-card) 0%, var(--sec-bg-elevated) 100%)',
            border: '1px solid var(--sec-border)',
            borderRadius: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
            {venue.logo_url ? (
              <img
                src={venue.logo_url}
                alt=""
                style={{
                  width: 52,
                  height: 52,
                  objectFit: 'contain',
                  borderRadius: 12,
                  background: 'var(--sec-bg-elevated)',
                  padding: 4,
                  border: '1px solid var(--sec-border)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--sec-accent-muted)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                <Building2 size={22} style={{ color: 'var(--sec-accent)' }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--sec-text-primary)', marginBottom: 4 }}>
                {venue.name}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
                {venue.city} &middot; {venue.venue_type?.replace('_', ' ')}
                {' '}&middot;{' '}
                <span style={{
                  color: headerComplianceApproved ? 'var(--sec-success)' : 'var(--sec-warning)',
                  fontWeight: 600,
                }}>
                  {headerComplianceLabel}
                </span>
              </p>
            </div>
          </div>

          {isVenueOwner ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            <button
              type="button"
              className="biz-dash-action"
              onClick={() =>
                navigate(`${createPageUrl('VenueOnboarding')}?edit=1&venueId=${encodeURIComponent(venue.id)}`)
              }
            >
              <span className="biz-dash-action-icon">
                <Settings size={16} />
              </span>
              <span className="biz-dash-action-text">
                <span className="biz-dash-action-label">Edit venue setup</span>
                <span className="biz-dash-action-hint">Profile, hours &amp; details</span>
              </span>
            </button>
            <button
              type="button"
              className="biz-dash-action"
              onClick={() => navigate(createPageUrl('VenueOnboarding') + '?new=1')}
            >
              <span className="biz-dash-action-icon">
                <Plus size={16} />
              </span>
              <span className="biz-dash-action-text">
                <span className="biz-dash-action-label">Register another venue</span>
                <span className="biz-dash-action-hint">Add a new location</span>
              </span>
            </button>
          </div>
          ) : isStaffOnly ? (
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', margin: 0 }}>
              Staff view — you only see tools assigned to you for this venue.
            </p>
          ) : null}
        </div>
      </div>

      {isVenueOwner ? (
        <VenueStaffPanel venueId={venue.id} onInvite={() => setStaffModalOpen(true)} />
      ) : null}

      {isVenueOwner && !venue?.paystack_recipient_code && !venue?.paystackRecipientCode ? (
        <div style={{
          padding: '12px 16px',
          borderRadius: 12,
          marginBottom: 16,
          backgroundColor: 'var(--sec-bg-card)',
          border: '1px solid var(--sec-border)',
        }}>
          <p style={{ fontSize: 13, color: 'var(--sec-text-primary)' }}>
            Venue payout setup missing. Complete your bank details in the Sec Wallet section below to prevent pending payouts.
          </p>
        </div>
      ) : null}

      {/* Compliance Notice */}
      {isVenueOwner && showComplianceSection &&
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
      {isVenueOwner && showComplianceSection && (
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
      {(showEventsStats || showBookingsStats || showAnalyticsStats) && (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ marginBottom: 24 }}>
        {showEventsStats ? (
          <StatCard icon={Calendar} label="Total Events" value={events.length} sub={`${upcomingEvents.length} upcoming`} />
        ) : null}
        {showBookingsStats ? (
          <>
            <StatCard icon={BookOpen} label="Table Bookings" value={totalBookings} sub={`${activeBookings} active`} />
            <StatCard icon={Users} label="Total Guests" value={totalGuests} />
          </>
        ) : null}
        {showAnalyticsStats ? (
          <StatCard icon={Star} label="Average Rating" value={avgRating} sub={`${reviews.length} reviews`} />
        ) : null}
      </div>
      )}

      {/* Quick Actions */}
      {visibleQuickActions.length > 0 && (
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Quick Actions</h3>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleQuickActions.map((action) => (
            <QuickAction key={action.page} icon={action.icon} label={action.label} page={action.page} />
          ))}
        </div>
      </div>
      )}

      {(!isStaffOnly || can('jobs')) && (
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
                    to={buildPageUrl('BusinessJobs', { job: j.id, view: 'applicants' })}
                    className="sec-btn sec-btn-secondary"
                    style={{ textDecoration: 'none', height: 42, width: '100%', boxSizing: 'border-box' }}
                  >
                    View Applicants
                  </Link>
                  <Link
                    to={buildPageUrl('BusinessJobs', { job: j.id, view: 'edit' })}
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
                    disabled={deletingJobId === j.id}
                    onClick={() => {
                      const appCount = j._count?.applications || 0;
                      const msg =
                        appCount > 0
                          ? `Delete "${j.title}"? This will permanently remove ${appCount} application${appCount === 1 ? '' : 's'} and all related messages.`
                          : `Delete "${j.title}"? This action cannot be undone.`;
                      if (!window.confirm(msg)) return;
                      deleteJobMutation.mutate(j.id);
                    }}
                  >
                    {deletingJobId === j.id ? 'Deleting...' : 'Delete Job'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Sec Wallet */}
      {isVenueOwner ? (
      <div className="sec-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            backgroundColor: 'var(--sec-accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wallet size={18} style={{ color: 'var(--sec-accent)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--sec-text-primary)', margin: 0 }}>Sec Wallet</h3>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
              Venue earnings, payout setup, and staff payment lookups.
            </p>
          </div>
        </div>
        <VenueSecWallet
          venues={venues}
          onVenuesUpdated={() => qc.invalidateQueries({ queryKey: ['biz-venues', user?.id] })}
        />
      </div>
      ) : null}

      {/* Two-Column Layout */}
      {((!isStaffOnly || can('events')) || (!isStaffOnly || can('bookings'))) && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="biz-grid-responsive">
        {/* Upcoming Events */}
        {(!isStaffOnly || can('events')) ? (
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
        ) : null}

        {/* Recent Bookings */}
        {(!isStaffOnly || can('bookings')) ? (
        <div className="sec-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Recent Bookings</h3>
            <Link to={createPageUrl('BusinessBookings')} style={{ fontSize: 12, color: 'var(--sec-accent)', textDecoration: 'none' }}>View all</Link>
          </div>
          {bookingStatsLoading ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sec-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Loading bookings…</p>
            </div>
          ) : recentBookings.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <BookOpen size={24} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>No table bookings yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentBookings.map((t) => (
                <div key={`${t.type}-${t.id}`} style={{
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.tableName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>
                      {t.guestCount}{t.capacity ? `/${t.capacity}` : ''} guests · {t.subLabel}
                    </div>
                  </div>
                  <span className={`sec-badge ${['ACTIVE', 'PARTIALLY_FILLED', 'FULL'].includes(String(t.status || '').toUpperCase()) ? 'sec-badge-success' : 'sec-badge-muted'}`}>
                    {String(t.status || 'booked').toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        ) : null}
      </div>
      )}

      {isVenueOwner ? (
      <AddStaffModal open={staffModalOpen} onOpenChange={setStaffModalOpen} venueId={venue?.id} />
      ) : null}

      <style>{`
        .biz-dash-action {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid var(--sec-border);
          background: var(--sec-bg-elevated);
          color: var(--sec-text-primary);
          text-align: left;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .biz-dash-action:hover {
          border-color: var(--sec-accent-border);
          background: var(--sec-bg-card);
        }
        .biz-dash-action:active { transform: scale(0.98); }
        .biz-dash-action-accent {
          border-color: rgba(212, 175, 55, 0.35);
          background: linear-gradient(145deg, var(--sec-accent-muted) 0%, var(--sec-bg-elevated) 100%);
        }
        .biz-dash-action-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: var(--sec-accent-muted);
          color: var(--sec-accent);
        }
        .biz-dash-action-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .biz-dash-action-label { font-size: 13px; font-weight: 700; line-height: 1.2; }
        .biz-dash-action-hint { font-size: 11px; color: var(--sec-text-muted); line-height: 1.3; }
        @media (max-width: 768px) {
          .biz-grid-responsive { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
