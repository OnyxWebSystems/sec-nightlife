import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, MessageCircle, UserPlus, Store, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { vendorCategoryLabel } from '@/lib/vendorCategories';
import { toast } from 'sonner';

export default function VendorDetail() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [galleryIndex, setGalleryIndex] = useState(0);

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => apiGet(`/api/vendors/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });

  const ownerId = vendor?.owner?.user_id || vendor?.user_id;

  const { data: friends = [] } = useQuery({
    queryKey: ['friends-list'],
    queryFn: () => apiGet('/api/friends'),
    enabled: Boolean(user?.id),
  });

  const friendEntry = useMemo(() => {
    if (!ownerId || !Array.isArray(friends)) return null;
    return friends.find((f) => f.id === ownerId) || null;
  }, [friends, ownerId]);
  const isFriend = Boolean(friendEntry);
  const isOwn = Boolean(user?.id && ownerId && user.id === ownerId);

  const friendRequestMutation = useMutation({
    mutationFn: () => apiPost('/api/friends/request', { receiverId: ownerId }),
    onSuccess: () => {
      toast.success('Friend request sent');
      queryClient.invalidateQueries({ queryKey: ['friends-list'] });
    },
    onError: (err) => toast.error(err?.message || 'Could not send friend request'),
  });

  const openMessage = async () => {
    try {
      if (friendEntry?.conversationId) {
        navigate(`${createPageUrl('Messages')}?dm=${encodeURIComponent(friendEntry.conversationId)}`);
        return;
      }
      const conv = await apiPost('/api/messages/conversations/find-or-create', {
        participantId: ownerId,
      });
      const cid = conv?.id || conv?.conversationId;
      if (cid) {
        navigate(`${createPageUrl('Messages')}?dm=${encodeURIComponent(cid)}`);
      } else {
        toast.error('Could not open conversation');
      }
    } catch (err) {
      toast.error(err?.message || 'Could not open conversation');
    }
  };

  const images = vendor?.images?.length
    ? vendor.images.map((i) => i.url)
    : vendor?.cover_url
      ? [vendor.cover_url]
      : [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
        <p style={{ color: 'var(--sec-text-muted)' }}>Vendor not found</p>
        <button type="button" onClick={() => navigate(createPageUrl('Vendors'))} className="sec-btn sec-btn-primary">
          Back to Vendors
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <div style={{ position: 'relative', aspectRatio: '16/11', backgroundColor: 'var(--sec-bg-elevated)' }}>
        {images.length ? (
          <img
            src={images[galleryIndex] || images[0]}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sec-text-muted)' }}>
            <Store size={48} strokeWidth={1.2} />
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute',
            top: 'max(12px, env(safe-area-inset-top))',
            left: 12,
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '1px solid var(--sec-border)',
            backgroundColor: 'rgba(0,0,0,0.55)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ChevronLeft size={20} />
        </button>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => setGalleryIndex((i) => (i - 1 + images.length) % images.length)}
              style={galleryNavStyle('left')}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setGalleryIndex((i) => (i + 1) % images.length)}
              style={galleryNavStyle('right')}
            >
              <ChevronRight size={18} />
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '10px 16px 0' }}>
          {images.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setGalleryIndex(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: 'none',
                padding: 0,
                backgroundColor: i === galleryIndex ? 'var(--sec-accent)' : 'var(--sec-border)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="px-5 pt-5 max-w-lg mx-auto">
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sec-accent)' }}>
          {vendorCategoryLabel(vendor.category)}
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 700, color: 'var(--sec-text-primary)', letterSpacing: '-0.02em' }}>
          {vendor.name}
        </h1>
        {vendor.city ? (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--sec-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} /> {vendor.city}
          </p>
        ) : null}

        <p style={{ margin: '18px 0 0', fontSize: 15, lineHeight: 1.55, color: 'var(--sec-text-secondary)' }}>
          {vendor.description}
        </p>

        {vendor.owner ? (
          <Link
            to={`${createPageUrl('UserProfile')}?id=${encodeURIComponent(ownerId)}`}
            style={{
              marginTop: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              textDecoration: 'none',
              padding: 12,
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: 'var(--sec-bg-elevated)',
                flexShrink: 0,
              }}
            >
              {vendor.owner.avatar_url ? (
                <img src={vendor.owner.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sec-text-muted)' }}>
                  <Store size={18} />
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
                @{vendor.owner.username || 'owner'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sec-text-muted)' }}>Business owner</p>
            </div>
          </Link>
        ) : null}
      </div>

      {!isOwn && ownerId ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '12px 20px max(16px, env(safe-area-inset-bottom))',
            background: 'linear-gradient(to top, var(--sec-bg-base) 70%, transparent)',
          }}
        >
          <div className="max-w-lg mx-auto">
            {isFriend ? (
              <button
                type="button"
                onClick={() => void openMessage()}
                style={primaryCtaStyle}
              >
                <MessageCircle size={18} /> Message owner
              </button>
            ) : (
              <button
                type="button"
                onClick={() => friendRequestMutation.mutate()}
                disabled={friendRequestMutation.isPending}
                style={primaryCtaStyle}
              >
                <UserPlus size={18} />
                {friendRequestMutation.isPending ? 'Sending…' : 'Send friend request'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const primaryCtaStyle = {
  width: '100%',
  height: 50,
  borderRadius: 'var(--radius-lg)',
  border: 'none',
  backgroundColor: 'var(--sec-accent)',
  color: '#000',
  fontWeight: 650,
  fontSize: 15,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
};

function galleryNavStyle(side) {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 10,
    transform: 'translateY(-50%)',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px solid var(--sec-border)',
    backgroundColor: 'rgba(0,0,0,0.45)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  };
}
