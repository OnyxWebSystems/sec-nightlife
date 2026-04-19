import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';

const SA_CITIES = ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Bloemfontein', 'Port Elizabeth', 'East London', 'Polokwane', 'Nelspruit', 'Rustenburg'];
const TYPES = [
  { value: 'VENUE_PROMOTION', label: 'Venue Promotion' },
  { value: 'EVENT_PROMOTION', label: 'Event Promotion' },
  { value: 'SPECIAL_OFFER', label: 'Special Offer' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
];

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PromotionStatusBadge({ status }) {
  const base = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    borderRadius: 999,
    padding: '4px 10px',
    border: '1px solid var(--sec-border)',
    textTransform: 'uppercase',
    flexShrink: 0,
  };
  const by = {
    ACTIVE: { color: 'var(--sec-text-primary)', background: 'var(--sec-success-muted)', borderColor: 'var(--sec-border-strong)' },
    PAUSED: { color: 'var(--sec-text-primary)', background: 'var(--sec-warning-muted)', borderColor: 'var(--sec-border-strong)' },
    ENDED: { color: 'var(--sec-text-muted)', background: 'var(--sec-bg-hover)', borderColor: 'var(--sec-border)' },
    DRAFT: { color: 'var(--sec-text-primary)', background: 'var(--sec-info-muted)', borderColor: 'var(--sec-border-strong)' },
  };
  return <span style={{ ...base, ...(by[status] || by.DRAFT) }}>{status}</span>;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

function isAllowedPromotionImage(file) {
  if (ALLOWED_IMAGE_TYPES.has(file.type)) return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.svg') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
}

async function uploadPromotionImageFile(file) {
  if (!file) return null;
  if (!isAllowedPromotionImage(file)) {
    toast.error('Only JPG, PNG, WEBP, or SVG are allowed');
    return null;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast.error('Image must be 5MB or smaller');
    return null;
  }
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) {
    toast.error('Cloudinary is not configured');
    return null;
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
  return { imageUrl: json.secure_url, imagePublicId: json.public_id };
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

function isInvalidInputError(error) {
  const message = String(error?.data?.error || error?.message || '').toLowerCase();
  return message.includes('invalid input') || message.includes('invalid payload');
}

function extractErrorDetails(error) {
  const details = error?.data?.details;
  const fieldErrors = details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    const parts = Object.entries(fieldErrors).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map((x) => `${k}: ${x}`) : [`${k}: ${v}`]
    );
    if (parts.length) return parts.join('; ');
  }

  const issues = error?.data?.issues;
  if (Array.isArray(issues) && issues.length) {
    const parts = issues
      .map((i) => {
        const path = Array.isArray(i?.path) ? i.path.join('.') : '';
        return path ? `${path}: ${i?.message || 'Invalid value'}` : i?.message;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }

  if (Array.isArray(details)) {
    const parts = details.map((d) => (typeof d === 'string' ? d : d?.message)).filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  return '';
}

const PromotionCreateForm = React.memo(function PromotionCreateForm({ selectedVenue, events, onPublished }) {
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
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const durationText = useMemo(() => {
    if (!form.startsAt || !form.endsAt) return '';
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return `This promotion runs for ${days} day${days === 1 ? '' : 's'}`;
  }, [form.startsAt, form.endsAt]);

  async function uploadImage(file) {
    try {
      const result = await uploadPromotionImageFile(file);
      if (!result) return;
      setForm((prev) => ({ ...prev, imageUrl: result.imageUrl, imagePublicId: result.imagePublicId }));
    } catch (e) {
      toast.error(e?.message || 'Upload failed');
    }
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

      const payload = {
        venueId: selectedVenue.trim(),
        eventId: form.promoteWhat === 'event' ? form.eventId.trim() : null,
        promotionType: form.promotionType,
        type: form.promotionType,
        title: form.title.trim(),
        body: form.body.trim(),
        description: form.body.trim(),
        imageUrl: form.imageUrl ? form.imageUrl.trim() : null,
        imagePublicId: form.imagePublicId ? form.imagePublicId.trim() : null,
        targetCity: form.targetCity ? form.targetCity.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        startAt: startsAtIso,
        endAt: endsAtIso,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        venue_id: selectedVenue.trim(),
        event_id: form.promoteWhat === 'event' ? form.eventId.trim() : null,
        promotion_type: form.promotionType,
        image_url: form.imageUrl ? form.imageUrl.trim() : null,
        image_public_id: form.imagePublicId ? form.imagePublicId.trim() : null,
        target_city: form.targetCity ? form.targetCity.trim() : null,
      };

      let created;
      try {
        created = await apiPost('/api/promotions', payload);
      } catch (error) {
        if (!isInvalidInputError(error)) throw error;

        // Backward compatibility for older backend payload contracts.
        created = await apiPost('/api/promotions', {
          venue_id: payload.venueId,
          event_id: payload.eventId,
          promotion_type: payload.promotionType,
          type: payload.promotionType,
          title: payload.title,
          body: payload.body,
          description: payload.body,
          image_url: payload.imageUrl,
          image_public_id: payload.imagePublicId,
          target_city: payload.targetCity,
          starts_at: payload.startsAt,
          ends_at: payload.endsAt,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          startAt: payload.startsAt,
          endAt: payload.endsAt,
        });
      }

      toast.success('Your promotion is live!');
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
      await onPublished(created);
    } catch (e) {
      const extra = extractErrorDetails(e);
      setFormError(extra ? `${formatApiError(e, 'Failed to publish promotion')} — ${extra}` : formatApiError(e, 'Failed to publish promotion'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sec-card" style={{ padding: 12, marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Create Promotion</h2>
      <Label>What are you promoting?</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" className="sec-btn sec-btn-secondary" onClick={() => setForm((f) => ({ ...f, promoteWhat: 'venue', eventId: '' }))} style={{ flex: 1, opacity: form.promoteWhat === 'venue' ? 1 : 0.6 }}>My Venue</button>
        <button type="button" className="sec-btn sec-btn-secondary" onClick={() => setForm((f) => ({ ...f, promoteWhat: 'event' }))} style={{ flex: 1, opacity: form.promoteWhat === 'event' ? 1 : 0.6 }}>An Event</button>
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
            <button type="button" className="sec-btn sec-btn-ghost" style={{ marginTop: 6 }} onClick={() => setForm((f) => ({ ...f, imageUrl: '', imagePublicId: '' }))}>Remove image</button>
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

      <button type="button" className="sec-btn sec-btn-primary sec-btn-full" disabled={saving} style={{ marginTop: 12 }} onClick={handlePublish}>
        {saving ? 'Publishing...' : 'Publish Promotion'}
      </button>
    </div>
  );
});

const PromotionEditModal = React.memo(function PromotionEditModal({ open, promotion, events, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !promotion) return;
    setForm({
      promoteWhat: promotion.eventId ? 'event' : 'venue',
      eventId: promotion.eventId || '',
      promotionType: promotion.promotionType || 'VENUE_PROMOTION',
      title: promotion.title || '',
      body: promotion.body || '',
      imageUrl: promotion.imageUrl || '',
      imagePublicId: promotion.imagePublicId || '',
      targetCity: promotion.targetCity || '',
      startsAt: isoToDatetimeLocal(promotion.startsAt),
      endsAt: isoToDatetimeLocal(promotion.endsAt),
    });
    setFormError('');
    setSaving(false);
  }, [open, promotion]);

  const durationText = useMemo(() => {
    if (!form?.startsAt || !form?.endsAt) return '';
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return `This promotion runs for ${days} day${days === 1 ? '' : 's'}`;
  }, [form?.startsAt, form?.endsAt]);

  async function uploadImage(file) {
    try {
      const result = await uploadPromotionImageFile(file);
      if (!result) return;
      setForm((prev) => (prev ? { ...prev, imageUrl: result.imageUrl, imagePublicId: result.imagePublicId } : prev));
    } catch (e) {
      toast.error(e?.message || 'Upload failed');
    }
  }

  async function handleSave() {
    if (!form || !promotion) return;
    setFormError('');
    if (form.promoteWhat === 'event' && !form.eventId) return setFormError('Choose an event to promote.');
    if (!form.title.trim()) return setFormError('Title is required.');
    if (!form.body.trim()) return setFormError('Body is required.');
    if (!form.startsAt || !form.endsAt) return setFormError('Start and end dates are required.');
    let startsAtIso;
    let endsAtIso;
    try {
      startsAtIso = localDateTimeToIso(form.startsAt);
      endsAtIso = localDateTimeToIso(form.endsAt);
    } catch {
      return setFormError('Invalid start or end date.');
    }
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        body: form.body.trim(),
        promotionType: form.promotionType,
        eventId: form.promoteWhat === 'event' ? form.eventId.trim() : null,
        imageUrl: form.imageUrl ? form.imageUrl.trim() : null,
        imagePublicId: form.imagePublicId ? form.imagePublicId.trim() : null,
        targetCity: form.targetCity ? form.targetCity.trim() : null,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
      });
    } finally {
      setSaving(false);
    }
  }

  if (!open || !promotion || !form) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
    >
      <div
        className="sec-card"
        style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Edit promotion</h2>
          <button type="button" className="sec-btn sec-btn-ghost" onClick={onClose} style={{ minWidth: 36 }} aria-label="Close">
            ×
          </button>
        </div>

        <Label>What are you promoting?</Label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className="sec-btn sec-btn-secondary"
            onClick={() => setForm((f) => ({ ...f, promoteWhat: 'venue', eventId: '' }))}
            style={{ flex: 1, opacity: form.promoteWhat === 'venue' ? 1 : 0.6 }}
          >
            My Venue
          </button>
          <button
            type="button"
            className="sec-btn sec-btn-secondary"
            onClick={() => setForm((f) => ({ ...f, promoteWhat: 'event' }))}
            style={{ flex: 1, opacity: form.promoteWhat === 'event' ? 1 : 0.6 }}
          >
            An Event
          </button>
        </div>

        {form.promoteWhat === 'event' && (
          <div style={{ marginTop: 10 }}>
            <Label>Event</Label>
            <select
              className="sec-input-rect"
              value={form.eventId}
              onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))}
              style={{ marginTop: 6, height: 42 }}
            >
              <option value="">Select upcoming event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <Label>Promotion Type</Label>
          <select
            className="sec-input-rect"
            value={form.promotionType}
            onChange={(e) => setForm((f) => ({ ...f, promotionType: e.target.value }))}
            style={{ marginTop: 6, height: 42 }}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Title ({form.title.length}/100)</Label>
          <input
            className="sec-input-rect"
            value={form.title}
            maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={{ marginTop: 6, height: 42 }}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Label>Body ({form.body.length}/500)</Label>
          <textarea
            className="sec-input-rect"
            value={form.body}
            maxLength={500}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            style={{ marginTop: 6, minHeight: 90 }}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Image Upload (optional)</Label>
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.svg,image/svg+xml" onChange={(e) => uploadImage(e.target.files?.[0])} style={{ marginTop: 6 }} />
          {form.imageUrl && (
            <div style={{ marginTop: 8 }}>
              <img src={form.imageUrl} alt="Promotion" style={{ width: '100%', borderRadius: 12, maxHeight: 180, objectFit: 'cover' }} />
              <button type="button" className="sec-btn sec-btn-ghost" style={{ marginTop: 6 }} onClick={() => setForm((f) => ({ ...f, imageUrl: '', imagePublicId: '' }))}>
                Remove image
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Target City</Label>
          <select
            className="sec-input-rect"
            value={form.targetCity}
            onChange={(e) => setForm((f) => ({ ...f, targetCity: e.target.value }))}
            style={{ marginTop: 6, height: 42 }}
          >
            <option value="">National — Show to everyone</option>
            {SA_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <Label>Start Date + Time</Label>
          <input
            type="datetime-local"
            className="sec-input-rect"
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
            style={{ marginTop: 6, height: 42 }}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Label>End Date + Time</Label>
          <input
            type="datetime-local"
            className="sec-input-rect"
            value={form.endsAt}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
            style={{ marginTop: 6, height: 42 }}
          />
        </div>
        {durationText && <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 8 }}>{durationText}</p>}
        {formError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{formError}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" className="sec-btn sec-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sec-btn sec-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
});

const PromotionCardsList = React.memo(function PromotionCardsList({ promotions, loadingList, onPatch, onDelete, onBoost, onEditOpen }) {
  return (
    <div className="sec-card" style={{ padding: 12 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Your Promotions</h2>
      {loadingList && <p style={{ fontSize: 12 }}>Loading...</p>}
      {!loadingList && promotions.length === 0 && <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>No promotions yet.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {promotions.map((p) => (
          <div key={p.id} style={{ border: '1px solid var(--sec-border)', borderRadius: 12, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <strong style={{ fontSize: 14 }}>{p.title}</strong>
              <PromotionStatusBadge status={p.status} />
            </div>
            <p style={{ fontSize: 11, marginTop: 4 }}>{p.promotionType}</p>
            <p style={{ fontSize: 11, marginTop: 2 }}>Target: {p.targetCity || 'National'}</p>
            <p style={{ fontSize: 11 }}>Views {p.boostImpressions + p.organicImpressions} · Clicks {p.totalClicks}</p>
            {p.eventId && <p style={{ fontSize: 11 }}>Promoting: {p.eventName || 'Event'}</p>}
            {p.boosted && <p style={{ fontSize: 11, color: 'var(--sec-warning)' }}>Boosted until {new Date(p.boostExpiresAt).toLocaleDateString()}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {p.status !== 'ENDED' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {p.status === 'ACTIVE' && (
                    <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onPatch(p.id, { status: 'PAUSED' })}>
                      Pause
                    </button>
                  )}
                  {p.status === 'PAUSED' && (
                    <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onPatch(p.id, { status: 'ACTIVE' })}>
                      Resume
                    </button>
                  )}
                  {p.status === 'DRAFT' && (
                    <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onPatch(p.id, { status: 'ACTIVE' })}>
                      Activate
                    </button>
                  )}
                  <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onBoost(p)}>
                    Boost (R150)
                  </button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onEditOpen(p)}>
                  Edit
                </button>
                <button type="button" className="sec-btn sec-btn-ghost" onClick={() => onDelete(p.id)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function BusinessPromotions() {
  const [user, setUser] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [promotions, setPromotions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [justPublished, setJustPublished] = useState(null);
  const [editingPromotion, setEditingPromotion] = useState(null);

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
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const loadPromotions = useCallback(async (venueId) => {
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
  }, []);

  const loadEvents = useCallback(async (venueId) => {
    if (!venueId) return;
    try {
      const list = await dataService.Event.filter({ venue_id: venueId, status: 'published' }, 'date', 50);
      setEvents(Array.isArray(list) ? list : []);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedVenue) return;
    void (async () => {
      await Promise.all([loadPromotions(selectedVenue), loadEvents(selectedVenue)]);
    })();
  }, [selectedVenue, loadPromotions, loadEvents]);

  const handlePromotionPublished = useCallback(async (created) => {
    setJustPublished(created);
    await loadPromotions(selectedVenue);
  }, [selectedVenue, loadPromotions]);

  const startBoost = useCallback(async (promotion) => {
    try {
      const payment = await apiPost(`/api/promotions/${promotion.id}/boost`, {});
      if (payment?.authorization_url) window.location.href = payment.authorization_url;
      else toast.error('Could not initialize Paystack payment');
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to initialize boost payment');
    }
  }, []);

  const patchPromotion = useCallback(async (id, payload) => {
    try {
      await apiPatch(`/api/promotions/${id}`, payload);
      await loadPromotions(selectedVenue);
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Update failed');
    }
  }, [selectedVenue, loadPromotions]);

  const saveEditedPromotion = useCallback(
    async (payload) => {
      if (!editingPromotion) return;
      try {
        await apiPatch(`/api/promotions/${editingPromotion.id}`, payload);
        await loadPromotions(selectedVenue);
        setEditingPromotion(null);
        toast.success('Promotion updated');
      } catch (e) {
        toast.error(e?.data?.error || e.message || 'Update failed');
      }
    },
    [editingPromotion, selectedVenue, loadPromotions]
  );

  const deletePromotion = useCallback(async (id) => {
    if (!window.confirm('Delete this promotion? It will be removed from discovery.')) return;
    try {
      await apiDelete(`/api/promotions/${id}`);
      await loadPromotions(selectedVenue);
      toast.success('Promotion deleted');
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Delete failed');
    }
  }, [selectedVenue, loadPromotions]);

  if (!user) return null;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 12px 100px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Promotions</h1>
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 14 }}>Create and manage your venue promotions.</p>
      <div style={{ marginBottom: 12 }}>
        <RefundPolicyNote />
      </div>

      <div className="sec-card" style={{ padding: 12, marginBottom: 12 }}>
        <Label>Select Venue</Label>
        <select className="sec-input-rect" value={selectedVenue} onChange={(e) => setSelectedVenue(e.target.value)} style={{ marginTop: 6, height: 42 }}>
          <option value="">Choose a venue</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      <PromotionCreateForm selectedVenue={selectedVenue} events={events} onPublished={handlePromotionPublished} />

      {justPublished && (
        <div className="sec-card" style={{ padding: 12, marginBottom: 12, border: '1px solid #facc15' }}>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            Want more reach? Boost this promotion for R150 and get priority placement for 7 days.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sec-btn sec-btn-primary" style={{ flex: 1 }} onClick={() => startBoost(justPublished)}>Boost Now</button>
            <button className="sec-btn sec-btn-secondary" style={{ flex: 1 }} onClick={() => setJustPublished(null)}>Maybe Later</button>
          </div>
          <div style={{ marginTop: 10 }}>
            <RefundPolicyNote />
          </div>
        </div>
      )}

      <PromotionEditModal
        open={!!editingPromotion}
        promotion={editingPromotion}
        events={events}
        onClose={() => setEditingPromotion(null)}
        onSave={saveEditedPromotion}
      />

      <PromotionCardsList
        promotions={promotions}
        loadingList={loadingList}
        onPatch={patchPromotion}
        onDelete={deletePromotion}
        onBoost={startBoost}
        onEditOpen={(p) => setEditingPromotion(p)}
      />
    </div>
  );
}
