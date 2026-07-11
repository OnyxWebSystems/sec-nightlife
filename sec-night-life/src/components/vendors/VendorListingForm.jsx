import React, { useRef, useState } from 'react';
import { Camera, X, ImagePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { integrations } from '@/services/integrationService';
import { VENDOR_CATEGORIES } from '@/lib/vendorCategories';

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--sec-text-muted)',
  marginBottom: 8,
  display: 'block',
};

const inputStyle = {
  height: 44,
  backgroundColor: 'var(--sec-bg-elevated)',
  border: '1px solid var(--sec-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--sec-text-primary)',
  fontSize: 16,
};

/**
 * Compact vendor listing form shared by onboarding + settings.
 * value: { name, category, description, images: string[] }
 */
export default function VendorListingForm({ value, onChange, cityHint }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const images = value.images || [];

  const setField = (patch) => onChange({ ...value, ...patch });

  const onPickImages = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = Math.max(0, 4 - images.length);
    if (remaining === 0) {
      setError('You can upload up to 4 photos.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const next = [...images];
      for (const file of files.slice(0, remaining)) {
        const { file_url } = await integrations.Core.UploadFile({ file });
        if (file_url) next.push(file_url);
      }
      setField({ images: next });
    } catch (err) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx) => {
    setField({ images: images.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      {cityHint ? (
        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', margin: 0 }}>
          Listing city defaults to {cityHint}
        </p>
      ) : null}

      <div>
        <div style={labelStyle}>Business name</div>
        <Input
          value={value.name || ''}
          onChange={(e) => setField({ name: e.target.value })}
          placeholder="e.g. Chip n Dip Co."
          style={inputStyle}
        />
      </div>

      <div>
        <div style={labelStyle}>Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {VENDOR_CATEGORIES.map((cat) => {
            const active = value.category === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => setField({ category: cat.value })}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
                  backgroundColor: active ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                  color: active ? 'var(--sec-text-primary)' : 'var(--sec-text-secondary)',
                  fontSize: 13,
                  fontWeight: 560,
                  cursor: 'pointer',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={labelStyle}>Short description</div>
        <Textarea
          value={value.description || ''}
          onChange={(e) => setField({ description: e.target.value })}
          placeholder="What do you offer for venues and events?"
          rows={3}
          style={{
            ...inputStyle,
            height: 'auto',
            padding: '12px 14px',
            resize: 'none',
          }}
        />
      </div>

      <div>
        <div style={labelStyle}>Photos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {images.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              style={{
                position: 'relative',
                aspectRatio: '1',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--sec-border)',
              }}
            >
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {images.length < 4 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                aspectRatio: '1',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--sec-border-strong)',
                backgroundColor: 'var(--sec-bg-elevated)',
                color: 'var(--sec-text-muted)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                cursor: uploading ? 'wait' : 'pointer',
                fontSize: 11,
              }}
            >
              {uploading ? <Camera size={18} /> : <ImagePlus size={18} />}
              {uploading ? 'Uploading' : 'Add'}
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={onPickImages}
        />
        {error ? (
          <p style={{ fontSize: 12, color: 'var(--sec-error)', marginTop: 8 }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function isVendorListingValid(value) {
  return Boolean(
    value?.name?.trim() &&
      value?.category &&
      (value?.description || '').trim().length > 0
  );
}
