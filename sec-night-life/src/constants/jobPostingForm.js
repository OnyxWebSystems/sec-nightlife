/** Shared job posting option lists and helpers for Create Job + edit flows. */

export const JOB_TYPES = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'ONCE_OFF', label: 'Once-Off' },
  { value: 'CONTRACT', label: 'Contract' },
];

export const COMPENSATION_TYPES = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'NEGOTIABLE', label: 'Negotiable' },
  { value: 'UNPAID_TRIAL', label: 'Unpaid Trial' },
];

export const COMPENSATION_PER = [
  { value: 'HOUR', label: 'Per Hour' },
  { value: 'MONTH', label: 'Per Month' },
  { value: 'COMMISSION', label: 'Commission' },
  { value: 'ONCE_OFF', label: 'Once-Off' },
];

const emptyEditForm = () => ({
  title: '',
  description: '',
  requirements: '',
  jobType: 'FULL_TIME',
  compensationType: 'FIXED',
  compensationAmount: '',
  compensationPer: 'MONTH',
  currency: 'ZAR',
  totalSpots: '1',
  closingDate: '',
});

/**
 * @param {Record<string, unknown> | null | undefined} job
 */
export function jobPostingToEditForm(job) {
  if (!job) return emptyEditForm();
  return {
    title: job.title || '',
    description: job.description || '',
    requirements: job.requirements || '',
    jobType: job.jobType || 'FULL_TIME',
    compensationType: job.compensationType || 'FIXED',
    compensationAmount:
      job.compensationAmount != null && job.compensationAmount !== ''
        ? String(Number(job.compensationAmount))
        : '',
    compensationPer: job.compensationPer || 'MONTH',
    currency: job.currency || 'ZAR',
    totalSpots: String(job.totalSpots ?? 1),
    closingDate: job.closingDate ? new Date(job.closingDate).toISOString().slice(0, 10) : '',
  };
}

/**
 * @param {ReturnType<typeof jobPostingToEditForm>} editForm
 * @param {{ filledSpots?: number }} opts
 */
export function validateJobEditForm(editForm, { filledSpots = 0 } = {}) {
  if (!editForm.title?.trim() || !editForm.description?.trim() || !editForm.requirements?.trim()) {
    return { ok: false, message: 'Title, description, and requirements are required.' };
  }
  if (
    ['FIXED', 'NEGOTIABLE'].includes(editForm.compensationType) &&
    editForm.compensationAmount !== '' &&
    editForm.compensationAmount != null &&
    Number(editForm.compensationAmount) < 0
  ) {
    return { ok: false, message: 'Amount must be zero or positive.' };
  }
  if (Number(editForm.totalSpots || 1) < filledSpots) {
    return { ok: false, message: `Total spots must be at least ${filledSpots} (already filled).` };
  }
  return { ok: true };
}

/**
 * @param {ReturnType<typeof jobPostingToEditForm>} editForm
 */
export function buildJobPatchBody(editForm) {
  const rawAmt = editForm.compensationAmount;
  const hasAmt = rawAmt !== '' && rawAmt != null && String(rawAmt).trim() !== '';
  const compensationAmount = ['FIXED', 'NEGOTIABLE'].includes(editForm.compensationType) && hasAmt
    ? Number(rawAmt)
    : null;

  return {
    title: editForm.title.trim(),
    description: editForm.description.trim(),
    requirements: editForm.requirements.trim(),
    jobType: editForm.jobType,
    compensationType: editForm.compensationType,
    compensationPer: editForm.compensationPer,
    compensationAmount,
    currency: (editForm.currency || 'ZAR').trim(),
    totalSpots: Number(editForm.totalSpots || 1),
    closingDate: editForm.closingDate || null,
  };
}
