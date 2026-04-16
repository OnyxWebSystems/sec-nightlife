import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiPost } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * One incoming friend request from GET /api/friends/requests/incoming
 * ({ friendshipId, user: { id, username, fullName, avatarUrl, city } }).
 */
export default function FriendRequestCard({ row }) {
  const queryClient = useQueryClient();
  const { friendshipId, user } = row || {};
  const displayName = user?.fullName || user?.username || 'Someone';

  const acceptMutation = useMutation({
    mutationFn: async () => {
      await apiPost(`/api/friends/request/${friendshipId}/accept`);
    },
    onSuccess: () => {
      toast.success('You are now friends');
      queryClient.invalidateQueries({ queryKey: ['friends-incoming'] });
      queryClient.invalidateQueries({ queryKey: ['friends-list'] });
      queryClient.invalidateQueries({ queryKey: ['profile-social'] });
      queryClient.invalidateQueries({ queryKey: ['friends-preview-own'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile-viewer'] });
      queryClient.invalidateQueries({ queryKey: ['notif-friend-req'] });
    },
    onError: (e) => {
      toast.error(e?.data?.error || e?.message || 'Could not accept request');
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      await apiPost(`/api/friends/request/${friendshipId}/decline`);
    },
    onSuccess: () => {
      toast.success('Request declined');
      queryClient.invalidateQueries({ queryKey: ['friends-incoming'] });
      queryClient.invalidateQueries({ queryKey: ['notif-friend-req'] });
    },
    onError: (e) => {
      toast.error(e?.data?.error || e?.message || 'Could not decline request');
    },
  });

  if (!user?.id || !friendshipId) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]">
      <Link
        to={createPageUrl(`Profile?id=${user.id}`)}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ backgroundColor: '#000', border: '2px solid var(--sec-accent)' }}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold uppercase" style={{ color: 'var(--sec-accent)' }}>
              {displayName[0]?.toUpperCase() || 'U'}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{displayName}</p>
          {user.username ? (
            <p className="text-xs text-gray-500 truncate">@{user.username}</p>
          ) : null}
        </div>
      </Link>
      <div className="flex gap-2 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending}
          className="h-8 w-8 p-0"
          style={{ backgroundColor: 'var(--sec-success)', color: '#000' }}
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => declineMutation.mutate()}
          disabled={declineMutation.isPending}
          className="border-[#262629] h-8 w-8 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
