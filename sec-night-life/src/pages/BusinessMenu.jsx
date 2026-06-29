import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet, apiPatch, apiDelete, uploadFile } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';
import MenuCatalogBrowser from '@/components/menu/MenuCatalogBrowser';
import VenueMenuNavigator from '@/components/menu/VenueMenuNavigator';
import { formatMenuCategoryLabel } from '@/lib/groupMenuByCategory';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import { useStaffVenueOptional } from '@/context/StaffVenueContext';
import { menuApiBase } from '@/lib/staffVenueApi';

export default function BusinessMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editingCategoryItem, setEditingCategoryItem] = useState(null);
  const [priceEdit, setPriceEdit] = useState('');
  const [categoryEdit, setCategoryEdit] = useState('');
  const [subCategoryEdit, setSubCategoryEdit] = useState('');
  const [photoTargetId, setPhotoTargetId] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.loadUserOrLogin();
        setUser(u);
      } catch {
        // loadUserOrLogin redirects when no session remains
      }
    })();
  }, []);

  const { activeVenue, isLoading: venuesLoading } = useActiveVenue();
  const staffVenueCtx = useStaffVenueOptional();
  const venueScope = useBusinessVenueScope();
  const venueId = venueScope.inStaffSession ? null : activeVenue?.id;
  const hasVenueScope = venueScope.inStaffSession || !!activeVenue?.id;
  const scopeKey = venueScope.staffContextToken || venueId;
  const menuBase = menuApiBase({
    inStaffSession: venueScope.inStaffSession,
    staffContextToken: venueScope.staffContextToken,
    venueId,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['venue-menu', scopeKey],
    queryFn: () => apiGet(`${menuBase}/menu-items`),
    enabled: !!menuBase,
  });

  const needsPhotoCount = useMemo(() => items.filter((i) => i.needs_photo).length, [items]);

  const addedCatalogIds = useMemo(
    () => new Set(items.map((i) => i.catalog_item_id).filter(Boolean)),
    [items]
  );

  const venueLogoUrl = venueScope.inStaffSession
    ? staffVenueCtx?.staffVenueMeta?.venueLogoUrl
    : activeVenue?.logo_url || activeVenue?.logoUrl;

  const photoCrop = useImageCropUpload({
    onCropped: async (file) => {
      if (!menuBase || !photoTargetId) return;
      setUploading(true);
      try {
        const r = await uploadFile(file);
        if (!r?.file_url) throw new Error('Upload failed');
        await apiPatch(`${menuBase}/menu-items/${photoTargetId}`, {
          image_url: r.file_url,
        });
        queryClient.invalidateQueries({ queryKey: ['venue-menu', scopeKey] });
        toast.success('Photo updated — item is visible to guests');
        setPhotoTargetId(null);
      } catch (e) {
        toast.error(e?.message || 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
  });

  const invalidateMenu = () => queryClient.invalidateQueries({ queryKey: ['venue-menu', scopeKey] });

  const toggleAvailable = async (item) => {
    const needsPhoto = Boolean(item.needs_photo);
    const isListed = Boolean(item.is_available);
    const nextVisible = !isListed;
    if (nextVisible && needsPhoto) {
      toast.error('Upload your own photo before showing this item to guests');
      return;
    }
    try {
      const updated = await apiPatch(`${menuBase}/menu-items/${item.id}`, {
        is_available: nextVisible,
      });
      await invalidateMenu();
      if (!nextVisible) {
        toast.success('Item hidden from guests');
      } else if (updated?.guest_visible) {
        toast.success('Item is live on your guest menu');
      } else {
        toast.message('Item is shown in Menu Maker', {
          description: updated?.is_expired
            ? 'Special offer expired — update pricing to go live for guests.'
            : 'Upload your photo or fix listing details to appear on guest menus.',
        });
      }
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Update failed');
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm('Remove this menu item?')) return;
    try {
      await apiDelete(`${menuBase}/menu-items/${id}`);
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
      await apiPatch(`${menuBase}/menu-items/${item.id}`, { price });
      setEditingItem(null);
      invalidateMenu();
      toast.success('Price updated');
    } catch (e) {
      toast.error(e?.message || 'Update failed');
    }
  };

  const saveCategory = async (item) => {
    const category = categoryEdit.trim();
    if (!category) return toast.error('Category name is required');
    try {
      await apiPatch(`${menuBase}/menu-items/${item.id}`, {
        category,
        sub_category: subCategoryEdit.trim() || null,
      });
      setEditingCategoryItem(null);
      invalidateMenu();
      toast.success('Category updated');
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Update failed');
    }
  };

  if (!user) return null;

  if (venuesLoading && !venueScope.inStaffSession) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!hasVenueScope) {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Menu Maker</h1>
        <p style={{ color: 'var(--sec-text-muted)' }}>
          {venueScope.inStaffSession
            ? 'Staff venue context is missing or expired.'
            : 'Register your venue first to build a menu.'}
        </p>
        {venueScope.inStaffSession ? (
          <button
            type="button"
            className="sec-btn sec-btn-primary mt-3"
            onClick={() => navigate(createPageUrl('StaffDashboard'))}
          >
            Go to Staff Dashboard
          </button>
        ) : (
          <button type="button" className="sec-btn sec-btn-primary mt-3" onClick={() => navigate(createPageUrl('VenueOnboarding'))}>
            Set up venue
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageBackHeader
        title="Menu Maker"
        subtitle={venueScope.inStaffSession ? venueScope.venueName : 'Photos, prices, and categories'}
        pageName="BusinessMenu"
      />
      <div style={{ padding: '16px 20px 24px' }}>
      <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 16 }}>
        Manage what guests see. Add items with your own photos, prices, and categories.
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
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Add items</h2>
        <MenuCatalogBrowser
          mode="live"
          menuApiBase={menuBase}
          addedCatalogIds={addedCatalogIds}
          onVenueMenuUpdated={invalidateMenu}
        />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Your menu</h2>
      {itemsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>No items yet — add from Menu Maker above.</p>
      ) : (
        <>
          <VenueMenuNavigator
            items={items}
            mode="manage"
            venueLogoUrl={venueLogoUrl}
            renderManageActions={(item) => {
              const needsPhoto = Boolean(item.needs_photo);
              const isListed = Boolean(item.is_available);
              const guestVisible = Boolean(item.guest_visible);
              const statusLabel = guestVisible
                ? 'Live'
                : needsPhoto
                  ? 'Needs photo'
                  : !isListed
                    ? 'Off'
                    : item.is_expired
                      ? 'Expired offer'
                      : 'Hidden';
              const statusColor = guestVisible ? 'var(--sec-accent)' : '#f59e0b';
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: statusColor }}>{statusLabel}</span>
                  <button
                    type="button"
                    className="sec-btn sec-btn-ghost text-xs h-7"
                    onClick={() => {
                      setPhotoTargetId(item.id);
                      document.getElementById(`menu-photo-${item.id}`)?.click();
                    }}
                  >
                    <Pencil size={12} className="inline mr-1" />
                    Photo
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
                  {editingItem?.id === item.id ? (
                    <div className="flex gap-1 flex-wrap">
                      <input
                        type="number"
                        min={1}
                        className="sec-input-rect h-7 w-16 text-xs"
                        value={priceEdit}
                        onChange={(e) => setPriceEdit(e.target.value)}
                      />
                      <button type="button" className="sec-btn sec-btn-primary text-xs h-7 px-2" onClick={() => savePrice(item)}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="sec-btn sec-btn-ghost text-xs h-7"
                      onClick={() => {
                        setEditingItem(item);
                        setPriceEdit(String(item.price));
                        setEditingCategoryItem(null);
                      }}
                    >
                      R{Number(item.price).toFixed(0)}
                    </button>
                  )}
                  {editingCategoryItem?.id === item.id ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        className="sec-input-rect h-7 w-full text-xs"
                        placeholder="Category"
                        value={categoryEdit}
                        onChange={(e) => setCategoryEdit(e.target.value)}
                      />
                      <input
                        type="text"
                        className="sec-input-rect h-7 w-full text-xs"
                        placeholder="Sub-category"
                        value={subCategoryEdit}
                        onChange={(e) => setSubCategoryEdit(e.target.value)}
                      />
                      <button type="button" className="sec-btn sec-btn-primary text-xs h-7 w-full" onClick={() => saveCategory(item)}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="sec-btn sec-btn-ghost sec-btn--wrap text-xs h-7 max-w-full truncate"
                      title={formatMenuCategoryLabel(item)}
                      onClick={() => {
                        setEditingCategoryItem(item);
                        setCategoryEdit(item.category || '');
                        setSubCategoryEdit(item.sub_category || '');
                        setEditingItem(null);
                      }}
                    >
                      {item.sub_category || item.category || 'Category'}
                    </button>
                  )}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="sec-btn sec-btn-ghost text-xs h-7 flex-1"
                      disabled={needsPhoto}
                      onClick={() => toggleAvailable(item)}
                    >
                      {isListed ? 'Hide' : 'Show'}
                    </button>
                    <button type="button" className="sec-btn sec-btn-ghost h-7 px-2" onClick={() => removeItem(item.id)} aria-label="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </>
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
    </div>
  );
}
