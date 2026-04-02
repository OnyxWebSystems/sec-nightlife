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
  const [previewDocument, setPreviewDocument] = useState(null);


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

        if (!access?.canReview) {
          navigate(createPageUrl('Home'));
          return;
        }

        const shouldLoadAdminQueues = !!(access?.isSuperAdmin || u?.role === 'SUPER_ADMIN');
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
        <div className="flex border-b border-[#262629]">
          {((complianceAccess?.isSuperAdmin || user.role === 'SUPER_ADMIN')
            ? ['overview', 'payments', 'users', 'venues', 'compliance-documents']
            : ['compliance-documents']
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3 text-sm font-medium capitalize"
              style={{
                color: tab === t ? 'var(--sec-accent)' : 'var(--sec-text-muted)',
                borderBottom: tab === t ? '2px solid var(--sec-accent)' : '2px solid transparent',
              }}
            >
              {t === 'compliance-documents' ? 'Compliance' : t}
            </button>
          ))}
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
                    <a
                      href={p.idDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--sec-accent)] flex items-center gap-1"
                    >
                      View ID document <ExternalLink size={14} />
                    </a>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[var(--sec-success)] text-black hover:opacity-90"
                      disabled={actionLoading === p.userId}
                      onClick={() => handleUserVerification(p.userId, 'approved')}
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
