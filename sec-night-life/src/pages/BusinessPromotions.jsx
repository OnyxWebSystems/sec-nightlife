import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import { createPageUrl } from '@/utils';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';
import { launchPaystackInline, verifyPaystackReferenceWithRetry } from '@/lib/paystackInline';

const PUBLISH_ZAR_PER_DAY = 50;
const BOOST_ZAR_PER_DAY = 150;
const MIN_PUBLISH_D = 1;
const MAX_PUBLISH_D = 30;
const MIN_BOOST_D = 0;
const MAX_BOOST_D = 30;
const SPECIAL_OFFER_EXP_PREFIX = '__SEC_SPECIAL_OFFER_EXP__:';
const PROMO_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const PROMOTION_CROP_ASPECT = 16 / 10;
const PROMOTION_CROP_DIALOG_PROPS = {
  aspect: PROMOTION_CROP_ASPECT,
  maxCropHeight: 'min(80vh, 520px)',
  contentClassName: 'max-w-2xl',
};

async function checkoutPromotionPublish({ promotionId, publishDays, boostDays, email, onSuccess }) {
  const pay = await apiPost(`/api/promotions/${promotionId}/checkout`, {
    publishDays,
    boostDays: Math.max(0, boostDays),
  });
  if (!pay?.reference || !pay?.access_code) {
    toast.error('Could not start payment. Check Paystack configuration.');
    return false;
  }
  await launchPaystackInline({
    email,
    amount: pay.amount_zar ?? 0,
    reference: pay.reference,
    accessCode: pay.access_code,
    onSuccess: async () => {
      const verify = await verifyPaystackReferenceWithRetry(pay.reference, { retries: 6, baseDelayMs: 1200 });
      if (verify?.status === 'failed') throw new Error('Payment verification failed.');
      if (verify?.status !== 'paid') {
        toast.message('Payment received, confirmation pending', {
          description: 'We are finalizing your promotion. It should appear shortly.',
        });
        throw new Error('Payment is still pending confirmation. Please wait and refresh shortly.');
      }
      if (onSuccess) await onSuccess();
      toast.success('Payment successful — your promotion is live.');
    },
    onCancel: () => {
      toast.message('Checkout closed', { description: 'No charge was completed.' });
    },
  });
  return true;
}

async function checkoutPromotionBoostOnly({ promotionId, days, email, onSuccess }) {
  const payment = await apiPost(`/api/promotions/${promotionId}/boost`, { days });
  if (!payment?.reference || !payment?.access_code) {
    toast.error('Could not initialize Paystack payment');
    return false;
  }
  await launchPaystackInline({
    email,
    amount: payment.amount_zar ?? days * BOOST_ZAR_PER_DAY,
    reference: payment.reference,
    accessCode: payment.access_code,
    onSuccess: async () => {
      const verify = await verifyPaystackReferenceWithRetry(payment.reference, { retries: 6, baseDelayMs: 1200 });
      if (verify?.status === 'failed') throw new Error('Boost payment verification failed.');
      if (verify?.status !== 'paid') {
        toast.message('Payment received, confirmation pending', {
          description: 'We are finalizing your boost. It should appear shortly.',
        });
        throw new Error('Boost payment is still pending confirmation. Please wait and refresh shortly.');
      }
      if (onSuccess) await onSuccess();
      toast.success(`Boost active for ${days} day(s)`);
    },
    onCancel: () => {
      toast.message('Checkout closed');
    },
  });
  return true;
}

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

function buildDefaultPromotionSchedule(publishDays = 7) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + publishDays * 24 * 60 * 60 * 1000);
  return {
    startsAt: isoToDatetimeLocal(start.toISOString()),
    endsAt: isoToDatetimeLocal(end.toISOString()),
  };
}

function validatePromotionSchedule(startsAtLocal, endsAtLocal, publishDays) {
  const start = new Date(startsAtLocal);
  const end = new Date(endsAtLocal);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Invalid start or end date and time';
  if (end <= start) return 'End must be after start';
  const spanMs = end.getTime() - start.getTime();
  if (spanMs > PROMO_MAX_MS) return 'Promotion duration cannot exceed 30 days';
  const billedDays = Math.max(1, Math.ceil(spanMs / (24 * 60 * 60 * 1000)));
  if (billedDays > publishDays) {
    return `Increase run length to at least ${billedDays} day${billedDays === 1 ? '' : 's'} to cover your schedule`;
  }
  return null;
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

const PromotionCreateForm = React.memo(function PromotionCreateForm({ selectedVenue, events, userEmail, onPublished }) {
  const [form, setForm] = useState(() => ({
    promoteWhat: 'venue',
    eventId: '',
    promotionType: 'VENUE_PROMOTION',
    title: '',
    body: '',
    imageUrl: '',
    imagePublicId: '',
    targetCity: '',
    ...buildDefaultPromotionSchedule(7),
  }));
  const [publishDays, setPublishDays] = useState(7);
  const [boostDays, setBoostDays] = useState(3);
  const [useBoost, setUseBoost] = useState(true);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const imageCrop = useImageCropUpload({
    onCropped: async (file) => {
      try {
        const result = await uploadPromotionImageFile(file);
        if (!result) return;
        setForm((prev) => ({ ...prev, imageUrl: result.imageUrl, imagePublicId: result.imagePublicId }));
      } catch (e) {
        toast.error(e?.message || 'Upload failed');
      }
    },
  });

  const publishTotal = publishDays * PUBLISH_ZAR_PER_DAY;
  const boostTotal = useBoost ? boostDays * BOOST_ZAR_PER_DAY : 0;
  const checkoutTotal = publishTotal + boostTotal;

  const durationText = useMemo(() => {
    if (!form.startsAt || !form.endsAt) return '';
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    return `This promotion runs for ${days} day${days === 1 ? '' : 's'}`;
  }, [form.startsAt, form.endsAt]);

  async function handlePayAndPublish() {
    setFormError('');
    if (!selectedVenue) return setFormError('Please select a venue.');
    if (form.promoteWhat === 'event' && !form.eventId) return setFormError('Choose an event to promote.');
    if (!form.title.trim()) return setFormError('Title is required.');
    if (!form.body.trim()) return setFormError('Body is required.');
    if (!userEmail) return setFormError('Sign in with a verified email to pay.');
    if (useBoost && boostDays < 1) return setFormError('Choose at least 1 boost day or turn boost off.');
    if (!form.startsAt || !form.endsAt) return setFormError('Start and end date/time are required.');
    const scheduleErr = validatePromotionSchedule(form.startsAt, form.endsAt, publishDays);
    if (scheduleErr) return setFormError(scheduleErr);

    let startsAtIso;
    let endsAtIso;
    try {
      startsAtIso = localDateTimeToIso(form.startsAt);
      endsAtIso = localDateTimeToIso(form.endsAt);
    } catch {
      return setFormError('Invalid start or end date and time');
    }

    setSaving(true);
    try {
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

      const ok = await checkoutPromotionPublish({
        promotionId: created.id,
        publishDays,
        boostDays: useBoost ? boostDays : 0,
        email: userEmail,
        onSuccess: async () => {
          await onPublished(created);
        },
      });

      if (ok) {
        setForm({
          promoteWhat: 'venue',
          eventId: '',
          promotionType: 'VENUE_PROMOTION',
          title: '',
          body: '',
          imageUrl: '',
          imagePublicId: '',
          targetCity: '',
          ...buildDefaultPromotionSchedule(7),
        });
        setPublishDays(7);
        setBoostDays(3);
        setUseBoost(true);
      }
    } catch (e) {
      const extra = extractErrorDetails(e);
      setFormError(extra ? `${formatApiError(e, 'Could not create or pay')} — ${extra}` : formatApiError(e, 'Could not create or pay'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="sec-card"
      style={{
        padding: 22,
        marginBottom: 20,
        border: '1px solid var(--sec-accent-border)',
        boxShadow: 'var(--shadow-card)',
        background: 'linear-gradient(165deg, var(--sec-bg-elevated) 0%, var(--sec-bg-card) 45%, var(--sec-bg-card) 100%)',
      }}
    >
      <span className="sec-label" style={{ marginBottom: 8 }}>
        New campaign
      </span>
      <h2 className="sec-page-title" style={{ fontSize: 'var(--text-2xl)', marginBottom: 6 }}>
        Create & publish
      </h2>
      <p className="sec-page-subtitle" style={{ fontSize: 'var(--text-sm)', marginTop: 0, marginBottom: 18 }}>
        Save a draft, then pay R{PUBLISH_ZAR_PER_DAY}/day to go live. Optional boost R{BOOST_ZAR_PER_DAY}/day for priority in the home feed — all in one checkout.
      </p>

      <Label>What are you promoting?</Label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" className="sec-btn sec-btn-secondary" onClick={() => setForm((f) => ({ ...f, promoteWhat: 'venue', eventId: '' }))} style={{ flex: 1, opacity: form.promoteWhat === 'venue' ? 1 : 0.55, borderColor: form.promoteWhat === 'venue' ? 'var(--sec-accent)' : undefined }}>
          My Venue
        </button>
        <button type="button" className="sec-btn sec-btn-secondary" onClick={() => setForm((f) => ({ ...f, promoteWhat: 'event' }))} style={{ flex: 1, opacity: form.promoteWhat === 'event' ? 1 : 0.55, borderColor: form.promoteWhat === 'event' ? 'var(--sec-accent)' : undefined }}>
          An Event
        </button>
      </div>

      {form.promoteWhat === 'event' && (
        <div style={{ marginTop: 14 }}>
          <Label>Event</Label>
          <select className="sec-input-rect" value={form.eventId} onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))} style={{ marginTop: 6, height: 44, width: '100%' }}>
            <option value="">Select upcoming event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Label>Promotion Type</Label>
        <select className="sec-input-rect" value={form.promotionType} onChange={(e) => setForm((f) => ({ ...f, promotionType: e.target.value }))} style={{ marginTop: 6, height: 44, width: '100%' }}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <Label>Title ({form.title.length}/100)</Label>
        <input className="sec-input-rect" value={form.title} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={{ marginTop: 6, height: 44, width: '100%' }} />
      </div>
      <div style={{ marginTop: 14 }}>
        <Label>Body ({form.body.length}/500)</Label>
        <textarea className="sec-input-rect" value={form.body} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} style={{ marginTop: 6, minHeight: 100, width: '100%' }} />
      </div>

      <div style={{ marginTop: 14 }}>
        <Label>Image (optional)</Label>
        <input type="file" accept=".jpg,.jpeg,.png,.webp,.svg,image/svg+xml" onChange={imageCrop.handleInputChange} style={{ marginTop: 8 }} />
        {form.imageUrl && (
          <div style={{ marginTop: 10 }}>
            <img src={form.imageUrl} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }} />
            <button type="button" className="sec-btn sec-btn-ghost" style={{ marginTop: 8 }} onClick={() => setForm((f) => ({ ...f, imageUrl: '', imagePublicId: '' }))}>
              Remove image
            </button>
          </div>
        )}
      </div>
      <ImageCropDialog
        open={imageCrop.cropOpen}
        onOpenChange={imageCrop.onCropOpenChange}
        imageSrc={imageCrop.cropSrc}
        title="Crop promotion image"
        onCropped={imageCrop.handleCropped}
        outputFileName="promotion.jpg"
        {...PROMOTION_CROP_DIALOG_PROPS}
      />

      <div style={{ marginTop: 14 }}>
        <Label>Target City</Label>
        <select className="sec-input-rect" value={form.targetCity} onChange={(e) => setForm((f) => ({ ...f, targetCity: e.target.value }))} style={{ marginTop: 6, height: 44, width: '100%' }}>
          <option value="">National — everyone</option>
          {SA_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <Label>Start Date + Time</Label>
        <input
          type="datetime-local"
          className="sec-input-rect"
          value={form.startsAt}
          onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
          style={{ marginTop: 6, height: 44, width: '100%' }}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <Label>End Date + Time</Label>
        <input
          type="datetime-local"
          className="sec-input-rect"
          value={form.endsAt}
          onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
          style={{ marginTop: 6, height: 44, width: '100%' }}
        />
      </div>
      {durationText && <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 8 }}>{durationText}</p>}

      <div
        style={{
          marginTop: 22,
          padding: 16,
          borderRadius: 14,
          border: '1px solid var(--sec-border-strong)',
          background: 'var(--sec-bg-base)',
        }}
      >
        <p className="sec-label" style={{ marginBottom: 10 }}>
          Checkout
        </p>
        <div style={{ marginBottom: 14 }}>
          <div className="flex justify-between text-sm mb-2" style={{ color: 'var(--sec-text-secondary)' }}>
            <span>Run length · {publishDays} day{publishDays === 1 ? '' : 's'} × R{PUBLISH_ZAR_PER_DAY}</span>
            <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>R{publishTotal.toLocaleString('en-ZA')}</span>
          </div>
          <input type="range" min={MIN_PUBLISH_D} max={MAX_PUBLISH_D} value={publishDays} onChange={(e) => setPublishDays(parseInt(e.target.value, 10))} className="w-full" style={{ accentColor: 'var(--sec-accent)' }} />
        </div>

        <label className="flex items-center gap-2 text-sm mb-3" style={{ color: 'var(--sec-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={useBoost} onChange={(e) => setUseBoost(e.target.checked)} />
          Add feed boost (R{BOOST_ZAR_PER_DAY}/day)
        </label>
        {useBoost ? (
          <div style={{ marginBottom: 14 }}>
            <div className="flex justify-between text-sm mb-2" style={{ color: 'var(--sec-text-secondary)' }}>
              <span>Boost · {boostDays} day{boostDays === 1 ? '' : 's'}</span>
              <span style={{ color: 'var(--sec-text-primary)', fontWeight: 600 }}>R{boostTotal.toLocaleString('en-ZA')}</span>
            </div>
            <input type="range" min={1} max={MAX_BOOST_D} value={Math.max(1, boostDays)} onChange={(e) => setBoostDays(parseInt(e.target.value, 10))} className="w-full" style={{ accentColor: 'var(--sec-warning)' }} />
          </div>
        ) : null}

        <div className="flex justify-between items-baseline pt-3 border-t" style={{ borderColor: 'var(--sec-border)' }}>
          <span style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Total due</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--sec-accent-bright)' }}>R{checkoutTotal.toLocaleString('en-ZA')}</span>
        </div>
      </div>

      {formError && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 12 }}>{formError}</p>}

      <button type="button" className="sec-btn sec-btn-primary sec-btn-full" disabled={saving || !selectedVenue} style={{ marginTop: 16, height: 50, fontWeight: 700 }} onClick={() => void handlePayAndPublish()}>
        {saving ? 'Processing…' : 'Pay & publish with Paystack'}
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

  const editImageCrop = useImageCropUpload({
    onCropped: async (file) => {
      try {
        const result = await uploadPromotionImageFile(file);
        if (!result) return;
        setForm((prev) => (prev ? { ...prev, imageUrl: result.imageUrl, imagePublicId: result.imagePublicId } : prev));
      } catch (e) {
        toast.error(e?.message || 'Upload failed');
      }
    },
  });

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
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.svg,image/svg+xml" onChange={editImageCrop.handleInputChange} style={{ marginTop: 6 }} />
          {form.imageUrl && (
            <div style={{ marginTop: 8 }}>
              <img src={form.imageUrl} alt="Promotion" style={{ width: '100%', borderRadius: 12, maxHeight: 180, objectFit: 'cover' }} />
              <button type="button" className="sec-btn sec-btn-ghost" style={{ marginTop: 6 }} onClick={() => setForm((f) => ({ ...f, imageUrl: '', imagePublicId: '' }))}>
                Remove image
              </button>
            </div>
          )}
        </div>
        <ImageCropDialog
          open={editImageCrop.cropOpen}
          onOpenChange={editImageCrop.onCropOpenChange}
          imageSrc={editImageCrop.cropSrc}
          title="Crop promotion image"
          onCropped={editImageCrop.handleCropped}
          outputFileName="promotion.jpg"
          {...PROMOTION_CROP_DIALOG_PROPS}
        />

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

const PublishRepublishModal = React.memo(function PublishRepublishModal({ open, promotion, userEmail, onClose, onPaid }) {
  const [publishDays, setPublishDays] = useState(7);
  const [boostDays, setBoostDays] = useState(3);
  const [useBoost, setUseBoost] = useState(true);
  const [paying, setPaying] = useState(false);

  const publishTotal = publishDays * PUBLISH_ZAR_PER_DAY;
  const boostTotal = useBoost ? boostDays * BOOST_ZAR_PER_DAY : 0;
  const checkoutTotal = publishTotal + boostTotal;

  if (!open || !promotion) return null;

  async function pay() {
    if (!userEmail) {
      toast.error('Sign in with email to pay.');
      return;
    }
    if (useBoost && boostDays < 1) {
      toast.error('Choose boost days or turn boost off.');
      return;
    }
    setPaying(true);
    try {
      await checkoutPromotionPublish({
        promotionId: promotion.id,
        publishDays,
        boostDays: useBoost ? boostDays : 0,
        email: userEmail,
        onSuccess: async () => {
          await onPaid();
          onClose();
        },
      });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="sec-card"
        style={{ maxWidth: 420, width: '100%', padding: 20, border: '1px solid var(--sec-accent-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sec-label">Checkout</span>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{promotion.title}</h3>
        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>Pay to go live for the days you choose.</p>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: 'var(--sec-text-secondary)' }}>Publish · {publishDays}d × R{PUBLISH_ZAR_PER_DAY}</span>
            <span style={{ fontWeight: 600 }}>R{publishTotal}</span>
          </div>
          <input type="range" min={MIN_PUBLISH_D} max={MAX_PUBLISH_D} value={publishDays} onChange={(e) => setPublishDays(+e.target.value)} style={{ width: '100%', accentColor: 'var(--sec-accent)' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer', color: 'var(--sec-text-secondary)' }}>
          <input type="checkbox" checked={useBoost} onChange={(e) => setUseBoost(e.target.checked)} />
          Boost feed · R{BOOST_ZAR_PER_DAY}/day
        </label>
        {useBoost ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--sec-text-secondary)' }}>{boostDays} day(s)</span>
              <span style={{ fontWeight: 600 }}>R{boostTotal}</span>
            </div>
            <input type="range" min={1} max={MAX_BOOST_D} value={Math.max(1, boostDays)} onChange={(e) => setBoostDays(+e.target.value)} style={{ width: '100%', accentColor: 'var(--sec-warning)' }} />
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--sec-border)' }}>
          <span style={{ color: 'var(--sec-text-muted)' }}>Total</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-accent-bright)' }}>R{checkoutTotal}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" className="sec-btn sec-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sec-btn sec-btn-primary" style={{ flex: 1 }} disabled={paying} onClick={() => void pay()}>
            {paying ? '…' : 'Pay with Paystack'}
          </button>
        </div>
      </div>
    </div>
  );
});

const PromotionCardsList = React.memo(function PromotionCardsList({
  promotions,
  loadingList,
  listMode,
  onPatch,
  onDelete,
  onEditOpen,
  onPublishOpen,
  onBoostPay,
  onAddToMenuSpecial,
}) {
  const title = listMode === 'past' ? 'Past promotions' : 'Live & drafts';
  return (
    <div className="sec-card" style={{ padding: 18, border: '1px solid var(--sec-border-strong)', boxShadow: 'var(--shadow-sm)' }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>{title}</h2>
      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginBottom: 12 }}>
        {listMode === 'past' ? 'Republish to run again or remove permanently.' : 'Pause, boost, or finish edits before you pay drafts live.'}
      </p>
      {loadingList && <p style={{ fontSize: 13 }}>Loading…</p>}
      {!loadingList && promotions.length === 0 && <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Nothing here yet.</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {promotions.map((p) => (
          <div key={p.id} style={{ border: '1px solid var(--sec-border)', borderRadius: 14, padding: 14, background: 'var(--sec-bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <strong style={{ fontSize: 15 }}>{p.title}</strong>
              <PromotionStatusBadge status={p.status} />
            </div>
            <p style={{ fontSize: 11, marginTop: 6, color: 'var(--sec-text-muted)' }}>{p.promotionType}</p>
            <p style={{ fontSize: 11, marginTop: 2 }}>Target: {p.targetCity || 'National'}</p>
            <p style={{ fontSize: 11 }}>Views {p.boostImpressions + p.organicImpressions} · Clicks {p.totalClicks}</p>
            {p.eventId && <p style={{ fontSize: 11 }}>Event: {p.eventName || '—'}</p>}
            {p.boosted && listMode === 'live' ? (
              <p style={{ fontSize: 11, color: 'var(--sec-warning)', marginTop: 4 }}>Boosted until {p.boostExpiresAt ? new Date(p.boostExpiresAt).toLocaleString() : '—'}</p>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {listMode === 'past' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" className="sec-btn sec-btn-primary" onClick={() => onPublishOpen(p)}>
                    Republish
                  </button>
                  <button type="button" className="sec-btn sec-btn-ghost" onClick={() => onDelete(p.id)}>
                    Delete
                  </button>
                </div>
              ) : (
                <>
                  {p.status === 'DRAFT' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button type="button" className="sec-btn sec-btn-primary" onClick={() => onPublishOpen(p)}>
                        Pay to publish
                      </button>
                      <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onEditOpen(p)}>
                        Edit
                      </button>
                    </div>
                  )}
                  {p.status !== 'DRAFT' && p.status !== 'ENDED' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                      <button type="button" className="sec-btn sec-btn-secondary" disabled={p.boosted} onClick={() => onBoostPay(p)}>
                        {p.boosted ? 'Boosted' : 'Boost'}
                      </button>
                    </div>
                  )}
                  {p.status !== 'DRAFT' && p.status !== 'ENDED' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button type="button" className="sec-btn sec-btn-secondary" onClick={() => onEditOpen(p)}>
                        Edit
                      </button>
                      <button type="button" className="sec-btn sec-btn-ghost" onClick={() => onDelete(p.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                  {p.status === 'DRAFT' && (
                    <button type="button" className="sec-btn sec-btn-ghost sec-btn-full" onClick={() => onDelete(p.id)}>
                      Delete draft
                    </button>
                  )}
                  {p.promotionType === 'SPECIAL_OFFER' && (
                    <button
                      type="button"
                      className="sec-btn sec-btn-secondary sec-btn-full"
                      onClick={() => onAddToMenuSpecial?.(p)}
                    >
                      Add to menu special offers
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function BusinessPromotions() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [promotions, setPromotions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [publishModal, setPublishModal] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setUser(await authService.getCurrentUser());
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    dataService.User.filter({ created_by: user.email }).then((profiles) => {
      setUserProfile(profiles?.[0] || null);
    }).catch(() => {});
  }, [user?.email]);

  const { data: venues = [] } = useQuery({
    queryKey: ['promotions-venues', user?.id],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const selectedVenueRecord = useMemo(
    () => venues.find((venue) => String(venue.id) === String(selectedVenue)) || null,
    [venues, selectedVenue],
  );

  useEffect(() => {
    if (!Array.isArray(venues) || venues.length === 0) {
      setSelectedVenue('');
      return;
    }
    const currentExists = venues.some((venue) => String(venue.id) === String(selectedVenue));
    if (!currentExists) setSelectedVenue(String(venues[0].id));
  }, [venues, selectedVenue]);

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

  const handlePromotionPublished = useCallback(async () => {
    await loadPromotions(selectedVenue);
    queryClient.invalidateQueries({ queryKey: ['home-feed'] });
    queryClient.invalidateQueries({ queryKey: ['home-promotions-feed'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [selectedVenue, loadPromotions, queryClient]);

  const runBoostPayment = useCallback(
    async (promotion) => {
      if (!user?.email || !promotion?.id) {
        toast.error('Sign in to boost');
        return;
      }
      const daysStr = typeof window !== 'undefined' ? window.prompt('Boost days (1–30)', '7') : '7';
      if (daysStr === null) return;
      const days = Math.min(30, Math.max(1, parseInt(String(daysStr), 10) || 7));
      try {
        await checkoutPromotionBoostOnly({
          promotionId: promotion.id,
          days,
          email: user.email,
          onSuccess: async () => {
            await handlePromotionPublished();
          },
        });
      } catch (e) {
        toast.error(e?.data?.error || e.message || 'Boost failed');
      }
    },
    [user?.email, handlePromotionPublished],
  );

  const addSpecialOfferToMenu = useCallback(
    async (promotion) => {
      if (!selectedVenue) {
        toast.error('No venue selected.');
        return;
      }
      if (!promotion?.title) {
        toast.error('Promotion title is required.');
        return;
      }
      if (!promotion?.imageUrl) {
        toast.error('Add an image to this promotion first so the menu special can be visible.');
        return;
      }
      const expiryInput =
        typeof window !== 'undefined'
          ? window.prompt('Special offer expiry date/time (YYYY-MM-DD HH:mm)', '')
          : '';
      if (expiryInput == null) return;
      const normalized = String(expiryInput).trim().replace(' ', 'T');
      const expiryDate = normalized ? new Date(normalized) : null;
      if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
        toast.error('Enter a valid expiry date/time, e.g. 2026-05-30 23:00');
        return;
      }
      if (expiryDate.getTime() <= Date.now()) {
        toast.error('Expiry must be in the future.');
        return;
      }
      const priceInput = typeof window !== 'undefined' ? window.prompt('Special offer price (ZAR)', '99') : '99';
      if (priceInput == null) return;
      const price = Number(String(priceInput).replace(',', '.'));
      if (!Number.isFinite(price) || price <= 0) {
        toast.error('Enter a valid positive price.');
        return;
      }
      try {
        await apiPost(`/api/business/venues/${selectedVenue}/menu-items`, {
          name: promotion.title,
          category: 'Special Offers',
          sub_category: `${SPECIAL_OFFER_EXP_PREFIX}${expiryDate.toISOString()}`,
          price,
          image_url: promotion.imageUrl,
          is_available: true,
        });
        toast.success('Special offer added to menu');
      } catch (e) {
        toast.error(e?.data?.error || e.message || 'Could not add special offer to menu');
      }
    },
    [selectedVenue]
  );

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

  const livePromotions = useMemo(() => promotions.filter((p) => p.status !== 'ENDED'), [promotions]);
  const pastPromotions = useMemo(() => promotions.filter((p) => p.status === 'ENDED'), [promotions]);

  if (!user) return null;

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px 120px' }}>
      <header className="sec-page-header" style={{ marginBottom: 24 }}>
        <span className="sec-label">Business</span>
        <h1 className="sec-page-title">Promotions</h1>
        <p className="sec-page-subtitle">Premium placement for your venue, offers, and announcements — publish by the day and boost for the feed.</p>
      </header>
      <div style={{ marginBottom: 16 }}>
        {!userProfile?.payment_setup_complete ? (
          <div className="sec-card" style={{ padding: 12, marginBottom: 10, border: '1px solid var(--sec-border)' }}>
            <p style={{ fontSize: 13, color: 'var(--sec-text-primary)' }}>
              Payout setup missing. Add details in{' '}
              <a href={createPageUrl('Payments')} style={{ color: 'var(--sec-accent)', textDecoration: 'underline' }}>
                Settings &gt; Payment Methods
              </a>{' '}
              to avoid pending payouts.
            </p>
          </div>
        ) : null}
        <RefundPolicyNote />
      </div>

      <div className="sec-card" style={{ padding: 14, marginBottom: 20, border: '1px solid var(--sec-border)' }}>
        <Label>Venue</Label>
        {selectedVenueRecord ? (
          <div className="sec-input-rect" style={{ marginTop: 8, height: 44, width: '100%', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
            {selectedVenueRecord.name}
          </div>
        ) : (
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--sec-text-secondary)' }}>
            No venue found for this account yet. Create a venue first to publish promotions.
          </p>
        )}
      </div>

      <PromotionCreateForm selectedVenue={selectedVenue} events={events} userEmail={user?.email} onPublished={handlePromotionPublished} />

      <PublishRepublishModal
        open={!!publishModal}
        promotion={publishModal}
        userEmail={user?.email}
        onClose={() => setPublishModal(null)}
        onPaid={handlePromotionPublished}
      />

      <PromotionEditModal
        open={!!editingPromotion}
        promotion={editingPromotion}
        events={events}
        onClose={() => setEditingPromotion(null)}
        onSave={saveEditedPromotion}
      />

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <PromotionCardsList
          promotions={livePromotions}
          loadingList={loadingList}
          listMode="live"
          onPatch={patchPromotion}
          onDelete={deletePromotion}
          onEditOpen={(p) => setEditingPromotion(p)}
          onPublishOpen={(p) => setPublishModal(p)}
          onBoostPay={runBoostPayment}
          onAddToMenuSpecial={addSpecialOfferToMenu}
        />
        <PromotionCardsList
          promotions={pastPromotions}
          loadingList={loadingList}
          listMode="past"
          onPatch={patchPromotion}
          onDelete={deletePromotion}
          onEditOpen={(p) => setEditingPromotion(p)}
          onPublishOpen={(p) => setPublishModal(p)}
          onBoostPay={runBoostPayment}
          onAddToMenuSpecial={addSpecialOfferToMenu}
        />
      </div>
    </div>
  );
}
