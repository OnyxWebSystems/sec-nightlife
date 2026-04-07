import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, Briefcase, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiPost } from '@/api/client';

const JOB_TYPES = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'ONCE_OFF', label: 'Once-Off' },
  { value: 'CONTRACT', label: 'Contract' },
];

const COMPENSATION_TYPES = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'NEGOTIABLE', label: 'Negotiable' },
  { value: 'UNPAID_TRIAL', label: 'Unpaid Trial' },
];

const COMPENSATION_PER = [
  { value: 'HOUR', label: 'Per Hour' },
  { value: 'MONTH', label: 'Per Month' },
  { value: 'COMMISSION', label: 'Commission' },
  { value: 'ONCE_OFF', label: 'Once-Off' },
];

export default function CreateJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);

  const [form, setForm] = useState({
    venue_id: '',
    title: '',
    description: '',
    requirements: '',
    jobType: 'FULL_TIME',
    compensationType: 'FIXED',
    compensationAmount: '',
    compensationPer: 'MONTH',
    totalSpots: 1,
    closingDate: '',
    currency: 'ZAR',
  });

  const [errors, setErrors] = useState({
    title: '',
    description: '',
    requirements: '',
    venue_id: '',
    compensationAmount: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
      } catch {
        authService.redirectToLogin(createPageUrl('CreateJob'));
      }
    })();
  }, []);

  const { data: venues = [] } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user.id }),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => apiPost('/api/jobs', payload),
    onSuccess: () => {
      toast.success('Job posted!');
      queryClient.invalidateQueries({ queryKey: ['biz-jobs'] });
      navigate(createPageUrl('BusinessDashboard'));
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Failed to post job');
    },
  });

  const handleSubmit = () => {
    const nextErrors = {
      title: form.title.trim() ? '' : 'Job title is required',
      description: form.description.trim() ? '' : 'Description is required',
      requirements: form.requirements.trim() ? '' : 'Requirements are required',
      venue_id: form.venue_id ? '' : 'Select a venue',
      compensationAmount: '',
    };
    if (['FIXED', 'NEGOTIABLE'].includes(form.compensationType) && form.compensationAmount && Number(form.compensationAmount) < 0) {
      nextErrors.compensationAmount = 'Amount must be positive';
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const payload = {
      venueId: form.venue_id,
      title: form.title.trim(),
      description: form.description.trim(),
      requirements: form.requirements.trim(),
      jobType: form.jobType,
      compensationType: form.compensationType,
      compensationPer: form.compensationPer,
      compensationAmount: form.compensationAmount ? Number(form.compensationAmount) : null,
      currency: form.currency || 'ZAR',
      totalSpots: Number(form.totalSpots || 1),
      closingDate: form.closingDate || null,
    };
    createMutation.mutate(payload);
  };

  if (!user) return null;

  if (venues.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <Briefcase size={48} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No Venue Found</h2>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 20 }}>Register a venue to post jobs.</p>
        <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))} className="sec-btn sec-btn-primary">
          Register Venue
        </Button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 168, backgroundColor: 'var(--sec-bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--sec-border)', backgroundColor: 'var(--sec-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Post a Job</h1>
        </div>
      </header>

      <div style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        <div className="sec-card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Job Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label className="text-gray-400 text-sm">Venue *</Label>
              <Select value={form.venue_id} onValueChange={v => setForm(p => ({ ...p, venue_id: v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue placeholder="Select venue" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                  {venues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.venue_id ? <p style={{ color: 'var(--sec-error)', fontSize: 12, marginTop: 4 }}>{errors.venue_id}</p> : null}
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Job Title *</Label>
              <Input
                placeholder="e.g. Senior Bartender"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
              {errors.title ? <p style={{ color: 'var(--sec-error)', fontSize: 12, marginTop: 4 }}>{errors.title}</p> : null}
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Job Type *</Label>
              <Select value={form.jobType} onValueChange={v => setForm(p => ({ ...p, jobType: v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                  {JOB_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Job Description *</Label>
              <Textarea
                placeholder="Describe the role, responsibilities..."
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1.5 rounded-xl resize-none"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                rows={4}
              />
              {errors.description ? <p style={{ color: 'var(--sec-error)', fontSize: 12, marginTop: 4 }}>{errors.description}</p> : null}
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Requirements *</Label>
              <Textarea
                placeholder="What experience and skills are required?"
                value={form.requirements}
                onChange={e => setForm(p => ({ ...p, requirements: e.target.value }))}
                className="mt-1.5 rounded-xl resize-none"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                rows={4}
              />
              {errors.requirements ? <p style={{ color: 'var(--sec-error)', fontSize: 12, marginTop: 4 }}>{errors.requirements}</p> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label className="text-gray-400 text-sm">Compensation Type *</Label>
                <Select value={form.compensationType} onValueChange={v => setForm(p => ({ ...p, compensationType: v }))}>
                  <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                    {COMPENSATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Currency</Label>
                <Input
                  value={form.currency}
                  onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>

            {['FIXED', 'NEGOTIABLE'].includes(form.compensationType) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Label className="text-gray-400 text-sm">Amount</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 150"
                    value={form.compensationAmount}
                    onChange={e => setForm(p => ({ ...p, compensationAmount: e.target.value }))}
                    className="mt-1.5 h-11 rounded-xl"
                    style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                  />
                  {errors.compensationAmount ? <p style={{ color: 'var(--sec-error)', fontSize: 12, marginTop: 4 }}>{errors.compensationAmount}</p> : null}
                </div>
                <div>
                  <Label className="text-gray-400 text-sm">Paid Per</Label>
                  <Select value={form.compensationPer} onValueChange={v => setForm(p => ({ ...p, compensationPer: v }))}>
                    <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                      {COMPENSATION_PER.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label className="text-gray-400 text-sm">Total Spots Available</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.totalSpots}
                  onChange={e => setForm(p => ({ ...p, totalSpots: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Closing Date</Label>
                <Input
                  type="date"
                  value={form.closingDate}
                  onChange={e => setForm(p => ({ ...p, closingDate: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Compensation per</Label>
              <Select value={form.compensationPer} onValueChange={v => setForm(p => ({ ...p, compensationPer: v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                  {COMPENSATION_PER.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
              This form does not allow editing `filledSpots` or directly forcing system values.
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="sec-btn sec-btn-primary w-full h-12 rounded-xl font-semibold"
        >
          {createMutation.isPending ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
          Post Job
        </Button>
      </div>
    </div>
  );
}
