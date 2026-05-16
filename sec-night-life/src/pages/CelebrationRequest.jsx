import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const EVENT_TYPES = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'umemulo', label: 'Umemulo' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'other', label: 'Other' },
];

export default function CelebrationRequest() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    eventType: 'birthday',
    description: '',
    guestCount: '',
    preferredDate: '',
    venueId: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/api/celebrations', {
        title: form.title,
        eventType: form.eventType,
        description: form.description || null,
        guestCount: form.guestCount ? parseInt(form.guestCount, 10) : null,
        preferredDate: form.preferredDate ? new Date(form.preferredDate).toISOString() : null,
        venueId: form.venueId.trim() || null,
      });
      toast.success('Request sent — the venue will follow up on Sec');
      navigate(createPageUrl('Profile'));
    } catch (err) {
      toast.error(err?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sec-page max-w-md mx-auto" style={{ paddingBottom: 48 }}>
      <h1 className="sec-page-title">Private celebration</h1>
      <p className="sec-page-subtitle mb-6">
        Coordinate weddings, umemulo, birthdays, or any event at a Sec venue — payments and structure included.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Title</Label>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </div>
        <div>
          <Label>Type</Label>
          <select
            className="w-full h-11 rounded-xl border px-3"
            value={form.eventType}
            onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Venue ID (optional)</Label>
          <Input
            placeholder="Sec venue ID if you already chose one"
            value={form.venueId}
            onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
          />
        </div>
        <div>
          <Label>Guest count</Label>
          <Input type="number" value={form.guestCount} onChange={(e) => setForm((f) => ({ ...f, guestCount: e.target.value }))} />
        </div>
        <div>
          <Label>Preferred date</Label>
          <Input type="date" value={form.preferredDate} onChange={(e) => setForm((f) => ({ ...f, preferredDate: e.target.value }))} />
        </div>
        <div>
          <Label>Details</Label>
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={4} />
        </div>
        <Button type="submit" className="sec-btn sec-btn-primary w-full" disabled={saving}>
          {saving ? 'Sending…' : 'Send request'}
        </Button>
      </form>
    </div>
  );
}
