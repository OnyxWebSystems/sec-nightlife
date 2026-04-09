import React, { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';

const SA_CITIES = ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Bloemfontein', 'Port Elizabeth', 'East London', 'Polokwane', 'Nelspruit', 'Rustenburg'];
const TYPES = [
  { value: 'VENUE_PROMOTION', label: 'Venue Promotion' },
  { value: 'EVENT_PROMOTION', label: 'Event Promotion' },
  { value: 'SPECIAL_OFFER', label: 'Special Offer' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
];

function getStatusColor(status) {
  if (status === 'ACTIVE') return '#22c55e';
  if (status === 'PAUSED') return '#eab308';
  if (status === 'ENDED') return '#9ca3af';
  return '#3b82f6';
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

function isAllowedPromotionImage(file) {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.svg') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
}

function formatApiError(e, fallback) {
  const base = e?.data?.error || e?.message || fallback;
  const fieldErrors = e?.data?.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    const parts = Object.entries(fieldErrors).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((x) => `${k}: ${x}`) : [`${k}: ${v}`]
    );
    if (parts.length) return `${base} — ${parts.join('; ')}`;
  }
  return base;
}

function localDateTimeToIso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid start or end date');
  return d.toISOString();
}

export default function BusinessPromotions() {
  const [user, setUser] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [promotions, setPromotions] = useState([]);
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [justPublished, setJustPublished] = useState(null);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    promoteWhat: 'venue',
    eventId: '',
    promotionType: 'VENUE_PROMOTION',
    title: '',
    body: '',
    imageUrl: '',
    imagePublicId: '',
    targetCity: '',
    startsAt: '',
    endsAt: '',
  });

  useEffect(() => {
    (async () => {
      try {
        setUser(await authService.getCurrentUser());
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const { data: venues = [] } = useQuery({
    queryKey: ['promotions-venues', user?.id],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user.id }),
    enabled: !!user,
  });

  async function loadPromotions(venueId) {
    if (!venueId) return;
    setLoadingList(true);
    try {
      const data = await apiGet(`/api/promotions/venue/${venueId}`);
      setPromotions(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to load promotions');
    } finally {
      setLoadingList(false);
    }
  }

  async function loadEvents(venueId) {
    if (!venueId) return;
    try {
      const list = await dataService.Event.filter({ venue_id: venueId, status: 'published' }, 'date', 50);
      setEvents(Array.isArray(list) ? list : []);
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    if (!selectedVenue) return;
    loadPromotions(selectedVenue);
    loadEvents(selectedVenue);
  }, [selectedVenue]);

  const durationText = useMemo(() => {
    if (!form.startsAt || !form.endsAt) return '';
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return `This promotion runs for ${days} day${days === 1 ? '' : 's'}`;
  }, [form.startsAt, form.endsAt]);

  async function uploadImage(file) {
    if (!file) return;
    if (!isAllowedPromotionImage(file)) {
      toast.error('Only JPG, PNG, WEBP, or SVG are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      return;
    }

    const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloud || !preset) {
      toast.error('Cloudinary is not configured');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', preset);
    formData.append('resource_type', 'image');
    formData.append('folder', 'sec-nightlife/promotions');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error?.message || 'Upload failed');

    setForm((prev) => ({
      ...prev,
      imageUrl: json.secure_url,
      imagePublicId: json.public_id,
    }));
  }

  async function handlePublish() {
    setFormError('');
    if (!selectedVenue) return setFormError('Please select a venue.');
    if (form.promoteWhat === 'event' && !form.eventId) return setFormError('Choose an event to promote.');
    if (!form.title.trim()) return setFormError('Title is required.');
    if (!form.body.trim()) return setFormError('Body is required.');
    if (!form.startsAt || !form.endsAt) return setFormError('Start and end dates are required.');

    setSaving(true);
    try {
      let startsAtIso;
      let endsAtIso;
      try {
        startsAtIso = localDateTimeToIso(form.startsAt);
        endsAtIso = localDateTimeToIso(form.endsAt);
      } catch {
        setFormError('Invalid start or end date. Please pick valid date and time values.');
        setSaving(false);
        return;
      }

      const created = await apiPost('/api/promotions', {
        venueId: selectedVenue.trim(),
        eventId: form.promoteWhat === 'event' ? form.eventId.trim() : null,
        promotionType: form.promotionType,
        title: form.title.trim(),
        body: form.body.trim(),
        imageUrl: form.imageUrl ? form.imageUrl.trim() : null,
        imagePublicId: form.imagePublicId ? form.imagePublicId.trim() : null,
        targetCity: form.targetCity ? form.targetCity.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      });

      toast.success('Your promotion is live!');
      setJustPublished(created);
      setForm({
        promoteWhat: 'venue',
        eventId: '',
        promotionType: 'VENUE_PROMOTION',
        title: '',
        body: '',
        imageUrl: '',
        imagePublicId: '',
        targetCity: '',
        startsAt: '',
        endsAt: '',
      });
      await loadPromotions(selectedVenue);
    } catch (e) {
      setFormError(formatApiError(e, 'Failed to publish promotion'));
    } finally {
      setSaving(false);
    }
  }

  async function startBoost(promotion) {
    try {
      const payment = await apiPost(`/api/promotions/${promotion.id}/boost`, {});
      if (payment?.authorization_url) window.location.href = payment.authorization_url;
      else toast.error('Could not initialize Paystack payment');
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to initialize boost payment');
    }
  }

  async function patchPromotion(id, payload) {
    try {
      await apiPatch(`/api/promotions/${id}`, payload);
      await loadPromotions(selectedVenue);
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Update failed');
    }
  }

  async function deletePromotion(id) {
    try {
      await apiDelete(`/api/promotions/${id}`);
      await loadPromotions(selectedVenue);
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Delete failed');
    }
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 12px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Promotions</h1>
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 14 }}>Create and manage your venue promotions.</p>

      <div className="sec-card" style={{ padding: 12, marginBottom: 12 }}>
        <Label>Select Venue</Label>
        <select className="sec-input-rect" value={selectedVenue} onChange={(e) => setSelectedVenue(e.target.value)} style={{ marginTop: 6, height: 42 }}>
          <option value="">Choose a venue</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      <div className="sec-card" style={{ padding: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Create Promotion</h2>
        <Label>What are you promoting?</Label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="sec-btn sec-btn-secondary" onClick={() => setForm((f) => ({ ...f, promoteWhat: 'venue', eventId: '' }))} style={{ flex: 1, opacity: form.promoteWhat === 'venue' ? 1 : 0.6 }}>My Venue</button>
          <button className="sec-btn sec-btn-secondary" onClick={() => setForm((f) => ({ ...f, promoteWhat: 'event' }))} style={{ flex: 1, opacity: form.promoteWhat === 'event' ? 1 : 0.6 }}>An Event</button>
        </div>

        {form.promoteWhat === 'event' && (
          <div style={{ marginTop: 10 }}>
            <Label>Event</Label>
            <select className="sec-input-rect" value={form.eventId} onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))} style={{ marginTop: 6, height: 42 }}>
              <option value="">Select upcoming event</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <Label>Promotion Type</Label>
          <select className="sec-input-rect" value={form.promotionType} onChange={(e) => setForm((f) => ({ ...f, promotionType: e.target.value }))} style={{ marginTop: 6, height: 42 }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Title ({form.title.length}/100)</Label>
          <input className="sec-input-rect" value={form.title} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={{ marginTop: 6, height: 42 }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Label>Body ({form.body.length}/500)</Label>
          <textarea className="sec-input-rect" value={form.body} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} style={{ marginTop: 6, minHeight: 90 }} />
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Image Upload (optional)</Label>
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.svg,image/svg+xml" onChange={(e) => uploadImage(e.target.files?.[0])} style={{ marginTop: 6 }} />
          {form.imageUrl && (
            <div style={{ marginTop: 8 }}>
              <img src={form.imageUrl} alt="Promotion" style={{ width: '100%', borderRadius: 12, maxHeight: 180, objectFit: 'cover' }} />
              <button className="sec-btn sec-btn-ghost" style={{ marginTop: 6 }} onClick={() => setForm((f) => ({ ...f, imageUrl: '', imagePublicId: '' }))}>Remove image</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Target City</Label>
          <select className="sec-input-rect" value={form.targetCity} onChange={(e) => setForm((f) => ({ ...f, targetCity: e.target.value }))} style={{ marginTop: 6, height: 42 }}>
            <option value="">National — Show to everyone</option>
            {SA_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Start Date + Time</Label>
          <input type="datetime-local" className="sec-input-rect" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} style={{ marginTop: 6, height: 42 }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Label>End Date + Time</Label>
          <input type="datetime-local" className="sec-input-rect" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} style={{ marginTop: 6, height: 42 }} />
        </div>
        {durationText && <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 8 }}>{durationText}</p>}
        {formError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{formError}</p>}

        <button className="sec-btn sec-btn-primary sec-btn-full" disabled={saving} style={{ marginTop: 12 }} onClick={handlePublish}>
          {saving ? 'Publishing...' : 'Publish Promotion'}
        </button>
      </div>

      {justPublished && (
        <div className="sec-card" style={{ padding: 12, marginBottom: 12, border: '1px solid #facc15' }}>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            Want more reach? Boost this promotion for R150 and get priority placement for 7 days.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sec-btn sec-btn-primary" style={{ flex: 1 }} onClick={() => startBoost(justPublished)}>Boost Now</button>
            <button className="sec-btn sec-btn-secondary" style={{ flex: 1 }} onClick={() => setJustPublished(null)}>Maybe Later</button>
          </div>
        </div>
      )}

      <div className="sec-card" style={{ padding: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Your Promotions</h2>
        {loadingList && <p style={{ fontSize: 12 }}>Loading...</p>}
        {!loadingList && promotions.length === 0 && <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>No promotions yet.</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {promotions.map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--sec-border)', borderRadius: 12, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{p.title}</strong>
                <span style={{ fontSize: 11, background: getStatusColor(p.status), color: '#fff', borderRadius: 999, padding: '2px 8px' }}>{p.status}</span>
              </div>
              <p style={{ fontSize: 11, marginTop: 4 }}>{p.promotionType}</p>
              <p style={{ fontSize: 11, marginTop: 2 }}>Target: {p.targetCity || 'National'}</p>
              <p style={{ fontSize: 11 }}>Views {p.boostImpressions + p.organicImpressions} · Clicks {p.totalClicks}</p>
              {p.eventId && <p style={{ fontSize: 11 }}>Promoting: {p.eventName || 'Event'}</p>}
              {p.boosted && <p style={{ fontSize: 11, color: '#facc15' }}>Boosted until {new Date(p.boostExpiresAt).toLocaleDateString()}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                {(p.status === 'ACTIVE' || p.status === 'DRAFT') && <button className="sec-btn sec-btn-secondary" onClick={() => patchPromotion(p.id, { status: p.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })}>{p.status === 'ACTIVE' ? 'Pause' : 'Resume'}</button>}
                <button className="sec-btn sec-btn-secondary" onClick={() => startBoost(p)}>Boost (R150)</button>
                {(p.status === 'ACTIVE' || p.status === 'DRAFT') && <button className="sec-btn sec-btn-ghost" onClick={() => {
                  const nextTitle = window.prompt('Edit title', p.title);
                  if (nextTitle) patchPromotion(p.id, { title: nextTitle });
                }}>Edit</button>}
                {(p.status === 'DRAFT' || p.status === 'ENDED') && <button className="sec-btn sec-btn-ghost" onClick={() => deletePromotion(p.id)}>Delete</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
