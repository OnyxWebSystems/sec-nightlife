import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Shield,
  Building2,
  ChevronRight,
  Check,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Gavel,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

function withPdfInlineParams(fileUrl) {
  if (!fileUrl) return fileUrl;
  // If the URL is signed (Cloudinary commonly includes query params like `s`/`e`/`signature`),
  // appending our own query params can invalidate the signature and cause 401.
  const lower = fileUrl.toLowerCase();
  const looksSigned = lower.includes('signature=') || /[?&]s=/.test(lower) || /[?&]e=/.test(lower);
  if (looksSigned) return fileUrl;

  // Encourage inline rendering without forcing downloads (only for unsigned URLs).
  const paramsToAdd = [
    ['response-content-disposition', 'inline'],
    ['attachment', 'false'],
    ['fl_attachment', 'false'],
  ];

  let url = fileUrl;
  for (const [k, v] of paramsToAdd) {
    const hasParam = new RegExp(`([?&])${k}=`, 'i').test(url);
    if (hasParam) continue;
    url += `${url.includes('?') ? '&' : '?'}${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  }
  return url;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedVenueId = searchParams.get('venueId');
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [userVerifications, setUserVerifications] = useState([]);
  const [venueVerifications, setVenueVerifications] = useState([]);
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const [complianceAccess, setComplianceAccess] = useState(null); // { canReview, isSuperAdmin }
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectReasons, setRejectReasons] = useState({});
  const [rejectErrors, setRejectErrors] = useState({});
  const [reviewingDocId, setReviewingDocId] = useState(null);

  const [reviewers, setReviewers] = useState([]);
  const [reviewerManagementLoading, setReviewerManagementLoading] = useState(false);
  const [newReviewer, setNewReviewer] = useState({ name: '', email: '' });
  const [addingReviewer, setAddingReviewer] = useState(false);
  const [deletingReviewerId, setDeletingReviewerId] = useState(null);
  const [dashboardDelegates, setDashboardDelegates] = useState([]);
  const [delegateManagementLoading, setDelegateManagementLoading] = useState(false);
  const [newDelegate, setNewDelegate] = useState({ name: '', email: '' });
  const [addingDelegate, setAddingDelegate] = useState(false);
  const [deletingDelegateId, setDeletingDelegateId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [flaggedReviews, setFlaggedReviews] = useState({ userReviews: [], venueReviews: [] });
  const [reports, setReports] = useState([]);
  const [reportFilters, setReportFilters] = useState({ status: 'pending', priority: '', category: '' });
  const [reportResolutionNotes, setReportResolutionNotes] = useState({});
  const [promoterCandidates, setPromoterCandidates] = useState([]);
  const [promoterLoading, setPromoterLoading] = useState(false);

  const loadFlaggedReviews = async () => {
    try {
      const res = await apiGet('/api/reviews/admin/flagged');
      setFlaggedReviews({
        userReviews: res?.userReviews || [],
        venueReviews: res?.venueReviews || [],
      });
    } catch {
      setFlaggedReviews({ userReviews: [], venueReviews: [] });
    }
  };

  const loadReports = async (filters = reportFilters) => {
    try {
      const qs = new URLSearchParams({ status: filters.status || 'pending', limit: '100' });
      if (filters.priority) qs.set('priority', filters.priority);
      if (filters.category) qs.set('category', filters.category);
      const res = await apiGet(`/api/admin/reports?${qs.toString()}`);
      setReports(res?.reports || []);
    } catch {
      setReports([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);

        let access = null;
        try {
          access = await apiGet('/api/compliance-documents/me/access');
        } catch {
          access = { canReview: false, isSuperAdmin: false };
        }
        setComplianceAccess(access);

        const canAdminDashboard = Boolean(u?.can_admin_dashboard) || ['ADMIN', 'SUPER_ADMIN'].includes(u?.role);
        if (!canAdminDashboard) {
          navigate(createPageUrl('Home'));
          return;
        }

        const shouldLoadAdminQueues = canAdminDashboard;
        const isSuperAdminUser = !!(access?.isSuperAdmin || u?.role === 'SUPER_ADMIN');
        if (shouldLoadAdminQueues) {
          const [dashboardRes, paymentsRes, usersRes, venuesRes] = await Promise.all([
            apiGet('/api/admin/dashboard'),
            apiGet('/api/admin/payments?limit=20'),
            apiGet('/api/admin/verification/users?status=pending&limit=20'),
            apiGet('/api/admin/verification/venues?status=pending&limit=20'),
          ]);
          setStats(dashboardRes?.stats || {});
          setPayments(paymentsRes?.payments || []);
          setUserVerifications(usersRes?.profiles || []);
          setVenueVerifications(venuesRes?.venues || []);
          if (isSuperAdminUser) {
            try {
              const flaggedRes = await apiGet('/api/reviews/admin/flagged');
              setFlaggedReviews({
                userReviews: flaggedRes?.userReviews || [],
                venueReviews: flaggedRes?.venueReviews || [],
              });
            } catch {
              setFlaggedReviews({ userReviews: [], venueReviews: [] });
            }
            await loadReports();
          }
        }
      } catch (e) {
        if (e?.status === 403) navigate(createPageUrl('Home'));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handleUserVerification = async (userId, status, note) => {
    setActionLoading(userId);
    try {
      await apiPatch(`/api/admin/verification/users/${userId}`, { status, note });
      setUserVerifications((prev) => prev.filter((p) => p.userId !== userId));
    } catch {}
    setActionLoading(null);
  };

  const handleViewUserIdDocument = async (userId) => {
    try {
      const { viewUrl } = await apiGet(`/api/admin/verification/users/${userId}/id-document`);
      if (viewUrl) window.open(withPdfInlineParams(viewUrl), '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not open document');
    }
  };

  const handleVenueCompliance = async (venueId, status, note) => {
    setActionLoading(venueId);
    try {
      await apiPatch(`/api/admin/venues/${venueId}/compliance`, { status, note });
      setVenueVerifications((prev) => prev.filter((v) => v.id !== venueId));
    } catch {}
    setActionLoading(null);
  };

  const loadPendingDocuments = async () => {
    setPendingLoading(true);
    try {
      const res = await apiGet('/api/compliance-documents/admin/pending-documents');
      setPendingDocuments(res?.pendingDocuments || []);
    } catch {
      setPendingDocuments([]);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'compliance-documents') return;
    if (!complianceAccess?.canReview) return;
    loadPendingDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, complianceAccess]);

  useEffect(() => {
    if (tab !== 'promoters') return;
    (async () => {
      setPromoterLoading(true);
      try {
        const res = await apiGet('/api/admin/promoters/candidates');
        setPromoterCandidates(res?.data || []);
      } catch {
        setPromoterCandidates([]);
      } finally {
        setPromoterLoading(false);
      }
    })();
  }, [tab]);

  const reloadPromoters = async () => {
    const res = await apiGet('/api/admin/promoters/candidates');
    setPromoterCandidates(res?.data || []);
  };

  const handlePromoterVerify = async (userId) => {
    setActionLoading(`promoter-verify-${userId}`);
    try {
      await apiPatch(`/api/admin/promoters/${userId}/verify`, {});
      await reloadPromoters();
      toast.success('Promoter verified');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to verify promoter');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoterRevoke = async (userId) => {
    const reason = window.prompt('Reason for revoking promoter badge:');
    if (!reason) return;
    setActionLoading(`promoter-revoke-${userId}`);
    try {
      await apiPatch(`/api/admin/promoters/${userId}/revoke`, { reason });
      await reloadPromoters();
      toast.success('Promoter badge revoked');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to revoke promoter');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoterVisibility = async (userId, hidden) => {
    const reason = hidden ? (window.prompt('Reason for hiding from leaderboard:') || null) : null;
    setActionLoading(`promoter-visibility-${userId}`);
    try {
      await apiPatch(`/api/admin/promoters/${userId}/leaderboard-visibility`, { hidden, reason });
      await reloadPromoters();
      toast.success(hidden ? 'Promoter hidden from leaderboard' : 'Promoter restored to leaderboard');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to update visibility');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (tab !== 'compliance-documents') return;
    if (!complianceAccess?.isSuperAdmin) return;

    (async () => {
      setReviewerManagementLoading(true);
      try {
        const res = await apiGet('/api/compliance-documents/admin/reviewers');
        setReviewers(res?.reviewers || []);
      } catch {
        setReviewers([]);
      } finally {
        setReviewerManagementLoading(false);
      }
    })();
  }, [tab, complianceAccess]);

  useEffect(() => {
    if (tab !== 'compliance-documents') return;
    if (!complianceAccess?.isSuperAdmin) return;

    (async () => {
      setDelegateManagementLoading(true);
      try {
        const res = await apiGet('/api/admin/delegates');
        setDashboardDelegates(res?.delegates || []);
      } catch {
        setDashboardDelegates([]);
      } finally {
        setDelegateManagementLoading(false);
      }
    })();
  }, [tab, complianceAccess]);

  const handleReviewAction = async (docId, nextStatus) => {
    if (reviewingDocId) return;

    if (nextStatus === 'REJECTED') {
      const reason = (rejectReasons[docId] || '').trim();
      if (!reason) {
        setRejectErrors((prev) => ({ ...prev, [docId]: 'Rejection reason is required.' }));
        return;
      }
    }

    setRejectErrors((prev) => ({ ...prev, [docId]: null }));
    setReviewingDocId(docId);
    try {
      const payload = nextStatus === 'REJECTED'
        ? { status: nextStatus, rejectionReason: rejectReasons[docId] }
        : { status: nextStatus };
      await apiPatch(`/api/compliance-documents/${docId}/review`, payload);
      await loadPendingDocuments();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Review failed');
    } finally {
      setReviewingDocId(null);
    }
  };

  const handleToggleReviewer = async (reviewerId, nextIsActive) => {
    setReviewerManagementLoading(true);
    try {
      await apiPatch(`/api/compliance-documents/admin/reviewers/${reviewerId}`, { isActive: nextIsActive });
      const res = await apiGet('/api/compliance-documents/admin/reviewers');
      setReviewers(res?.reviewers || []);
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to update reviewer');
    } finally {
      setReviewerManagementLoading(false);
    }
  };

  const handleAddReviewer = async () => {
    if (addingReviewer) return;
    setAddingReviewer(true);
    try {
      await apiPost('/api/compliance-documents/admin/reviewers', newReviewer);
      setNewReviewer({ name: '', email: '' });
      const res = await apiGet('/api/compliance-documents/admin/reviewers');
      setReviewers(res?.reviewers || []);
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to add reviewer');
    } finally {
      setAddingReviewer(false);
    }
  };

  const handleDismissFlagged = async (reviewType, reviewId) => {
    setActionLoading(`dismiss-${reviewId}`);
    try {
      await apiPatch(`/api/reviews/admin/${reviewType}/${reviewId}/dismiss`, {});
      await loadFlaggedReviews();
      toast.success('Flag dismissed');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFlagged = async (reviewType, reviewId) => {
    const ok = window.confirm(
      'Permanently delete this review? This cannot be undone.'
    );
    if (!ok) return;
    setActionLoading(`remove-${reviewId}`);
    try {
      await apiDelete(`/api/reviews/admin/${reviewType}/${reviewId}/remove`);
      await loadFlaggedReviews();
      toast.success('Review removed');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteReviewer = async (reviewerId) => {
    const ok = window.confirm(
      'Remove this person from compliance reviewers? This cannot be undone. Their user account will not be deleted—they only lose reviewer access.'
    );
    if (!ok) return;
    if (deletingReviewerId) return;
    setDeletingReviewerId(reviewerId);
    try {
      await apiDelete(`/api/compliance-documents/admin/reviewers/${reviewerId}`);
      toast.success('Reviewer removed');
      const res = await apiGet('/api/compliance-documents/admin/reviewers');
      setReviewers(res?.reviewers || []);
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to remove reviewer');
    } finally {
      setDeletingReviewerId(null);
    }
  };

  const handleToggleDashboardDelegate = async (delegateId, nextIsActive) => {
    setDelegateManagementLoading(true);
    try {
      await apiPatch(`/api/admin/delegates/${delegateId}`, { isActive: nextIsActive });
      const res = await apiGet('/api/admin/delegates');
      setDashboardDelegates(res?.delegates || []);
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to update admin delegate');
    } finally {
      setDelegateManagementLoading(false);
    }
  };

  const handleAddDashboardDelegate = async () => {
    if (addingDelegate) return;
    setAddingDelegate(true);
    try {
      await apiPost('/api/admin/delegates', newDelegate);
      setNewDelegate({ name: '', email: '' });
      const res = await apiGet('/api/admin/delegates');
      setDashboardDelegates(res?.delegates || []);
      toast.success('Admin delegate added');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to add admin delegate');
    } finally {
      setAddingDelegate(false);
    }
  };

  const handleDeleteDashboardDelegate = async (delegateId) => {
    const ok = window.confirm(
      'Remove this user from Admin Dashboard delegates? Their account will remain, but dashboard access will be removed.'
    );
    if (!ok) return;
    if (deletingDelegateId) return;
    setDeletingDelegateId(delegateId);
    try {
      await apiDelete(`/api/admin/delegates/${delegateId}`);
      const res = await apiGet('/api/admin/delegates');
      setDashboardDelegates(res?.delegates || []);
      toast.success('Admin delegate removed');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to remove admin delegate');
    } finally {
      setDeletingDelegateId(null);
    }
  };

  const resolveReport = async (reportId, action) => {
    const resolutionNote = (reportResolutionNotes[reportId] || '').trim();
    if (resolutionNote.length < 3) {
      toast.error('Please enter a resolution note (at least 3 characters).');
      return;
    }
    setActionLoading(`report-${reportId}-${action}`);
    try {
      await apiPatch(`/api/admin/reports/${reportId}/resolve`, { action, resolutionNote });
      await loadReports();
      toast.success('Report updated');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Failed to resolve report');
    } finally {
      setActionLoading(null);
    }
  };

  const moderateFromReport = async (reportId, moderationAction) => {
    const reason = (reportResolutionNotes[reportId] || '').trim();
    if (reason.length < 3) {
      toast.error('Please enter an action reason (at least 3 characters).');
      return;
    }
    setActionLoading(`report-moderate-${reportId}`);
    try {
      await apiPost(`/api/admin/reports/${reportId}/moderate`, { action: moderationAction, reason });
      await loadReports();
      toast.success('Moderation action completed');
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Moderation action failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--sec-accent)' }} />
      </div>
    );
  }

  if (!user) return null;

  const s = stats || {};

  return (
    <div className="min-h-screen pb-24" style={{ maxWidth: 480, margin: '0 auto' }}>
      <Dialog open={!!previewDocument} onOpenChange={(open) => { if (!open) setPreviewDocument(null); }}>
        <DialogContent className="max-w-4xl" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}>
          <DialogHeader>
            <DialogTitle>Review document</DialogTitle>
          </DialogHeader>
          {previewDocument && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium">{previewDocument.fileName || 'Compliance document'}</p>
                  <p className="text-xs text-[var(--sec-text-muted)]">{previewDocument.documentType?.replace(/_/g, ' ')}</p>
                </div>
                <a
                  href={previewDocument.isPdf
                    ? (previewDocument.downloadUrl || previewDocument.signedFileUrl || previewDocument.fileUrl)
                    : previewDocument.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--sec-accent)] flex items-center gap-1"
                >
                  Open in new tab <ExternalLink size={14} />
                </a>
              </div>
              {previewDocument.isPdf ? (
                <iframe
                  title="Compliance document PDF preview"
                  src={previewDocument.downloadUrl || previewDocument.signedFileUrl || previewDocument.fileUrl}
                  style={{ width: '100%', height: '70vh', border: '1px solid var(--sec-border)', borderRadius: 12, backgroundColor: '#fff' }}
                />
              ) : (
                <div className="rounded-lg overflow-hidden border border-[#262629]">
                  <img
                    src={previewDocument.resolvedFileUrl || previewDocument.fileUrl}
                    alt=""
                    style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', backgroundColor: '#111' }}
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/95 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <LayoutDashboard size={22} style={{ color: 'var(--sec-accent)' }} />
            Admin Dashboard
          </h1>
          <p className="text-sm text-[var(--sec-text-muted)] mt-1">Payments, users & verification</p>
        </div>
        <div className="flex border-b border-[#262629] overflow-x-auto">
          {((complianceAccess?.isSuperAdmin || user.role === 'SUPER_ADMIN')
            ? ['overview', 'promoters', 'reports', 'payments', 'users', 'venues', 'flagged-reviews', 'compliance-documents']
            : ['promoters', 'compliance-documents']
          ).map((t) => {
            const flaggedCount =
              (flaggedReviews.userReviews?.length || 0) + (flaggedReviews.venueReviews?.length || 0);
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-3 text-sm font-medium capitalize whitespace-nowrap px-1 min-h-[44px]"
                style={{
                  color: tab === t ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                  borderBottom: tab === t ? '2px solid var(--sec-accent)' : '2px solid transparent',
                }}
              >
                {t === 'compliance-documents' ? 'Compliance' : t === 'flagged-reviews' ? `Flags (${flaggedCount})` : t}
              </button>
            );
          })}
        </div>
      </header>

      <div className="p-4 space-y-6">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Users size={20} className="text-[var(--sec-accent)] mb-2" />
                <p className="text-2xl font-bold">{s.totalUsers ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">Total Users</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <CreditCard size={20} className="text-[var(--sec-success)] mb-2" />
                <p className="text-2xl font-bold">R{(s.totalPaymentAmount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">{s.totalPaymentCount ?? 0} payments</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Shield size={20} className="text-amber-500 mb-2" />
                <p className="text-2xl font-bold">{s.pendingUserVerifications ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">ID verifications</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Building2 size={20} className="text-amber-500 mb-2" />
                <p className="text-2xl font-bold">{s.pendingVenues ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">Venue compliance</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <AlertTriangle size={20} className="text-red-500 mb-2" />
                <p className="text-2xl font-bold">{s.pendingReports ?? 0}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">Pending reports</p>
              </div>
              <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <Gavel size={20} className="text-orange-400 mb-2" />
                <p className="text-2xl font-bold">{(s.criticalReports ?? 0) + (s.highReports ?? 0)}</p>
                <p className="text-xs text-[var(--sec-text-muted)]">High/Critical reports</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
              <h3 className="font-semibold mb-2">Quick actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setTab('payments')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>View all payments</span>
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setTab('reports')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>Triage safety reports</span>
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setTab('users')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>Review ID verifications</span>
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setTab('venues')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors"
                >
                  <span>Review venue compliance</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'reports' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                className="p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
                value={reportFilters.status}
                onChange={async (e) => {
                  const next = { ...reportFilters, status: e.target.value };
                  setReportFilters(next);
                  await loadReports(next);
                }}
              >
                <option value="pending">Pending</option>
                <option value="in_review">In review</option>
                <option value="action_taken">Action taken</option>
                <option value="dismissed">Dismissed</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                className="p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
                value={reportFilters.priority}
                onChange={async (e) => {
                  const next = { ...reportFilters, priority: e.target.value };
                  setReportFilters(next);
                  await loadReports(next);
                }}
              >
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            {reports.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No reports in this view.</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium capitalize">
                        {r.targetType} report · {r.category?.replace(/_/g, ' ') || 'other'}
                      </p>
                      <p className="text-xs text-[var(--sec-text-muted)]">
                        Reported by {r.reporter?.email || 'Unknown'} · {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-xs px-2 py-1 rounded-full border border-[#3a3a3e]">
                      {r.priority}
                    </div>
                  </div>
                  <p className="text-sm">{r.reason}</p>
                  {r.details && <p className="text-xs text-[var(--sec-text-muted)] whitespace-pre-wrap">{r.details}</p>}
                  {!!r.evidenceUrls?.length && (
                    <div className="text-xs text-[var(--sec-text-muted)]">
                      Evidence: {r.evidenceUrls.length} link(s)
                    </div>
                  )}

                  <textarea
                    value={reportResolutionNotes[r.id] || ''}
                    onChange={(e) => setReportResolutionNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    className="w-full p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
                    rows={2}
                    placeholder="Resolution note / moderation reason (required)"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!actionLoading}
                      onClick={() => resolveReport(r.id, 'dismissed')}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!actionLoading}
                      onClick={() => resolveReport(r.id, 'action_taken')}
                    >
                      Mark action taken
                    </Button>
                    {r.targetType === 'user' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-500/50 text-red-400"
                          disabled={!!actionLoading}
                          onClick={() => moderateFromReport(r.id, 'suspend_user')}
                        >
                          Suspend user
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!actionLoading}
                          onClick={() => moderateFromReport(r.id, 'unsuspend_user')}
                        >
                          Unsuspend user
                        </Button>
                      </>
                    )}
                    {r.targetType === 'venue' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/50 text-red-400"
                        disabled={!!actionLoading}
                        onClick={() => moderateFromReport(r.id, 'reject_venue')}
                      >
                        Reject venue compliance
                      </Button>
                    )}
                    {r.targetType === 'event' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/50 text-red-400"
                        disabled={!!actionLoading}
                        onClick={() => moderateFromReport(r.id, 'cancel_event')}
                      >
                        Cancel event
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'promoters' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Promoter verification candidates</h3>
            {promoterLoading ? (
              <p className="text-sm text-[var(--sec-text-muted)]">Loading promoter candidates...</p>
            ) : promoterCandidates.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No candidates found.</p>
            ) : (
              promoterCandidates.map((p) => (
                <div key={p.promoterId} className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{p.username || p.promoterId}</p>
                      <p className="text-xs text-[var(--sec-text-muted)]">ID: {p.promoterId}</p>
                    </div>
                    <div className="text-xs px-2 py-1 rounded-full border border-[#3a3a3e]">
                      {p.eligibility?.isVerifiedPromoter ? 'Verified' : 'Not verified'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--sec-text-muted)]">
                    <div>Accepted jobs: {p.acceptedJobs}</div>
                    <div>Completed jobs: {p.completedJobs}</div>
                    <div>Ratings: {p.ratingCount}</div>
                    <div>Unique raters: {p.uniqueRaters}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!p.eligibility?.isVerifiedPromoter ? (
                      <Button size="sm" disabled={!!actionLoading} onClick={() => handlePromoterVerify(p.promoterId)}>
                        Approve badge
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => handlePromoterRevoke(p.promoterId)}>
                        Revoke badge
                      </Button>
                    )}
                    {!p.eligibility?.hiddenByModeration ? (
                      <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => handlePromoterVisibility(p.promoterId, true)}>
                        Hide leaderboard
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => handlePromoterVisibility(p.promoterId, false)}>
                        Unhide leaderboard
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Recent payments</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No payments yet</p>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-[#141416] border border-[#262629] flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">R{p.amount?.toLocaleString()} · {p.type}</p>
                    <p className="text-xs text-[var(--sec-text-muted)]">{p.email} · {p.status}</p>
                  </div>
                  <span className="text-xs text-[var(--sec-text-muted)]">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Pending ID verifications</h3>
            {userVerifications.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No pending verifications</p>
            ) : (
              userVerifications.map((p) => (
                <div
                  key={p.userId}
                  className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{p.user?.fullName || p.user?.email || 'Unknown'}</p>
                      <p className="text-xs text-[var(--sec-text-muted)]">{p.user?.email}</p>
                    </div>
                  </div>
                  {p.idDocumentUrl && (
                    <button
                      type="button"
                      onClick={() => handleViewUserIdDocument(p.userId)}
                      className="text-sm text-[var(--sec-accent)] flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                    >
                      View ID document <ExternalLink size={14} />
                    </button>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[var(--sec-success)] text-black hover:opacity-90"
                      disabled={actionLoading === p.userId}
                      onClick={() => handleUserVerification(p.userId, 'verified')}
                    >
                      {actionLoading === p.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-500"
                      disabled={actionLoading === p.userId}
                      onClick={() => handleUserVerification(p.userId, 'rejected', 'Document invalid')}
                    >
                      <X size={16} /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'venues' && (
          <div className="space-y-3">
            <h3 className="font-semibold">Pending venue compliance</h3>
            {venueVerifications.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No pending venues</p>
            ) : (
              venueVerifications.map((v) => (
                <div
                  key={v.id}
                  className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3"
                >
                  <div>
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-[var(--sec-text-muted)]">{v.owner?.email} · {v.city}</p>
                  </div>
                  {v.complianceDocumentUrl && (
                    <a
                      href={v.complianceDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--sec-accent)] flex items-center gap-1"
                    >
                      View compliance doc <ExternalLink size={14} />
                    </a>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[var(--sec-success)] text-black hover:opacity-90"
                      disabled={actionLoading === v.id}
                      onClick={() => handleVenueCompliance(v.id, 'approved')}
                    >
                      {actionLoading === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-500"
                      disabled={actionLoading === v.id}
                      onClick={() => handleVenueCompliance(v.id, 'rejected', 'Documents incomplete')}
                    >
                      <X size={16} /> Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'flagged-reviews' && (
          <div className="space-y-6">
            <h3 className="font-semibold">Flagged reviews</h3>
            {flaggedReviews.userReviews?.length === 0 && flaggedReviews.venueReviews?.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No flagged reviews at this time.</p>
            ) : (
              <>
                <div>
                  <h4 className="text-sm font-medium text-[var(--sec-text-muted)] mb-2">User reviews</h4>
                  <div className="space-y-3">
                    {(flaggedReviews.userReviews || []).length === 0 ? (
                      <p className="text-xs text-[var(--sec-text-muted)]">None</p>
                    ) : (
                      flaggedReviews.userReviews.map((r) => (
                        <div
                          key={r.id}
                          className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-2"
                        >
                          <p className="text-sm">
                            <span className="font-medium">{r.reviewer?.fullName || r.reviewer?.username}</span>
                            <span className="text-[var(--sec-text-muted)]"> @{r.reviewer?.username}</span>
                            {' → '}
                            <span className="font-medium">{r.subject?.fullName || r.subject?.username}</span>
                            <span className="text-[var(--sec-text-muted)]"> @{r.subject?.username}</span>
                          </p>
                          {r.event?.name && (
                            <p className="text-xs text-[var(--sec-text-muted)]">Event: {r.event.name}</p>
                          )}
                          <p className="text-sm">Rating: {r.rating}/5</p>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{r.comment}</p>
                          <p className="text-xs text-amber-500">Flag: {r.flagReason}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            {r.flaggedAt ? new Date(r.flaggedAt).toLocaleString() : ''}
                          </p>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] flex-1"
                              disabled={actionLoading === `dismiss-${r.id}`}
                              onClick={() => handleDismissFlagged('user', r.id)}
                            >
                              Dismiss Flag
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] flex-1 border-red-500/40 text-red-400"
                              disabled={actionLoading === `remove-${r.id}`}
                              onClick={() => handleRemoveFlagged('user', r.id)}
                            >
                              Remove Review
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--sec-text-muted)] mb-2">Venue reviews</h4>
                  <div className="space-y-3">
                    {(flaggedReviews.venueReviews || []).length === 0 ? (
                      <p className="text-xs text-[var(--sec-text-muted)]">None</p>
                    ) : (
                      flaggedReviews.venueReviews.map((r) => (
                        <div
                          key={r.id}
                          className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-2"
                        >
                          <p className="text-sm">
                            <span className="font-medium">{r.reviewer?.fullName || r.reviewer?.username}</span>
                            <span className="text-[var(--sec-text-muted)]"> @{r.reviewer?.username}</span>
                            {' → '}
                            <span className="font-medium">{r.venue?.name}</span>
                          </p>
                          <p className="text-sm">Rating: {r.rating}/5</p>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{r.comment}</p>
                          <p className="text-xs text-amber-500">Flag: {r.flagReason}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            {r.flaggedAt ? new Date(r.flaggedAt).toLocaleString() : ''}
                          </p>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] flex-1"
                              disabled={actionLoading === `dismiss-${r.id}`}
                              onClick={() => handleDismissFlagged('venue', r.id)}
                            >
                              Dismiss Flag
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] flex-1 border-red-500/40 text-red-400"
                              disabled={actionLoading === `remove-${r.id}`}
                              onClick={() => handleRemoveFlagged('venue', r.id)}
                            >
                              Remove Review
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'compliance-documents' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Compliance review</h3>
              <p className="text-xs text-[var(--sec-text-muted)]">Pending documents grouped by venue</p>
            </div>

            {pendingLoading ? (
              <p className="text-sm text-[var(--sec-text-muted)]">Loading pending documents...</p>
            ) : pendingDocuments.length === 0 ? (
              <p className="text-sm text-[var(--sec-text-muted)]">No pending documents</p>
            ) : (
              (() => {
                const grouped = pendingDocuments.reduce((acc, d) => {
                  const vid = d.venue.id;
                  if (!acc[vid]) acc[vid] = { venue: d.venue, docs: [] };
                  acc[vid].docs.push(d);
                  return acc;
                }, {});

                const groupedValues = Object.values(grouped);
                const visibleGroups = requestedVenueId
                  ? groupedValues.filter((g) => g.venue.id === requestedVenueId)
                  : groupedValues;

                return (
                  <div className="space-y-4">
                    {requestedVenueId && visibleGroups.length === 0 && (
                      <p className="text-sm text-[var(--sec-text-muted)]">
                        No pending documents found for that venue right now.
                      </p>
                    )}
                    {visibleGroups.map((g) => (
                      <div key={g.venue.id} className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
                        <div>
                          <p className="font-medium">{g.venue.name}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            {g.venue.owner?.fullName || g.venue.owner?.email || 'Owner'}
                          </p>
                        </div>

                        <div className="space-y-3">
                          {g.docs.map((doc) => {
                            const isPdf = (doc.fileName || '').toLowerCase().endsWith('.pdf') || (doc.fileUrl || '').toLowerCase().includes('.pdf');
                            const rejectReason = rejectReasons[doc.id] || '';
                            const rejectErr = rejectErrors[doc.id];

                            return (
                              <div key={doc.id} className="p-3 rounded-lg border border-[#262629] bg-[#0A0A0B]/20 space-y-2">
                                <div className="flex justify-between items-start gap-3">
                                  <div style={{ minWidth: 0 }}>
                                    <p className="font-medium">{doc.documentType.replace(/_/g, ' ')}</p>
                                    <p className="text-xs text-[var(--sec-text-muted)]">
                                      Uploaded: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ''}
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setPreviewDocument({ ...doc, isPdf })}
                                  className="text-sm text-[var(--sec-accent)] flex items-center gap-1"
                                >
                                  {isPdf ? 'Preview PDF' : 'Preview document'} <ExternalLink size={14} />
                                </button>

                                <div className="flex gap-2 flex-wrap">
                                  <Button
                                    size="sm"
                                    className="bg-[var(--sec-success)] text-black hover:opacity-90"
                                    disabled={reviewingDocId === doc.id}
                                    onClick={() => handleReviewAction(doc.id, 'APPROVED')}
                                  >
                                    {reviewingDocId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/50 text-red-500"
                                    disabled={reviewingDocId === doc.id}
                                    onClick={() => handleReviewAction(doc.id, 'REJECTED')}
                                  >
                                    <X size={16} /> Reject
                                  </Button>
                                </div>

                                <div>
                                  <label className="text-xs text-[var(--sec-text-muted)]">Rejection reason</label>
                                  <textarea
                                    value={rejectReason}
                                    onChange={(e) => {
                                      setRejectReasons((prev) => ({ ...prev, [doc.id]: e.target.value }));
                                      setRejectErrors((prev) => ({ ...prev, [doc.id]: null }));
                                    }}
                                    className="w-full mt-1 p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
                                    rows={2}
                                    placeholder="Required when rejecting..."
                                  />
                                  {rejectErr && <p className="text-xs text-red-500 mt-1">{rejectErr}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}

            {complianceAccess?.isSuperAdmin && (
              <div className="space-y-3">
                <h3 className="font-semibold">Reviewers management</h3>

                <div className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm"
                      placeholder="Name"
                      value={newReviewer.name}
                      onChange={(e) => setNewReviewer((prev) => ({ ...prev, name: e.target.value }))}
                      disabled={addingReviewer}
                    />
                    <input
                      className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm"
                      placeholder="Email"
                      value={newReviewer.email}
                      onChange={(e) => setNewReviewer((prev) => ({ ...prev, email: e.target.value }))}
                      disabled={addingReviewer}
                    />
                  </div>
                  <Button
                    className="w-full bg-[var(--sec-accent)] text-black hover:opacity-90"
                    disabled={addingReviewer}
                    onClick={handleAddReviewer}
                  >
                    {addingReviewer ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add reviewer'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {reviewerManagementLoading ? (
                    <p className="text-sm text-[var(--sec-text-muted)]">Loading reviewers...</p>
                  ) : reviewers.length === 0 ? (
                    <p className="text-sm text-[var(--sec-text-muted)]">No reviewers yet</p>
                  ) : (
                    reviewers.map((r) => (
                      <div key={r.id} className="p-4 rounded-xl bg-[#141416] border border-[#262629] flex justify-between items-start gap-3">
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">{r.email}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            {r.addedAt ? `Added: ${new Date(r.addedAt).toLocaleDateString()}` : ''}
                          </p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            Status: {r.isActive ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 items-end shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reviewerManagementLoading || deletingReviewerId === r.id}
                            className={r.isActive ? 'border-red-500/50 text-red-500' : 'border-emerald-500/50 text-emerald-400'}
                            onClick={() => handleToggleReviewer(r.id, !r.isActive)}
                          >
                            {r.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reviewerManagementLoading || deletingReviewerId === r.id}
                            className="border-red-600/60 text-red-500 hover:bg-red-950/30"
                            onClick={() => handleDeleteReviewer(r.id)}
                          >
                            {deletingReviewerId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <h3 className="font-semibold pt-2">Admin dashboard delegates</h3>

                <div className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm"
                      placeholder="Name"
                      value={newDelegate.name}
                      onChange={(e) => setNewDelegate((prev) => ({ ...prev, name: e.target.value }))}
                      disabled={addingDelegate}
                    />
                    <input
                      className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm"
                      placeholder="Email"
                      value={newDelegate.email}
                      onChange={(e) => setNewDelegate((prev) => ({ ...prev, email: e.target.value }))}
                      disabled={addingDelegate}
                    />
                  </div>
                  <Button
                    className="w-full bg-[var(--sec-accent)] text-black hover:opacity-90"
                    disabled={addingDelegate}
                    onClick={handleAddDashboardDelegate}
                  >
                    {addingDelegate ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add admin delegate'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {delegateManagementLoading ? (
                    <p className="text-sm text-[var(--sec-text-muted)]">Loading admin delegates...</p>
                  ) : dashboardDelegates.length === 0 ? (
                    <p className="text-sm text-[var(--sec-text-muted)]">No admin delegates yet</p>
                  ) : (
                    dashboardDelegates.map((d) => (
                      <div key={d.id} className="p-4 rounded-xl bg-[#141416] border border-[#262629] flex justify-between items-start gap-3">
                        <div>
                          <p className="font-medium">{d.name}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">{d.email}</p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            {d.addedAt ? `Added: ${new Date(d.addedAt).toLocaleDateString()}` : ''}
                          </p>
                          <p className="text-xs text-[var(--sec-text-muted)]">
                            Status: {d.isActive ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 items-end shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={delegateManagementLoading || deletingDelegateId === d.id}
                            className={d.isActive ? 'border-red-500/50 text-red-500' : 'border-emerald-500/50 text-emerald-400'}
                            onClick={() => handleToggleDashboardDelegate(d.id, !d.isActive)}
                          >
                            {d.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={delegateManagementLoading || deletingDelegateId === d.id}
                            className="border-red-600/60 text-red-500 hover:bg-red-950/30"
                            onClick={() => handleDeleteDashboardDelegate(d.id)}
                          >
                            {deletingDelegateId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
