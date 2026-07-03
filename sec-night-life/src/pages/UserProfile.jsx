import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiDelete } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, UserPlus, UserCheck, MessageCircle, Ban, BadgeCheck } from 'lucide-react';
import { dataService } from '@/services/dataService';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import UserProfileReviewsSection from '@/components/reviews/UserProfileReviewsSection';
import { StarRatingDisplay } from '@/components/reviews/StarRating';
import ReportDialog from '@/components/moderation/ReportDialog';
import TableHistorySection from '@/components/profile/TableHistorySection';
import PageBackHeader from '@/components/layout/PageBackHeader';

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
  const isVerifiedPromoter = !!profile?.is_verified_promoter;

  const { data: promoterFollowStatus } = useQuery({
    queryKey: ['promoter-follow-status', userId],
    queryFn: () => dataService.Promoters.followingStatus(userId),
    enabled: !!userId && !isSelf && isVerifiedPromoter,
  });

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
      <div className="min-h-screen flex items-center justify-center max-w-app md:max-w-app-md mx-auto">
        <div className="w-10 h-10 border-2 border-t-transparent border-[var(--sec-accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 max-w-app md:max-w-app-md mx-auto">
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
  const genderLabel =
    profile?.gender === 'male' ? 'Male' : profile?.gender === 'female' ? 'Female' : profile?.gender === 'other' ? 'Other' : null;

  return (
    <div className="min-h-screen pb-6 max-w-app md:max-w-app-md mx-auto">
      <PageBackHeader
        title={profile.full_name || profile.username || 'Profile'}
        pageName="UserProfile"
      />

      <div className="px-4 mt-6 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-[#262629] overflow-hidden mb-3">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              {(profile.username || profile.fullName || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold flex items-center justify-center gap-2">
          {profile.fullName || profile.username}
          {isVerifiedPromoter ? <BadgeCheck className="w-5 h-5 text-[var(--sec-accent)]" /> : null}
        </h2>
        <p className="text-gray-500 text-sm">@{profile.username || 'user'}</p>
        {profile.reviewCount > 0 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <StarRatingDisplay value={profile.reviewAverage} size={16} />
            <span className="text-sm font-medium">{Number(profile.reviewAverage).toFixed(1)}</span>
            <span className="text-xs text-gray-500">({profile.reviewCount} reviews)</span>
          </div>
        )}
        {genderLabel && <p className="text-sm text-gray-400 mt-1">{genderLabel}</p>}
        {profile.city && <p className="text-sm text-gray-400 mt-1">{profile.city}</p>}
        <p className="text-sm mt-3 text-left w-full text-gray-300">{profile.bio || ''}</p>

        <p className="text-sm text-gray-500 mt-4">{profile.mutualFriendsCount || 0} mutual friends</p>

        {!isSelf && (
          <div className="w-full mt-6 space-y-2">
            {isVerifiedPromoter ? (
              <Button
                variant={promoterFollowStatus?.following ? 'outline' : 'default'}
                className="w-full min-h-[44px]"
                onClick={async () => {
                  try {
                    if (promoterFollowStatus?.following) {
                      await dataService.Promoters.unfollow(userId);
                      toast.success('Unfollowed promoter');
                    } else {
                      await dataService.Promoters.follow(userId);
                      toast.success('Following promoter');
                    }
                    queryClient.invalidateQueries({ queryKey: ['promoter-follow-status', userId] });
                  } catch (e) {
                    toast.error(e?.data?.error || 'Could not update follow');
                  }
                }}
              >
                {promoterFollowStatus?.following ? (
                  <><UserCheck className="w-4 h-4 mr-2" />Following</>
                ) : (
                  <><UserPlus className="w-4 h-4 mr-2" />Follow promoter</>
                )}
              </Button>
            ) : null}
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
            <ReportDialog
              targetType="user"
              targetId={userId}
              targetLabel={profile.username || profile.fullName || 'user'}
              triggerClassName="w-full min-h-[44px]"
              triggerLabel="Report user"
            />
          </div>
        )}

        {isSelf && (
          <Link to={createPageUrl('EditProfile')} className="mt-6 inline-block min-h-[44px] px-6 leading-[44px] rounded-full bg-[var(--sec-accent)] text-black font-medium">
            Edit profile
          </Link>
        )}
      </div>

      <div className="mt-10 w-full text-left space-y-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Interests</h3>
          {Array.isArray(profile.interests) && profile.interests.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-[#141416] border border-[#262629]">
                  {i}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No interests listed yet.</p>
          )}
        </div>
      </div>

      <UserProfileReviewsSection profileUserId={userId} profileUsername={profile.username} />

      <div className="mt-10">
        {st === 'ACCEPTED' || isSelf ? (
          <TableHistorySection userId={userId} isOwn={isSelf} limit={12} />
        ) : (
          <p className="text-sm text-gray-500">
            Add {profile.fullName?.split(' ')?.[0] || 'them'} as a friend to see their table history.
          </p>
        )}
      </div>
    </div>
  );
}
