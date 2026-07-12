import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/api/client';
import PageBackHeader from '@/components/layout/PageBackHeader';
import VendorListingForm, { isVendorListingValid } from '@/components/vendors/VendorListingForm';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

export default function VendorBusinessSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const [draft, setDraft] = useState({
    name: '',
    category: '',
    description: '',
    website: '',
    images: [],
    is_published: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-mine'],
    queryFn: () => apiGet('/api/vendors/mine'),
  });

  const existing = data?.vendor;

  useEffect(() => {
    if (!existing) return;
    setDraft({
      name: existing.name || '',
      category: existing.category || '',
      description: existing.description || '',
      website: existing.website || '',
      images: (existing.images || []).map((i) => i.url),
      is_published: existing.is_published !== false,
    });
  }, [existing]);

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
      if (existing?.id) {
        return apiPatch(`/api/vendors/${existing.id}`, payload);
      }
      return apiPost('/api/vendors', payload);
    },
    onSuccess: () => {
      toast.success(existing ? 'Listing updated' : 'Listing published');
      queryClient.invalidateQueries({ queryKey: ['vendor-mine'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (err) => toast.error(err?.message || 'Could not save listing'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/api/vendors/${existing.id}`),
    onSuccess: () => {
      toast.success('Listing removed');
      setDraft({ name: '', category: '', description: '', website: '', images: [], is_published: true });
      queryClient.invalidateQueries({ queryKey: ['vendor-mine'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (err) => toast.error(err?.message || 'Could not remove listing'),
  });

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <PageBackHeader title="My vendor business" pageName="VendorBusinessSettings" />

      <div className="px-5 max-w-md mx-auto pt-4 space-y-5">
        <p style={{ margin: 0, fontSize: 14, color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>
          List services venues can hire — chip & dip, AV gear, DJ sets, decor, and more. Interested venues will send you a friend request to chat.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="sec-spinner" />
          </div>
        ) : (
          <>
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
              {saveMutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Publish listing'}
            </button>

            {existing ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`${createPageUrl('VendorDetail')}?id=${encodeURIComponent(existing.id)}`)}
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
                    if (window.confirm('Remove your vendor listing?')) deleteMutation.mutate();
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
