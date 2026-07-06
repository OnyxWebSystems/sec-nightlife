import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/api/client';
import { uploadToCloudinary } from '@/lib/cloudinaryUpload';
import { toast } from 'sonner';
import {
  Map, Upload, Loader2, Star, Trash2, Pencil, Check, X,
} from 'lucide-react';
import PageBackHeader from '@/components/layout/PageBackHeader';
import VenueSwitcher from '@/components/business/VenueSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveVenue } from '@/context/ActiveVenueContext';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';

function businessQs(venueScope, venueId) {
  const params = new URLSearchParams();
  if (venueScope.staffContextToken) params.set('staff_ctx', venueScope.staffContextToken);
  else if (venueId) params.set('venue_id', venueId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function BusinessVenueSeatingPlans() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const { activeVenue } = useActiveVenue();
  const venueScope = useBusinessVenueScope();
  const venueId = venueScope.inStaffSession ? venueScope.venueId : activeVenue?.id;
  const scopeKey = venueScope.staffContextToken || venueId;
  const [uploading, setUploading] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCaption, setEditCaption] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['venue-seating-plans', scopeKey],
    queryFn: () => apiGet(`/api/business/venue-seating-plans${businessQs(venueScope, venueId)}`),
    enabled: !!venueId || !!venueScope.staffContextToken,
  });

  const plans = data?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['venue-seating-plans'] });
    qc.invalidateQueries({ queryKey: ['venue-detail'] });
  };

  const createPlan = useMutation({
    mutationFn: (payload) => apiPost('/api/business/venue-seating-plans', payload),
    onSuccess: () => {
      toast.success('Seating plan added');
      setDraftName('');
      setDraftCaption('');
      invalidate();
    },
    onError: (e) => toast.error(e?.data?.error || e.message || 'Could not save plan'),
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, ...body }) => apiPatch(`/api/business/venue-seating-plans/${id}`, body),
    onSuccess: () => {
      toast.success('Plan updated');
      setEditingId(null);
      invalidate();
    },
    onError: (e) => toast.error(e?.data?.error || e.message || 'Could not update plan'),
  });

  const deletePlan = useMutation({
    mutationFn: (id) => apiDelete(`/api/business/venue-seating-plans/${id}`),
    onSuccess: () => {
      toast.success('Plan removed');
      invalidate();
    },
    onError: (e) => toast.error(e?.data?.error || e.message || 'Could not delete plan'),
  });

  const handleUpload = async (file) => {
    if (!file || !venueId) return;
    if (!draftName.trim()) {
      toast.error('Enter a name for this plan (e.g. Main floor)');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadToCloudinary(file, {
        folder: 'sec-nightlife/seating-plans',
        resourceType: 'image',
      });
      await createPlan.mutateAsync({
        venue_id: venueId,
        name: draftName.trim(),
        caption: draftCaption.trim() || null,
        image_url: uploaded.url,
        image_public_id: uploaded.publicId || null,
        is_default: plans.length === 0,
      });
    } catch (e) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const startEdit = (plan) => {
    setEditingId(plan.id);
    setEditName(plan.name);
    setEditCaption(plan.caption || '');
  };

  return (
    <div className="min-h-screen pb-24">
      <PageBackHeader title="Seating plans" subtitle="Floor & seating layouts for guests" pageName="BusinessVenueSeatingPlans" />
      <div className="py-4 space-y-5">
        <VenueSwitcher />

        <div
          className="sec-card p-5 rounded-2xl"
          style={{
            border: '1px solid rgba(192, 192, 192, 0.25)',
            background:
              'linear-gradient(145deg, rgba(192, 192, 192, 0.08) 0%, var(--sec-bg-card) 45%, var(--sec-bg-elevated) 100%)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}
            >
              <Map size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--sec-text-primary)' }}>
                Show guests exactly where they&apos;ll sit
              </h2>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--sec-text-muted)' }}>
                Upload floor and seating plans so party-goers can preview their table location before booking day tables or event tables.
              </p>
            </div>
          </div>
        </div>

        <div className="sec-card p-5 border border-[var(--sec-border)] space-y-4">
          <h3 className="font-semibold text-sm">Add a plan</h3>
          <div>
            <Label className="text-xs">Plan name</Label>
            <Input
              className="mt-1 h-10"
              placeholder="e.g. Main floor, VIP lounge, Rooftop"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Caption for guests (optional)</Label>
            <Input
              className="mt-1 h-10"
              placeholder="e.g. General admission tables are marked in silver"
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files?.[0])}
          />
          <Button
            type="button"
            className="sec-btn-primary w-full min-h-[44px]"
            disabled={uploading || !venueId}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? 'Uploading…' : 'Upload image'}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin" style={{ color: 'var(--sec-accent)' }} />
          </div>
        ) : plans.length === 0 ? (
          <div className="sec-card p-10 text-center">
            <Map size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No seating plans yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--sec-text-muted)' }}>
              Upload your first floor plan above, then enable it on day bookings or individual events.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className="sec-card overflow-hidden border border-[var(--sec-border)]">
                <div className="aspect-[4/3] bg-[var(--sec-bg-elevated)] relative">
                  <img src={plan.image_url} alt="" className="w-full h-full object-contain" />
                  {plan.is_default ? (
                    <span className="absolute top-2 left-2 sec-badge sec-badge-silver text-[10px]">
                      Default
                    </span>
                  ) : null}
                </div>
                <div className="p-4 space-y-3">
                  {editingId === plan.id ? (
                    <>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                      <Input
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        placeholder="Caption"
                        className="h-9"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 min-h-[44px]"
                          disabled={updatePlan.isPending}
                          onClick={() =>
                            updatePlan.mutate({
                              id: plan.id,
                              name: editName.trim(),
                              caption: editCaption.trim() || null,
                            })
                          }
                        >
                          <Check size={14} className="mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setEditingId(null)}>
                          <X size={14} />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="font-semibold">{plan.name}</p>
                        {plan.caption ? (
                          <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>{plan.caption}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!plan.is_default ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[44px]"
                            disabled={updatePlan.isPending}
                            onClick={() => updatePlan.mutate({ id: plan.id, is_default: true })}
                          >
                            <Star size={14} className="mr-1" /> Set default
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => startEdit(plan)}>
                          <Pencil size={14} className="mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-[44px]"
                          disabled={deletePlan.isPending}
                          onClick={() => {
                            if (!window.confirm(`Remove "${plan.name}"?`)) return;
                            deletePlan.mutate(plan.id);
                          }}
                        >
                          <Trash2 size={14} className="mr-1" /> Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-center px-2" style={{ color: 'var(--sec-text-muted)' }}>
          Enable plans for guests in{' '}
          <Link to={createPageUrl('BusinessVenueTables')} className="sec-link" style={{ color: 'var(--sec-accent)' }}>
            Tables & day bookings
          </Link>{' '}
          or per event in the Events manager.
        </p>
      </div>
    </div>
  );
}
