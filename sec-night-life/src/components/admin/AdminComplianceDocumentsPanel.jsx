import React, { useEffect, useState } from 'react';
import { Check, X, Loader2, ExternalLink } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import AdminEmptyState from './AdminEmptyState';

export default function AdminComplianceDocumentsPanel({ complianceAccess, requestedVenueId }) {
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectReasons, setRejectReasons] = useState({});
  const [rejectErrors, setRejectErrors] = useState({});
  const [reviewingDocId, setReviewingDocId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

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
    if (!complianceAccess?.canReview) return;
    loadPendingDocuments();
  }, [complianceAccess?.canReview]);

  useEffect(() => {
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
  }, [complianceAccess?.isSuperAdmin]);

  useEffect(() => {
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
  }, [complianceAccess?.isSuperAdmin]);

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
    <>
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
                  className="text-sm text-[var(--sec-accent)] flex items-center gap-1 min-h-[44px]"
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

      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold">Compliance review</h3>
          <p className="text-xs text-[var(--sec-text-muted)]">Pending documents grouped by venue</p>
        </div>

        {pendingLoading ? (
          <AdminEmptyState message="Loading pending documents..." />
        ) : pendingDocuments.length === 0 ? (
          <AdminEmptyState message="No pending documents" />
        ) : (
          <div className="space-y-4">
            {requestedVenueId && visibleGroups.length === 0 && (
              <AdminEmptyState message="No pending documents found for that venue right now." />
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
                          className="text-sm text-[var(--sec-accent)] flex items-center gap-1 min-h-[44px]"
                        >
                          {isPdf ? 'Preview PDF' : 'Preview document'} <ExternalLink size={14} />
                        </button>

                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            className="bg-[var(--sec-success)] text-black hover:opacity-90 min-h-[44px]"
                            disabled={reviewingDocId === doc.id}
                            onClick={() => handleReviewAction(doc.id, 'APPROVED')}
                          >
                            {reviewingDocId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/50 text-red-500 min-h-[44px]"
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
        )}

        {complianceAccess?.isSuperAdmin && (
          <div className="space-y-3">
            <h3 className="font-semibold">Reviewers management</h3>

            <div className="p-4 rounded-xl bg-[#141416] border border-[#262629] space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm min-h-[44px]"
                  placeholder="Name"
                  value={newReviewer.name}
                  onChange={(e) => setNewReviewer((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={addingReviewer}
                />
                <input
                  className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm min-h-[44px]"
                  placeholder="Email"
                  value={newReviewer.email}
                  onChange={(e) => setNewReviewer((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={addingReviewer}
                />
              </div>
              <Button
                className="w-full bg-[var(--sec-accent)] text-black hover:opacity-90 min-h-[44px]"
                disabled={addingReviewer}
                onClick={handleAddReviewer}
              >
                {addingReviewer ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add reviewer'}
              </Button>
            </div>

            <div className="space-y-2">
              {reviewerManagementLoading ? (
                <AdminEmptyState message="Loading reviewers..." />
              ) : reviewers.length === 0 ? (
                <AdminEmptyState message="No reviewers yet" />
              ) : (
                reviewers.map((r) => (
                  <div key={r.id} className="p-4 rounded-xl bg-[#141416] border border-[#262629] flex flex-col sm:flex-row justify-between items-start gap-3">
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
                    <div className="flex flex-col gap-2 items-stretch sm:items-end shrink-0 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewerManagementLoading || deletingReviewerId === r.id}
                        className={`min-h-[44px] ${r.isActive ? 'border-red-500/50 text-red-500' : 'border-emerald-500/50 text-emerald-400'}`}
                        onClick={() => handleToggleReviewer(r.id, !r.isActive)}
                      >
                        {r.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewerManagementLoading || deletingReviewerId === r.id}
                        className="min-h-[44px] border-red-600/60 text-red-500 hover:bg-red-950/30"
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
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm min-h-[44px]"
                  placeholder="Name"
                  value={newDelegate.name}
                  onChange={(e) => setNewDelegate((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={addingDelegate}
                />
                <input
                  className="flex-1 p-3 rounded-xl bg-[#0A0A0B] border border-[#262629] text-sm min-h-[44px]"
                  placeholder="Email"
                  value={newDelegate.email}
                  onChange={(e) => setNewDelegate((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={addingDelegate}
                />
              </div>
              <Button
                className="w-full bg-[var(--sec-accent)] text-black hover:opacity-90 min-h-[44px]"
                disabled={addingDelegate}
                onClick={handleAddDashboardDelegate}
              >
                {addingDelegate ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add admin delegate'}
              </Button>
            </div>

            <div className="space-y-2">
              {delegateManagementLoading ? (
                <AdminEmptyState message="Loading admin delegates..." />
              ) : dashboardDelegates.length === 0 ? (
                <AdminEmptyState message="No admin delegates yet" />
              ) : (
                dashboardDelegates.map((d) => (
                  <div key={d.id} className="p-4 rounded-xl bg-[#141416] border border-[#262629] flex flex-col sm:flex-row justify-between items-start gap-3">
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
                    <div className="flex flex-col gap-2 items-stretch sm:items-end shrink-0 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={delegateManagementLoading || deletingDelegateId === d.id}
                        className={`min-h-[44px] ${d.isActive ? 'border-red-500/50 text-red-500' : 'border-emerald-500/50 text-emerald-400'}`}
                        onClick={() => handleToggleDashboardDelegate(d.id, !d.isActive)}
                      >
                        {d.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={delegateManagementLoading || deletingDelegateId === d.id}
                        className="min-h-[44px] border-red-600/60 text-red-500 hover:bg-red-950/30"
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
    </>
  );
}
