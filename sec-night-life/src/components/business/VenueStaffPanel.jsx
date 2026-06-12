import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet } from '@/api/client';
import { asArray } from '@/utils';
import { toast } from 'sonner';
import { Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { STAFF_PERMISSIONS } from '@/components/business/AddStaffModal';

function UserAvatar({ url, name }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-9 h-9 rounded-full object-cover shrink-0"
        style={{ border: '1px solid var(--sec-border)' }}
      />
    );
  }
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ background: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}
    >
      {initial}
    </div>
  );
}

function permissionSummary(permissions) {
  const active = STAFF_PERMISSIONS.filter((p) => permissions?.[p.key]).map((p) => p.label);
  if (!active.length) return 'No permissions';
  if (active.length <= 3) return active.join(', ');
  return `${active.slice(0, 3).join(', ')} +${active.length - 3}`;
}

export default function VenueStaffPanel({ venueId, onInvite }) {
  const queryClient = useQueryClient();
  const [removingId, setRemovingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['venue-staff', venueId],
    queryFn: () => apiGet(`/api/business/venues/${venueId}/staff`),
    enabled: Boolean(venueId),
    staleTime: 30_000,
  });

  const staff = asArray(data?.items ?? data);

  const removeMutation = useMutation({
    mutationFn: (userId) => apiDelete(`/api/business/venues/${venueId}/staff/${userId}`),
    onMutate: (userId) => setRemovingId(userId),
    onSuccess: () => {
      toast.success('Staff member removed');
      queryClient.invalidateQueries({ queryKey: ['venue-staff', venueId] });
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not remove staff');
    },
    onSettled: () => setRemovingId(null),
  });

  const handleRemove = (member) => {
    const label = member.user?.username ? `@${member.user.username}` : member.user?.fullName || 'this user';
    if (!window.confirm(`Remove ${label} from venue staff? They will lose access to this venue immediately.`)) {
      return;
    }
    removeMutation.mutate(member.userId);
  };

  return (
    <div className="sec-card" style={{ padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: 'var(--sec-accent-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={18} style={{ color: 'var(--sec-accent)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--sec-text-primary)', margin: 0 }}>Venue staff</h3>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>
              People who can help manage this venue. They only see what you assign.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="sec-btn sec-btn-primary sec-btn-sm shrink-0"
          style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={onInvite}
        >
          <UserPlus size={14} />
          Invite
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Loader2 className="animate-spin" size={22} style={{ color: 'var(--sec-accent)' }} />
        </div>
      ) : staff.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', textAlign: 'center', padding: '12px 0' }}>
          No staff assigned yet. Invite someone to help with bookings, events, or other tasks.
        </p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
          {staff.map((member) => {
            const u = member.user || {};
            const display = u.username ? `@${u.username}` : u.fullName || 'Staff member';
            const isRemoving = removingId === member.userId;
            return (
              <li
                key={member.id || member.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: 'var(--sec-bg-elevated)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                <UserAvatar url={u.avatarUrl} name={u.fullName || u.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {display}
                  </p>
                  {u.fullName && u.username ? (
                    <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2 }}>{u.fullName}</p>
                  ) : null}
                  <p style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                    {permissionSummary(member.permissions)}
                  </p>
                </div>
                <button
                  type="button"
                  className="sec-btn sec-btn-ghost sec-btn-sm"
                  style={{
                    height: 34,
                    padding: '0 10px',
                    color: 'var(--sec-error, #ef4444)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    flexShrink: 0,
                  }}
                  disabled={isRemoving || removeMutation.isPending}
                  onClick={() => handleRemove(member)}
                  aria-label={`Remove ${display}`}
                >
                  {isRemoving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={14} style={{ marginRight: 4 }} />
                      Remove
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
