import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl, buildPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Briefcase, Loader2, Star } from 'lucide-react';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { apiPost } from '@/api/client';
import { JOB_TYPES, COMPENSATION_TYPES, COMPENSATION_PER } from '@/constants/jobPostingForm';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';

export default function CreateJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [activeMode, setActiveMode] = useState(() => localStorage.getItem('sec_active_mode') || 'partygoer');

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
    isPromoterRole: false,
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
        const u = await authService.loadUserOrLogin(createPageUrl('CreateJob'));
        setUser(u);
      } catch {
        // loadUserOrLogin redirects when no session remains
      }
    })();
  }, []);

  useEffect(() => {
    const handleModeChange = (event) => {
      const mode = event?.detail?.mode || localStorage.getItem('sec_active_mode') || 'partygoer';
      setActiveMode(mode);
    };
    window.addEventListener('sec_active_mode_changed', handleModeChange);
    return () => window.removeEventListener('sec_active_mode_changed', handleModeChange);
  }, []);

  const venueScope = useBusinessVenueScope();

  const { data: venues = [] } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user && !venueScope.inStaffSession,
  });

  const hasVenueScope = venueScope.inStaffSession || venues.some((v) => v.is_owner === true || v.isOwner === true);

  useEffect(() => {
    if (activeMode !== 'business' && !venueScope.inStaffSession) {
      navigate(createPageUrl('Jobs'), { replace: true });
    }
  }, [activeMode, navigate, venueScope.inStaffSession]);

  const ownedVenues = venues.filter((v) => v.is_owner === true || v.isOwner === true);

  const createMutation = useMutation({
    mutationFn: (payload) => {
      const url = venueScope.inStaffSession && venueScope.staffContextToken
        ? `/api/jobs?staff_ctx=${encodeURIComponent(venueScope.staffContextToken)}`
        : '/api/jobs';
      return apiPost(url, payload);
    },
    onSuccess: () => {
      toast.success('Job posted!');
      queryClient.invalidateQueries({ queryKey: ['biz-jobs'] });
      if (venueScope.inStaffSession && venueScope.staffContextToken) {
        navigate(buildPageUrl('BusinessJobs', { staff_ctx: venueScope.staffContextToken }));
      } else {
        navigate(createPageUrl('BusinessDashboard'));
      }
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
      venue_id: (venueScope.inStaffSession || form.venue_id) ? '' : 'Select a venue',
      compensationAmount: '',
    };
    if (['FIXED', 'NEGOTIABLE'].includes(form.compensationType) && form.compensationAmount && Number(form.compensationAmount) < 0) {
      nextErrors.compensationAmount = 'Amount must be positive';
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const payload = {
      ...(venueScope.inStaffSession ? {} : { venueId: form.venue_id }),
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
      positionRole: form.isPromoterRole ? 'PROMOTER' : 'VENUE_STAFF',
    };
    createMutation.mutate(payload);
  };

  if (!user) return null;

  if (!hasVenueScope) {
    return (
      <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <Briefcase size={48} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No Venue Found</h2>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 20 }}>
          {venueScope.inStaffSession
            ? 'Staff venue context is missing or expired.'
            : 'Register a venue to post jobs.'}
        </p>
        {venueScope.inStaffSession ? (
          <Button onClick={() => navigate(createPageUrl('StaffDashboard'))} className="sec-btn sec-btn-primary">
            Go to Staff Dashboard
          </Button>
        ) : (
          <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))} className="sec-btn sec-btn-primary">
            Register Venue
          </Button>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 168, backgroundColor: 'var(--sec-bg-base)' }}>
      <PageBackHeader title="Post a Job" pageName="CreateJob" />

      <div style={{ padding: 20, maxWidth: 480, margin: '0 auto' }}>
        <div className="sec-card" style={{ padding: 20, marginBottom: 16, borderColor: form.isPromoterRole ? 'var(--sec-accent-border)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Star size={16} style={{ color: form.isPromoterRole ? 'var(--sec-accent)' : 'var(--sec-text-muted)' }} />
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Promoter role</h3>
              </div>
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
                Promoter hires appear in your Promoters inbox, can be assigned events to promote, and earn leaderboard points from referral links.
              </p>
            </div>
            <Switch
              checked={form.isPromoterRole}
              onCheckedChange={(v) => setForm((p) => ({
                ...p,
                isPromoterRole: v,
                title: v && !p.title ? 'Event Promoter' : p.title,
              }))}
            />
          </div>
        </div>
        <div className="sec-card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Job Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label className="text-gray-400 text-sm">Venue *</Label>
              {venueScope.inStaffSession ? (
                <div
                  className="mt-1.5 h-11 rounded-xl flex items-center px-3"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}
                >
                  {venueScope.venueName || 'Venue'}
                </div>
              ) : (
                <Select value={form.venue_id} onValueChange={v => setForm(p => ({ ...p, venue_id: v }))}>
                  <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                    <SelectValue placeholder="Select venue" />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                    {ownedVenues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
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
