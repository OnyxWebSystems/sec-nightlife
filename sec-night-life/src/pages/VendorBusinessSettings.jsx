import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/api/client';
import PageBackHeader from '@/components/layout/PageBackHeader';
import VendorListingForm, { isVendorListingValid } from '@/components/vendors/VendorListingForm';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { vendorCategoryLabel } from '@/lib/vendorCategories';
import { Plus } from 'lucide-react';

const EMPTY_DRAFT = {
  name: '',
  category: '',
  description: '',
  website: '',
  images: [],
  is_published: true,
};

export default function VendorBusinessSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const [mode, setMode] = useState('list'); // list | create | edit
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-mine'],
    queryFn: () => apiGet('/api/vendors/mine'),
  });

  const vendors = Array.isArray(data?.vendors)
    ? data.vendors
    : data?.vendor
      ? [data.vendor]
      : [];

  const editing = editingId ? vendors.find((v) => v.id === editingId) : null;

  useEffect(() => {
    if (mode === 'edit' && editing) {
      setDraft({
        name: editing.name || '',
        category: editing.category || '',
        description: editing.description || '',
        website: editing.website || '',
        images: (editing.images || []).map((i) => i.url),
        is_published: editing.is_published !== false,
      });
    }
  }, [mode, editing]);

  const startCreate = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT });
    setMode('create');
  };

  const startEdit = (vendor) => {
    setEditingId(vendor.id);
    setDraft({
      name: vendor.name || '',
      category: vendor.category || '',
      description: vendor.description || '',
      website: vendor.website || '',
      images: (vendor.images || []).map((i) => i.url),
      is_published: vendor.is_published !== false,
    });
    setMode('edit');
  };

  const backToList = () => {
    setMode('list');
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!isVendorListingValid(draft)) {
        throw new Error('Name, category, and description are required');
      }
      const payload = {
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description.trim(),
        website: draft.website?.trim() || null,
        city: userProfile?.city || null,
        latitude: userProfile?.latitude ?? null,
        longitude: userProfile?.longitude ?? null,
        is_published: draft.is_published !== false,
        images: (draft.images || []).map((url, i) => ({ url, sort_order: i })),
      };
      if (mode === 'edit' && editingId) {
        return apiPatch(`/api/vendors/${editingId}`, payload);
      }
      return apiPost('/api/vendors', payload);
    },
    onSuccess: () => {
      toast.success(mode === 'edit' ? 'Listing updated' : 'Listing published');
      queryClient.invalidateQueries({ queryKey: ['vendor-mine'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      backToList();
    },
    onError: (err) => toast.error(err?.message || 'Could not save listing'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiDelete(`/api/vendors/${id}`),
    onSuccess: () => {
      toast.success('Listing removed');
      queryClient.invalidateQueries({ queryKey: ['vendor-mine'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      backToList();
    },
    onError: (err) => toast.error(err?.message || 'Could not remove listing'),
  });

  const headerTitle =
    mode === 'create' ? 'Add vendor business' : mode === 'edit' ? 'Edit vendor business' : 'My vendor businesses';

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <PageBackHeader
        title={headerTitle}
        pageName="VendorBusinessSettings"
        onBack={mode !== 'list' ? backToList : undefined}
      />

      <div className="px-5 max-w-md mx-auto pt-4 space-y-5">
        {mode === 'list' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
              List one or more services venues can hire — chip & dip, AV gear, DJ sets, decor, and more.
              Interested venues will send you a friend request to chat.
            </p>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="sec-spinner" />
              </div>
            ) : (
              <>
                {vendors.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--sec-text-secondary)' }}>
                    You have not listed a vendor business yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {vendors.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => startEdit(v)}
                        className="w-full text-left rounded-xl p-4 transition-colors"
                        style={{
                          background: 'var(--sec-bg-card)',
                          border: '1px solid var(--sec-border)',
                        }}
                      >
                        <div className="flex gap-3 items-start">
                          {v.cover_url ? (
                            <img
                              src={v.cover_url}
                              alt=""
                              className="w-14 h-14 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-14 h-14 rounded-lg shrink-0"
                              style={{ background: 'var(--sec-bg-elevated)' }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-semibold truncate"
                              style={{ color: 'var(--sec-text-primary)', fontSize: 15 }}
                            >
                              {v.name}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--sec-text-muted)' }}>
                              {vendorCategoryLabel(v.category)}
                              {v.is_published === false ? ' · Draft' : ' · Published'}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={startCreate}
                  className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl font-semibold"
                  style={{
                    background: 'var(--sec-accent)',
                    color: '#000',
                    border: 'none',
                    fontSize: 15,
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add business
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
              {mode === 'create'
                ? 'Create another listing. Each business appears separately on Vendors.'
                : 'Update this listing. Changes go live when published.'}
            </p>

            <VendorListingForm value={draft} onChange={setDraft} cityHint={userProfile?.city} />

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                color: 'var(--sec-text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={draft.is_published !== false}
                onChange={(e) => setDraft((p) => ({ ...p, is_published: e.target.checked }))}
              />
              Publish listing (visible on Vendors)
            </label>

            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !isVendorListingValid(draft)}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 'var(--radius-lg)',
                border: 'none',
                backgroundColor: 'var(--sec-accent)',
                color: '#000',
                fontWeight: 650,
                fontSize: 15,
                cursor: saveMutation.isPending ? 'wait' : 'pointer',
                opacity: !isVendorListingValid(draft) ? 0.5 : 1,
              }}
            >
              {saveMutation.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Publish listing'}
            </button>

            {mode === 'edit' && editingId ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`${createPageUrl('VendorDetail')}?id=${encodeURIComponent(editingId)}`)
                  }
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--sec-border)',
                    backgroundColor: 'var(--sec-bg-card)',
                    color: 'var(--sec-text-primary)',
                    fontWeight: 560,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Preview listing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Remove this vendor listing?')) {
                      deleteMutation.mutate(editingId);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(239,68,68,0.35)',
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    fontWeight: 560,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {deleteMutation.isPending ? 'Removing…' : 'Remove listing'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
