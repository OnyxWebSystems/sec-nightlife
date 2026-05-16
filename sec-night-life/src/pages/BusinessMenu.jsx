import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPatch, apiDelete, uploadFile } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';
import MenuCatalogBrowser from '@/components/menu/MenuCatalogBrowser';

function isVenuePhoto(url) {
  return url && typeof url === 'string' && url.startsWith('http') && !url.includes('/menu-catalog/');
}

export default function BusinessMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [priceEdit, setPriceEdit] = useState('');
  const [photoTargetId, setPhotoTargetId] = useState(null);
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

  const needsPhotoCount = useMemo(
    () => items.filter((i) => !isVenuePhoto(i.image_url)).length,
    [items]
  );

  const addedCatalogIds = useMemo(
    () => new Set(items.map((i) => i.catalog_item_id).filter(Boolean)),
    [items]
  );

  const photoCrop = useImageCropUpload({
    onCropped: async (file) => {
      if (!venueId || !photoTargetId) return;
      setUploading(true);
      try {
        const r = await uploadFile(file);
        if (!r?.file_url) throw new Error('Upload failed');
        await apiPatch(`/api/business/venues/${venueId}/menu-items/${photoTargetId}`, {
          image_url: r.file_url,
        });
        queryClient.invalidateQueries({ queryKey: ['venue-menu', venueId] });
        toast.success('Photo updated — item is visible to guests');
        setPhotoTargetId(null);
      } catch (e) {
        toast.error(e?.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
  });

  const invalidateMenu = () => queryClient.invalidateQueries({ queryKey: ['venue-menu', venueId] });

  const toggleAvailable = async (item) => {
    if (!isVenuePhoto(item.image_url)) {
      toast.error('Upload your own photo before showing this item to guests');
      return;
    }
    try {
      await apiPatch(`/api/business/venues/${venueId}/menu-items/${item.id}`, {
        is_available: !item.is_available,
      });
      invalidateMenu();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Update failed');
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm('Remove this menu item?')) return;
    try {
      await apiDelete(`/api/business/venues/${venueId}/menu-items/${id}`);
      invalidateMenu();
      toast.success('Removed');
    } catch (e) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  const savePrice = async (item) => {
    const price = parseFloat(String(priceEdit).replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) return toast.error('Enter a valid price');
    try {
      await apiPatch(`/api/business/venues/${venueId}/menu-items/${item.id}`, { price });
      setEditingItem(null);
      invalidateMenu();
      toast.success('Price updated');
    } catch (e) {
      toast.error(e?.message || 'Update failed');
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
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Venue menu</h1>
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 16 }}>
        You control what guests see. Upload your own photos of what you actually serve.
      </p>

      {needsPhotoCount > 0 && (
        <div
          className="sec-card flex gap-3 items-start mb-5"
          style={{ padding: 14, borderColor: 'rgba(245, 158, 11, 0.4)' }}
        >
          <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--sec-text-primary)', margin: 0 }}>
            {needsPhotoCount} item{needsPhotoCount === 1 ? '' : 's'} need your photo before guests can order them.
            SEC does not provide product images — upload photos of what your venue serves.
          </p>
        </div>
      )}

      <div className="sec-card" style={{ padding: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Menu Maker</h2>
        <MenuCatalogBrowser
          mode="live"
          venueId={venueId}
          addedCatalogIds={addedCatalogIds}
          onVenueMenuUpdated={invalidateMenu}
        />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Your menu</h2>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>No items yet — add from Menu Maker above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => {
            const hasPhoto = isVenuePhoto(item.image_url);
            const published = hasPhoto && item.is_available;
            return (
              <div key={item.id} className="sec-card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  type="button"
                  className="relative shrink-0"
                  onClick={() => {
                    setPhotoTargetId(item.id);
                    document.getElementById(`menu-photo-${item.id}`)?.click();
                  }}
                  title={hasPhoto ? 'Change photo' : 'Upload photo (required)'}
                >
                  {hasPhoto ? (
                    <img src={item.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: 'var(--sec-bg-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color: 'var(--sec-text-muted)',
                        textAlign: 'center',
                        padding: 4,
                      }}
                    >
                      Add photo
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 bg-black/60 rounded p-0.5">
                    <Pencil size={10} className="text-white" />
                  </span>
                </button>
                <input
                  id={`menu-photo-${item.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    setPhotoTargetId(item.id);
                    photoCrop.handleInputChange(e);
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                    {published ? (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}>
                        Live for guests
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        {hasPhoto ? 'Hidden' : 'Needs photo'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>
                    {item.category}
                    {item.sub_category ? ` · ${item.sub_category}` : ''}
                  </div>
                  {editingItem?.id === item.id ? (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="number"
                        min={1}
                        className="sec-input-rect h-8 w-24 text-sm"
                        value={priceEdit}
                        onChange={(e) => setPriceEdit(e.target.value)}
                      />
                      <button type="button" className="sec-btn sec-btn-primary text-xs h-8" onClick={() => savePrice(item)}>
                        Save
                      </button>
                      <button type="button" className="sec-btn sec-btn-ghost text-xs h-8" onClick={() => setEditingItem(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-sm mt-1 font-semibold"
                      style={{ color: 'var(--sec-accent)' }}
                      onClick={() => {
                        setEditingItem(item);
                        setPriceEdit(String(item.price));
                      }}
                    >
                      R{Number(item.price).toFixed(0)} — edit price
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="sec-btn sec-btn-ghost text-xs"
                  disabled={!hasPhoto}
                  onClick={() => toggleAvailable(item)}
                  title={!hasPhoto ? 'Upload a photo first' : undefined}
                >
                  {item.is_available && hasPhoto ? 'Hide' : 'Show'}
                </button>
                <button type="button" className="sec-btn sec-btn-ghost" onClick={() => removeItem(item.id)} aria-label="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ImageCropDialog
        open={photoCrop.cropOpen}
        onOpenChange={photoCrop.onCropOpenChange}
        imageSrc={photoCrop.cropSrc}
        onCropped={photoCrop.handleCropped}
        aspect={1}
        cropShape="rect"
        title="Your menu item photo"
        outputFileName="menu-item.jpg"
      />
    </div>
  );
}
