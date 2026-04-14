import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

const CATEGORY_OPTIONS = [
  { value: 'fraud', label: 'Fraud or scam' },
  { value: 'fake_event', label: 'Fake event listing' },
  { value: 'gbv_or_harassment', label: 'GBV, harassment, or threats' },
  { value: 'scam_or_payment_issue', label: 'Payment issue or extortion' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'hate_or_abuse', label: 'Hate speech or abuse' },
  { value: 'other', label: 'Other safety concern' },
];

export default function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  triggerClassName,
  triggerLabel = 'Report',
  triggerVariant = 'outline',
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('other');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [evidenceLinks, setEvidenceLinks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = useMemo(() => reason.trim().length >= 3, [reason]);

  const resetForm = () => {
    setCategory('other');
    setReason('');
    setDetails('');
    setEvidenceLinks('');
  };

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const evidenceUrls = evidenceLinks
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      await apiPost('/api/reports', {
        target_type: targetType,
        target_id: targetId,
        category,
        reason: reason.trim(),
        details: details.trim() || undefined,
        evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
      });

      toast.success('Report submitted. Our team will review it.');
      setOpen(false);
      resetForm();
    } catch (e) {
      toast.error(e?.data?.error || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          <AlertTriangle className="w-4 h-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
        <DialogHeader>
          <DialogTitle>Report {targetLabel || targetType}</DialogTitle>
          <DialogDescription>
            Help keep SEC safe. False reports may lead to account penalties.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="text-sm">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mt-1 p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Short reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what happened"
              className="w-full mt-1 p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
            />
          </label>

          <label className="text-sm">
            Details (optional)
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              placeholder="Add relevant context for admin review"
              className="w-full mt-1 p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
            />
          </label>

          <label className="text-sm">
            Evidence links (optional, one URL per line)
            <textarea
              value={evidenceLinks}
              onChange={(e) => setEvidenceLinks(e.target.value)}
              rows={3}
              placeholder="https://..."
              className="w-full mt-1 p-2 rounded-lg bg-[#0A0A0B] border border-[#262629] text-sm"
            />
          </label>

          <Button className="w-full min-h-[44px]" disabled={!isValid || submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting...' : 'Submit report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
