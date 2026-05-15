import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost, apiPatch, apiDelete, uploadFile } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';

const EMPTY_ITEM = { name: '', price: '', category: 'Drinks', image_url: '' };

export default function BusinessMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [draft, setDraft] = useState({ ...EMPTY_ITEM });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
        const venues = await dataService.Venue.mine();
        if (venues?.[0]?.id) setVenueId(venues[0].id);
      } catch {
        authService.redirectToLogin();
      }
    })();
  }, []);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['venue-menu', venueId],
    queryFn: () => apiGet(`/api/business/venues/${venueId}/menu-items`),
    enabled: !!venueId,
  });

  const crop = useImageCropUpload({
    onCropped: async (file) => {
      setUploading(true);
      try {
        const r = await uploadFile(file);
        if (r?.file_url) setDraft((d) => ({ ...d, image_url: r.file_url }));
        else toast.error('Upload failed');
      } catch (e) {
        toast.error(e?.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
  });

  const addItem = async () => {
    if (!venueId) return;
    const name = draft.name.trim();
    const price = parseFloat(String(draft.price).replace(',', '.'));
    if (!name) return toast.error('Name is required');
    if (!Number.isFinite(price) || price <= 0) return toast.error('Enter a valid price');
    try {
      await apiPost(`/api/business/venues/${venueId}/menu-items`, {
        items: [{
          name,
          price,
          category: draft.category || 'Other',
          image_url: draft.image_url || null,
        }],
      });
      setDraft({ ...EMPTY_ITEM });
      queryClient.invalidateQueries({ queryKey: ['venue-menu', venueId] });
      toast.success('Item added');
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to add item');
    }
  };

  const toggleAvailable = async (item) => {
    try {
      await apiPatch(`/api/business/venues/${venueId}/menu-items/${item.id}`, {
        is_available: !item.is_available,
      });
      queryClient.invalidateQueries({ queryKey: ['venue-menu', venueId] });
    } catch (e) {
      toast.error(e?.message || 'Update failed');
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm('Remove this menu item?')) return;
    try {
      await apiDelete(`/api/business/venues/${venueId}/menu-items/${id}`);
      queryClient.invalidateQueries({ queryKey: ['venue-menu', venueId] });
      toast.success('Removed');
    } catch (e) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  if (!user) return null;

  if (!venueId) {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: 'var(--sec-text-muted)' }}>Complete venue onboarding first.</p>
        <button type="button" className="sec-btn sec-btn-primary mt-3" onClick={() => navigate(createPageUrl('VenueOnboarding'))}>
          Set up venue
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Venue menu</h1>
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 20 }}>
        Items appear when hosts build tables and when guests add to their order.
      </p>

      <div className="sec-card" style={{ padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Add item</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            className="sec-input-rect"
            placeholder="Name (e.g. Hennessy VSOP)"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              className="sec-input-rect"
              placeholder="Price (ZAR)"
              type="number"
              min={1}
              value={draft.price}
              onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
            />
            <select
              className="sec-input-rect"
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            >
              {['Drinks', 'Food', 'Hubbly', 'Packages', 'Other'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--sec-text-muted)]">Photo</label>
            <input type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={crop.handleInputChange} disabled={uploading} />
            {draft.image_url ? (
              <img src={draft.image_url} alt="" style={{ marginTop: 8, width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
            ) : null}
          </div>
          <button type="button" className="sec-btn sec-btn-primary" onClick={addItem} disabled={uploading}>
            <Plus size={16} style={{ marginRight: 6 }} /> Add to menu
          </button>
        </div>
      </div>

      <ImageCropDialog
        open={crop.cropOpen}
        onOpenChange={crop.onCropOpenChange}
        imageSrc={crop.cropSrc}
        onCropped={crop.handleCropped}
        aspect={1}
        cropShape="rect"
        title="Adjust menu item photo"
        outputFileName="menu-item.jpg"
      />

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>No menu items yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} className="sec-card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--sec-bg-hover)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                  {item.category} · R{Number(item.price).toFixed(0)}
                  {!item.is_available ? ' · Hidden' : ''}
                </div>
              </div>
              <button type="button" className="sec-btn sec-btn-ghost text-xs" onClick={() => toggleAvailable(item)}>
                {item.is_available ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="sec-btn sec-btn-ghost" onClick={() => removeItem(item.id)} aria-label="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
