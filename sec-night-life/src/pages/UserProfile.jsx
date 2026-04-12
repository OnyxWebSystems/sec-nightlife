import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiDelete } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, UserPlus, MessageCircle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function UserProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = new URLSearchParams(window.location.search).get('id');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['public-profile', userId],
    queryFn: () => apiGet(`/api/users/${userId}/profile`),
    enabled: !!userId && /^[0-9a-f-]{36}$/i.test(userId || ''),
  });

  const isSelf = profile?.isSelf;

  const onAddFriend = async () => {
    try {
      await apiPost('/api/friends/request', { receiverId: userId });
      toast.success('Request sent');
      queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  const onAccept = async () => {
    try {
      await apiPost(`/api/friends/request/${profile.friendshipId}/accept`);
      toast.success('You are now friends');
      queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  const onDecline = async () => {
    try {
      await apiPost(`/api/friends/request/${profile.friendshipId}/decline`);
      queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  const onUnblock = async () => {
    try {
      await apiDelete(`/api/friends/block/${userId}`);
      toast.success('Unblocked');
      queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  if (isLoading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center max-w-[480px] mx-auto">
        <div className="w-10 h-10 border-2 border-t-transparent border-[var(--sec-accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 max-w-[480px] mx-auto">
        <div className="text-center">
          <h2 className="text-lg font-bold mb-2">User not found</h2>
          <Button className="min-h-[44px]" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const st = profile.friendshipStatus;

  return (
    <div className="min-h-screen pb-24 max-w-[480px] mx-auto px-4">
      <div className="pt-4 flex items-center gap-2">
        <button
          type="button"
          className="min-h-[44px] min-w-[44px] rounded-full bg-[#141416] flex items-center justify-center"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">Profile</h1>
      </div>

      <div className="mt-6 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-[#262629] overflow-hidden mb-3">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              {(profile.username || profile.fullName || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold">{profile.fullName || profile.username}</h2>
        <p className="text-gray-500 text-sm">@{profile.username || 'user'}</p>
        {profile.city && <p className="text-sm text-gray-400 mt-1">{profile.city}</p>}
        <p className="text-sm mt-3 text-left w-full text-gray-300">{profile.bio || ''}</p>
        {profile.interests?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {profile.interests.map((i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-full bg-[#141416] border border-[#262629]">
                {i}
              </span>
            ))}
          </div>
        )}

        <p className="text-sm text-gray-500 mt-4">{profile.mutualFriendsCount || 0} mutual friends</p>

        {!isSelf && (
          <div className="w-full mt-6 space-y-2">
            {st === 'NONE' && (
              <Button className="w-full min-h-[44px]" onClick={onAddFriend}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Friend
              </Button>
            )}
            {st === 'PENDING_SENT' && (
              <Button disabled className="w-full min-h-[44px]">
                Request Sent
              </Button>
            )}
            {st === 'PENDING_RECEIVED' && (
              <div className="flex gap-2">
                <Button className="flex-1 min-h-[44px] bg-emerald-600" onClick={onAccept}>
                  Accept Request
                </Button>
                <Button variant="outline" className="flex-1 min-h-[44px]" onClick={onDecline}>
                  Decline
                </Button>
              </div>
            )}
            {st === 'ACCEPTED' && profile.conversationId && (
              <Button
                className="w-full min-h-[44px]"
                onClick={() => navigate(`${createPageUrl('Messages')}?dm=${profile.conversationId}`)}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Message
              </Button>
            )}
            {st === 'BLOCKED' && profile.canUnblock && (
              <Button variant="outline" className="w-full min-h-[44px]" onClick={onUnblock}>
                <Ban className="w-4 h-4 mr-2" />
                Unblock
              </Button>
            )}
            {st === 'BLOCKED' && profile.blockedByThem && (
              <p className="text-sm text-gray-500">This user has blocked you.</p>
            )}
          </div>
        )}

        {isSelf && (
          <Link to={createPageUrl('EditProfile')} className="mt-6 inline-block min-h-[44px] px-6 leading-[44px] rounded-full bg-[var(--sec-accent)] text-black font-medium">
            Edit profile
          </Link>
        )}
      </div>

      <div className="mt-10">
        <h3 className="text-sm font-semibold text-gray-500 mb-2">Activity</h3>
        {st !== 'ACCEPTED' && !isSelf ? (
          <p className="text-sm text-gray-500">
            Add {profile.fullName?.split(' ')?.[0] || 'them'} as a friend to see their activity.
          </p>
        ) : (
          <ul className="space-y-2">
            {(profile.recentActivity || []).map((a) => (
              <li key={a.createdAt + a.description} className="text-sm text-gray-400 border-b border-[#262629] pb-2">
                {a.description} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
              </li>
            ))}
            {(!profile.recentActivity || profile.recentActivity.length === 0) && (
              <p className="text-sm text-gray-600">No recent activity.</p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
