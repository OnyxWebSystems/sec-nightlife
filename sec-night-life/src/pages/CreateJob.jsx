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

const JOB_TYPES = [
  { value: 'bartender', label: 'Bartender' },
  { value: 'security', label: 'Security' },
  { value: 'dj', label: 'DJ' },
  { value: 'promoter', label: 'Promoter' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'table_host', label: 'Table Host' },
  { value: 'vip_host', label: 'VIP Host' },
  { value: 'other', label: 'Other' },
];

export default function CreateJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);

  const [form, setForm] = useState({
    venue_id: '',
    event_id: '',
    title: '',
    job_type: 'bartender',
    city: '',
    description: '',
    suggested_pay_amount: '',
    suggested_pay_type: 'fixed',
    start_time: '',
    end_time: '',
    contact_details: '',
    date: '',
    spots_available: '1',
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

  const { data: events = [] } = useQuery({
    queryKey: ['biz-events', form.venue_id],
    queryFn: () => dataService.Event.filter({ venue_id: form.venue_id }),
    enabled: !!form.venue_id,
  });

  const selectedVenue = venues.find(v => v.id === form.venue_id);
  React.useEffect(() => {
    if (selectedVenue?.city && !form.city) setForm(p => ({ ...p, city: selectedVenue.city }));
  }, [selectedVenue?.city]);

  const createMutation = useMutation({
    mutationFn: (payload) => dataService.Job.create(payload),
    onSuccess: () => {
      toast.success('Job posted!');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate(createPageUrl('Jobs'));
    },
    onError: (err) => {
      toast.error(err?.message || 'Failed to post job');
    },
  });

  const handleSubmit = () => {
    if (!form.venue_id || !form.title || !form.city) {
      toast.error('Please fill in Venue, Job Title, and Location');
      return;
    }
    const payload = {
      venue_id: form.venue_id,
      title: form.title,
      job_type: form.job_type,
      city: form.city,
      spots_available: parseInt(form.spots_available) || 1,
    };
    if (form.event_id) payload.event_id = form.event_id;
    if (form.description) payload.description = form.description;
    if (form.suggested_pay_amount) payload.suggested_pay_amount = parseInt(form.suggested_pay_amount);
    if (form.suggested_pay_type) payload.suggested_pay_type = form.suggested_pay_type;
    if (form.start_time) payload.start_time = form.start_time;
    if (form.end_time) payload.end_time = form.end_time;
    if (form.contact_details) payload.contact_details = form.contact_details;
    if (form.date) payload.date = form.date;
    createMutation.mutate(payload);
  };

  if (!user) return null;

  if (venues.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <Briefcase size={48} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No Venue Found</h2>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 20 }}>Register a venue first to post jobs.</p>
        <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))} className="sec-btn sec-btn-primary">
          Register Venue
        </Button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 100, backgroundColor: 'var(--sec-bg-base)' }}>
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
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Job Type *</Label>
              <Select value={form.job_type} onValueChange={v => setForm(p => ({ ...p, job_type: v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                  {JOB_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Location *</Label>
              <Input
                placeholder="e.g. Johannesburg"
                value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Description</Label>
              <Textarea
                placeholder="Describe the role, responsibilities..."
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1.5 rounded-xl resize-none"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                rows={4}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Event (optional)</Label>
              <Select value={form.event_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, event_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue placeholder="No specific event" />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                  <SelectItem value="__none__">No specific event</SelectItem>
                  {events.map(e => <SelectItem key={e.id} value={e.id}>{e.title} - {e.date}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label className="text-gray-400 text-sm">Pay (R)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 150"
                  value={form.suggested_pay_amount}
                  onChange={e => setForm(p => ({ ...p, suggested_pay_amount: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Pay Type</Label>
                <Select value={form.suggested_pay_type} onValueChange={v => setForm(p => ({ ...p, suggested_pay_type: v }))}>
                  <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="hourly">Per Hour</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label className="text-gray-400 text-sm">Shift Start</Label>
                <Input
                  placeholder="e.g. 20:00"
                  value={form.start_time}
                  onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Shift End</Label>
                <Input
                  placeholder="e.g. 02:00"
                  value={form.end_time}
                  onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Spots Available</Label>
              <Input
                type="number"
                min="1"
                value={form.spots_available}
                onChange={e => setForm(p => ({ ...p, spots_available: e.target.value }))}
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Contact Details</Label>
              <Input
                placeholder="Phone or email for applicants"
                value={form.contact_details}
                onChange={e => setForm(p => ({ ...p, contact_details: e.target.value }))}
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
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
