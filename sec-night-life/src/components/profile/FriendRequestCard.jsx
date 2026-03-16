import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function FriendRequestCard({ request }) {
  const queryClient = useQueryClient();

  const { data: fromUser } = useQuery({
    queryKey: ['user-profile', request.from_user_id],
    queryFn: async () => {
      const profiles = await dataService.User.filter({ id: request.from_user_id });
      return profiles[0];
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const currentUser = await authService.getCurrentUser();
      const myProfiles = await dataService.User.filter({ created_by: currentUser.email });
      const myProfile = myProfiles[0];

      await dataService.FriendRequest.update(request.id, { status: 'accepted' });
      
      await dataService.User.update(myProfile.id, {
        friends: [...(myProfile.friends || []), request.from_user_id]
      });
      
      await dataService.User.update(request.from_user_id, {
        friends: [...(fromUser.friends || []), myProfile.id]
      });

      await dataService.Notification.create({
        user_id: request.from_user_id,
        type: 'friend_request',
        title: 'Friend Request Accepted',
        message: `${myProfile.username || currentUser.full_name} accepted your friend request!`,
        data: { user_id: myProfile.id }
      });
    },
    onSuccess: () => {
      toast.success('Friend request accepted!');
      queryClient.invalidateQueries(['friend-requests']);
      queryClient.invalidateQueries(['user-profile']);
      queryClient.invalidateQueries(['friends']);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      await dataService.FriendRequest.update(request.id, { status: 'declined' });
    },
    onSuccess: () => {
      toast.success('Friend request declined');
      queryClient.invalidateQueries(['friend-requests']);
    },
  });

  if (!fromUser) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]">
      <Link to={createPageUrl(`Profile?id=${fromUser.id}`)} className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ backgroundColor: '#000', border: '2px solid var(--sec-accent)' }}
        >
          {fromUser.avatar_url ? (
            <img src={fromUser.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold uppercase" style={{ color: 'var(--sec-accent)' }}>
              {(fromUser.full_name || fromUser.username)?.[0] || 'U'}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{fromUser.username || fromUser.full_name}</p>
          {request.message && (
            <p className="text-xs text-gray-500 truncate">{request.message}</p>
          )}
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