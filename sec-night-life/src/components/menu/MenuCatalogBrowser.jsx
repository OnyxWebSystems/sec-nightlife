import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, ChevronDown, ChevronUp, Camera, UtensilsCrossed } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useMenuCatalogSearch, useMenuCatalogSubcategories } from '@/hooks/useMenuCatalog';
import { apiPost, uploadFile } from '@/api/client';
import { toast } from 'sonner';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';

const TOP_TABS = ['Drinks', 'Food', 'Hubbly', 'Other'];

const MENU_MAKER_DISCLAIMER =
  'Common items listed by venues for onboarding efficiency only. SEC does not sell, stock, or supply any listed products. You are responsible for accurate names, prices, photos, and what you serve.';

function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function MenuMakerCard({ item, onAdd, added }) {
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{
        borderColor: added ? 'var(--sec-accent-border)' : 'var(--sec-border)',
        backgroundColor: 'var(--sec-bg-card)',
        opacity: added ? 0.65 : 1,
      }}
    >
      <div className="w-full h-14 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--sec-bg-hover)' }}>
        <UtensilsCrossed className="w-5 h-5 opacity-35" style={{ color: 'var(--sec-text-muted)' }} aria-hidden />
      </div>
      <div className="min-h-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--sec-text-primary)' }}>
          {item.name}
        </p>
        {item.sub_category && (
          <p className="text-xs truncate" style={{ color: 'var(--sec-text-muted)' }}>
            {item.sub_category}
          </p>
        )}
        <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
          Suggested R{Number(item.default_price_zar).toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        disabled={added}
        onClick={() => onAdd(item)}
        className="w-full h-9 rounded-lg text-xs font-semibold disabled:opacity-50"
        style={{ backgroundColor: added ? 'var(--sec-bg-hover)' : 'var(--sec-accent)', color: added ? 'var(--sec-text-muted)' : '#000' }}
      >
        {added ? 'Added' : 'Add'}
      </button>
    </div>
  );
}

/**
 * @param {object} props
 * @param {'live'|'draft'} props.mode
 * @param {string} [props.venueId]
 * @param {Set<string>} props.addedCatalogIds
 * @param {() => void} [props.onVenueMenuUpdated]
 * @param {(item: object) => void} [props.onAddToDraft]
 */
export default function MenuCatalogBrowser({
  mode = 'live',
  venueId,
  addedCatalogIds = new Set(),
  onVenueMenuUpdated,
  onAddToDraft,
}) {
  const [search, setSearch] = useState('');
  const [topCategory, setTopCategory] = useState('Drinks');
  const [subCategory, setSubCategory] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  const [pendingCategory, setPendingCategory] = useState('');
  const [pendingSubCategory, setPendingSubCategory] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [custom, setCustom] = useState({ name: '', price: '', category: 'Drinks', sub_category: '', image_url: '' });
  const [uploading, setUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState('');
  const photoTargetRef = useRef('custom');

  const debouncedSearch = useDebounced(search.trim());

  const { data: subData } = useMenuCatalogSubcategories(topCategory, topCategory === 'Drinks');
  const { data, isLoading } = useMenuCatalogSearch({
    q: debouncedSearch,
    topCategory,
    subCategory: topCategory === 'Drinks' && !debouncedSearch ? subCategory : '',
    enabled: true,
  });

  const items = data?.items || [];

  const groupedDrinks = useMemo(() => {
    if (topCategory !== 'Drinks' || subCategory || debouncedSearch) return null;
    const map = new Map();
    for (const item of items) {
      const key = item.sub_category || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  }, [items, topCategory, subCategory, debouncedSearch]);

  const crop = useImageCropUpload({
    onCropped: async (file) => {
      setUploading(true);
      try {
        const r = await uploadFile(file);
        if (!r?.file_url) return;
        if (photoTargetRef.current === 'pending') {
          setPendingPhotoUrl(r.file_url);
        } else {
          setCustom((c) => ({ ...c, image_url: r.file_url }));
        }
      } finally {
        setUploading(false);
      }
    },
  });

  const openAddSheet = (item) => {
    setPendingItem(item);
    setPendingPhotoUrl('');
    setPendingCategory(item.top_category || 'Other');
    setPendingSubCategory(item.sub_category || '');
    setPriceInput(String(item.default_price_zar > 0 ? item.default_price_zar : ''));
  };

  const confirmAdd = async () => {
    if (!pendingItem) return;
    const price = parseFloat(String(priceInput).replace(',', '.'));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    if (!pendingPhotoUrl) {
      toast.error('Upload your own photo of this item');
      return;
    }
    const category = pendingCategory.trim();
    if (!category) {
      toast.error('Enter a category name');
      return;
    }

    const payload = {
      catalog_item_id: pendingItem.id,
      name: pendingItem.name,
      price,
      category,
      sub_category: pendingSubCategory.trim() || null,
      image_url: pendingPhotoUrl,
    };

    if (mode === 'draft' && onAddToDraft) {
      onAddToDraft(payload);
      setPendingItem(null);
      setPendingPhotoUrl('');
      toast.success('Added to your menu draft');
      return;
    }

    if (!venueId) return;
    try {
      await apiPost(`/api/business/venues/${venueId}/menu-items/from-catalog`, {
        items: [{
          catalog_item_id: pendingItem.id,
          price,
          image_url: pendingPhotoUrl,
          category,
          sub_category: pendingSubCategory.trim() || null,
        }],
      });
      setPendingItem(null);
      setPendingPhotoUrl('');
      onVenueMenuUpdated?.();
      toast.success('Added to menu');
    } catch (e) {
      if (e?.data?.skipped_catalog_ids?.length) {
        toast.info('Already on your menu');
        setPendingItem(null);
        setPendingPhotoUrl('');
        onVenueMenuUpdated?.();
      } else {
        toast.error(e?.data?.error || e.message || 'Failed to add');
      }
    }
  };

  const addCustom = async () => {
    const name = custom.name.trim();
    const price = parseFloat(String(custom.price).replace(',', '.'));
    const category = custom.category.trim() || topCategory;
    if (!name) return toast.error('Name is required');
    if (!Number.isFinite(price) || price <= 0) return toast.error('Enter a valid price');
    if (!custom.image_url) return toast.error('Upload your own photo of this item');

    if (mode === 'draft' && onAddToDraft) {
      onAddToDraft({
        name,
        price,
        category,
        sub_category: custom.sub_category?.trim() || null,
        image_url: custom.image_url || null,
      });
      setCustom({ name: '', price: '', category: topCategory, sub_category: '', image_url: '' });
      toast.success('Custom item added to draft');
      return;
    }

    if (!venueId) return;
    try {
      await apiPost(`/api/business/venues/${venueId}/menu-items`, {
        items: [{
          name,
          price,
          category,
          sub_category: custom.sub_category?.trim() || null,
          image_url: custom.image_url || null,
        }],
      });
      setCustom({ name: '', price: '', category: topCategory, sub_category: '', image_url: '' });
      onVenueMenuUpdated?.();
      toast.success('Custom item added');
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Failed to add');
    }
  };

  useEffect(() => {
    setSubCategory('');
  }, [topCategory]);

  useEffect(() => {
    if (customOpen && !custom.category) {
      setCustom((c) => ({ ...c, category: topCategory }));
    }
  }, [topCategory, customOpen, custom.category]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
        <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Menu Maker</h2>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--sec-text-muted)' }}>
          {MENU_MAKER_DISCLAIMER}{' '}
          <Link to={createPageUrl('VenueComplianceCharter')} className="underline" style={{ color: 'var(--sec-accent)' }}>
            Venue Compliance Charter
          </Link>
        </p>
        <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: 'var(--sec-text-primary)' }}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
          />
          I understand SEC does not supply these products and I am responsible for my menu listings.
        </label>
      </div>

      {!termsAccepted ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--sec-text-muted)' }}>
          Accept the notice above to use Menu Maker.
        </p>
      ) : (
      <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sec-text-muted)' }} />
        <input
          type="search"
          placeholder="Search common items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-3 rounded-xl border text-sm"
          style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TOP_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTopCategory(tab)}
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: topCategory === tab ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
              border: `1px solid ${topCategory === tab ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
              color: topCategory === tab ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {topCategory === 'Drinks' && !debouncedSearch && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            type="button"
            onClick={() => setSubCategory('')}
            className="px-3 py-1 rounded-full text-xs whitespace-nowrap shrink-0"
            style={{
              backgroundColor: !subCategory ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
              color: !subCategory ? '#000' : 'var(--sec-text-muted)',
              border: '1px solid var(--sec-border)',
            }}
          >
            All
          </button>
          {(subData?.subcategories || []).map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSubCategory(s.name)}
              className="px-3 py-1 rounded-full text-xs whitespace-nowrap shrink-0"
              style={{
                backgroundColor: subCategory === s.name ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
                color: subCategory === s.name ? '#000' : 'var(--sec-text-muted)',
                border: '1px solid var(--sec-border)',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--sec-text-muted)' }}>Loading Menu Maker…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--sec-text-muted)' }}>
          No items found. Add a custom item below.
        </p>
      ) : groupedDrinks ? (
        <div className="space-y-6 max-h-[420px] overflow-y-auto pr-1">
          {[...groupedDrinks.entries()].map(([section, sectionItems]) => (
            <div key={section}>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--sec-text-muted)' }}>
                {section}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {sectionItems.map((item) => (
                  <MenuMakerCard
                    key={item.id}
                    item={item}
                    added={addedCatalogIds.has(item.id)}
                    onAdd={openAddSheet}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {items.map((item) => (
            <MenuMakerCard
              key={item.id}
              item={item}
              added={addedCatalogIds.has(item.id)}
              onAdd={openAddSheet}
            />
          ))}
        </div>
      )}

      <div className="border-t pt-4" style={{ borderColor: 'var(--sec-border)' }}>
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium w-full"
          style={{ color: 'var(--sec-text-primary)' }}
          onClick={() => setCustomOpen((o) => !o)}
        >
          {customOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Can&apos;t find it? Add custom item
        </button>
        {customOpen && (
          <div className="mt-3 space-y-2 rounded-xl p-3" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
            <input
              className="w-full h-10 px-3 rounded-lg text-sm border"
              placeholder="Item name"
              value={custom.name}
              onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))}
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <input
              className="w-full h-10 px-3 rounded-lg text-sm border"
              placeholder="Price (ZAR)"
              type="number"
              value={custom.price}
              onChange={(e) => setCustom((c) => ({ ...c, price: e.target.value }))}
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <input
              className="w-full h-10 px-3 rounded-lg text-sm border"
              placeholder={`Category (e.g. ${topCategory}, Cocktails, Starters)`}
              value={custom.category}
              onChange={(e) => setCustom((c) => ({ ...c, category: e.target.value }))}
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <input
              className="w-full h-10 px-3 rounded-lg text-sm border"
              placeholder="Sub-category (optional, e.g. Premium, Sharing)"
              value={custom.sub_category}
              onChange={(e) => setCustom((c) => ({ ...c, sub_category: e.target.value }))}
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <label className="text-xs block" style={{ color: 'var(--sec-text-muted)' }}>
              Your photo (required)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                photoTargetRef.current = 'custom';
                crop.handleInputChange(e);
              }}
              disabled={uploading || !termsAccepted}
              className="text-xs w-full"
            />
            {custom.image_url && (
              <img src={custom.image_url} alt="" className="w-14 h-14 rounded object-cover" />
            )}
            <button
              type="button"
              onClick={addCustom}
              className="w-full h-10 rounded-lg text-sm font-semibold flex items-center justify-center gap-1"
              style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
            >
              <Plus size={14} /> Add custom item
            </button>
          </div>
        )}
      </div>
      </>
      )}

      {pendingItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPendingItem(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-1" style={{ color: 'var(--sec-text-primary)' }}>{pendingItem.name}</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--sec-text-muted)' }}>
              Set your venue price (suggested R{Number(pendingItem.default_price_zar).toLocaleString()})
            </p>
            <input
              type="number"
              min={1}
              className="w-full h-11 px-3 rounded-xl border mb-3"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <label className="text-xs block mb-1" style={{ color: 'var(--sec-text-muted)' }}>
              Category name
            </label>
            <input
              type="text"
              maxLength={60}
              className="w-full h-10 px-3 rounded-xl border mb-2 text-sm"
              value={pendingCategory}
              onChange={(e) => setPendingCategory(e.target.value)}
              placeholder="e.g. Drinks, Food, Cocktails"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <label className="text-xs block mb-1" style={{ color: 'var(--sec-text-muted)' }}>
              Sub-category (optional)
            </label>
            <input
              type="text"
              maxLength={80}
              className="w-full h-10 px-3 rounded-xl border mb-3 text-sm"
              value={pendingSubCategory}
              onChange={(e) => setPendingSubCategory(e.target.value)}
              placeholder="e.g. Beer, Starters"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)', color: 'var(--sec-text-primary)' }}
            />
            <p className="text-xs mb-2" style={{ color: 'var(--sec-text-muted)' }}>
              Upload your own photo (required — guests only see items with your photo)
            </p>
            <input
              type="file"
              accept="image/*"
              className="text-xs w-full mb-2"
              disabled={uploading}
              onChange={(e) => {
                photoTargetRef.current = 'pending';
                crop.handleInputChange(e);
              }}
            />
            {pendingPhotoUrl ? (
              <img src={pendingPhotoUrl} alt="" className="w-16 h-16 rounded object-cover mb-3" />
            ) : (
              <div className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--sec-text-muted)' }}>
                <Camera size={14} /> No photo yet
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 h-11 rounded-xl border"
                onClick={() => {
                  setPendingItem(null);
                  setPendingPhotoUrl('');
                  setPendingCategory('');
                  setPendingSubCategory('');
                }}
                style={{ borderColor: 'var(--sec-border)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 h-11 rounded-xl font-semibold disabled:opacity-50"
                disabled={!pendingPhotoUrl}
                onClick={confirmAdd}
                style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
              >
                Add to menu
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageCropDialog
        open={crop.cropOpen}
        onOpenChange={crop.onCropOpenChange}
        imageSrc={crop.cropSrc}
        onCropped={crop.handleCropped}
        aspect={1}
        title="Crop item photo"
        outputFileName="menu-custom.jpg"
      />
    </div>
  );
}
