import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@/api/client';
import {
  Settings,
  MapPin,
  Calendar,
  Users,
  Star,
  BadgeCheck,
  ChevronRight,
  Wine,
  Edit3,
  Award,
  UserPlus,
  UserCheck,
  ChevronLeft,
  MessageCircle,
  Building2,
  Briefcase,
  Wallet,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import SecScrollTabs from '@/components/ui/SecScrollTabs';
import { format, parseISO } from 'date-fns';
import { toast } from "sonner";

import FriendRequestCard from '@/components/profile/FriendRequestCard';
import MyTickets from '@/components/profile/MyTickets';
import MyReviews from '@/components/profile/MyReviews';
import InterestsEditor from '@/components/profile/InterestsEditor';
import TableHistorySection from '@/components/profile/TableHistorySection';
import UserSecWallet from '@/components/wallet/UserSecWallet';
import PageBackHeader from '@/components/layout/PageBackHeader';
import SecLoadingScreen from '@/components/ui/SecLoadingScreen';
import RoleAccessPanel from '@/components/profile/RoleAccessPanel';
import { useIsMobile } from '@/hooks/useIsDesktop';
function PromoterPromotionsPanel({ current = [], past = [], stats, isOwn = false, onDismiss }) {
  const renderEvent = (item, { showRemove = false } = {}) => {
    const eventId = item.eventId || item.id;
    const title = item.title;
    const venueName = item.venueName;
    const itemStats = item.stats;
    return (
      <div key={item.assignmentId || eventId} className="p-3 rounded-xl bg-[#0A0A0B] border border-[#262629]">
        <Link to={createPageUrl(`EventDetails?id=${eventId}`)} className="font-medium hover:underline">
          {title}
        </Link>
        {venueName ? <p className="text-xs text-gray-500 mt-1">{venueName}</p> : null}
        {itemStats ? (
          <p className="text-xs text-gray-500 mt-1">
            {itemStats.tickets || 0} tickets · {itemStats.tableJoins || 0} joins · {itemStats.points || 0} pts
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 mt-2">
          {isOwn && item.shareUrl ? (
            <button
              type="button"
              className="sec-btn sec-btn-secondary sec-btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(item.shareUrl);
                toast.success('Promotion link copied');
              }}
            >
              Copy promotion link
            </button>
          ) : null}
          {showRemove && isOwn && item.assignmentId && onDismiss ? (
            <button
              type="button"
              className="sec-btn sec-btn-ghost sec-btn-sm text-gray-500 hover:text-red-400"
              onClick={() => onDismiss(item.assignmentId)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {stats ? (
        <p className="text-sm text-gray-400">
          {stats.totalConversions || 0} conversions · {stats.totalPoints || 0} leaderboard points
        </p>
      ) : null}
      {current.length > 0 ? (
        <div>
          <h4 className="font-semibold mb-2 text-sm">Currently promoting</h4>
          <div className="space-y-2">{current.map(renderEvent)}</div>
        </div>
      ) : null}
      {past.length > 0 ? (
        <div>
          <h4 className="font-semibold mb-2 text-sm">Past promotions</h4>
          <div className="space-y-2">{past.map((item) => renderEvent(item, { showRemove: true }))}</div>
        </div>
      ) : null}
      {!current.length && !past.length ? (
        <p className="text-sm text-gray-500">No promoted events yet.</p>
      ) : null}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const OWN_ONLY_TABS = ['tickets', 'reviews', 'interests', 'wallet', 'promotions'];
  const rawTab = searchParams.get('tab');
  const profileTab = ['activity', 'tickets', 'reviews', 'interests', 'wallet', 'promotions'].includes(rawTab)
    ? rawTab
    : 'activity';
  const setProfileTab = (tab) => setSearchParams({ tab });
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [viewingUserId, setViewingUserId] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('id');
    setViewingUserId(userId);
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.loadUserOrLogin(createPageUrl('Profile'));
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        setUserProfile(profiles[0]);
      } else {
        navigate(createPageUrl('ProfileSetup'));
      }
    } catch {
      // loadUserOrLogin redirects when no session remains
    }
  };

  /** Merge PATCH /api/users/profile response into local state (Profile does not use React Query for own profile). */
  const mergeSelfProfileFromApi = (patch) => {
    setUserProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const isOwnProfile =
    !viewingUserId ||
    (user?.id && viewingUserId === user.id) ||
    (userProfile?.id && viewingUserId === userProfile.id);

  useEffect(() => {
    if (!isOwnProfile && rawTab && OWN_ONLY_TABS.includes(rawTab)) {
      setSearchParams({ tab: 'activity' }, { replace: true });
    }
  }, [isOwnProfile, rawTab, setSearchParams]);

  const activeProfileTab =
    !isOwnProfile && OWN_ONLY_TABS.includes(profileTab) ? 'activity' : profileTab;

  const { data: viewedProfile } = useQuery({
    queryKey: ['viewed-profile', viewingUserId],
    queryFn: async () => {
      const profiles = await dataService.User.filter({ id: viewingUserId });
      return profiles[0];
    },
    enabled: !!viewingUserId && !isOwnProfile,
  });

  const displayProfile = isOwnProfile ? userProfile : viewedProfile;

  const authUserId = displayProfile?.user_id || user?.id || null;
  const historyUserId = isOwnProfile ? (user?.id || authUserId) : authUserId;

  const { data: profilePromotions } = useQuery({
    queryKey: ['profile-promotions', authUserId],
    queryFn: () => dataService.Promoters.promotions(authUserId),
    enabled: !!authUserId,
  });

  const { data: promoterHub } = useQuery({
    queryKey: ['promoter-hub'],
    queryFn: () => dataService.Promoters.myHub(),
    enabled: !!isOwnProfile && !!user?.id,
  });

  const { data: staffAssignments = [] } = useQuery({
    queryKey: ['staff-venues'],
    queryFn: () => apiGet('/api/staff/venues').then((r) => (Array.isArray(r) ? r : r?.items || [])),
    enabled: !!isOwnProfile && !!user?.id,
    staleTime: 5 * 60_000,
  });

  const { data: complianceAccess } = useQuery({
    queryKey: ['compliance-access'],
    queryFn: () => apiGet('/api/compliance-documents/me/access'),
    enabled: !!isOwnProfile && !!user?.id,
    staleTime: 5 * 60_000,
  });

  const canAdminDashboard =
    Boolean(user?.can_admin_dashboard) || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const dismissPromotionMutation = useMutation({
    mutationFn: (assignmentId) => apiDelete(`/api/promoters/me/assignments/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoter-hub'] });
      toast.success('Promotion removed');
    },
    onError: (e) => toast.error(e?.data?.error || e.message || 'Could not remove promotion'),
  });

  const hasPromotionsTab = isOwnProfile
    ? (
      promoterHub?.active?.length > 0
      || promoterHub?.past?.length > 0
      || (promoterHub?.stats?.totalConversions > 0)
    )
    : (profilePromotions?.current?.length > 0 || profilePromotions?.past?.length > 0);

  const statsUserId = isOwnProfile ? user?.id : (viewedProfile?.user_id || null);

  const { data: socialStats, isLoading: socialStatsLoading, isError: socialStatsError } = useQuery({
    queryKey: ['profile-social', statsUserId],
    queryFn: () => apiGet(`/api/users/stats/social/${statsUserId}`),
    enabled: !!statsUserId,
    retry: 2,
  });

  const { data: friendsPreview = [] } = useQuery({
    queryKey: ['friends-preview-own'],
    queryFn: () => apiGet('/api/friends').then((list) => (Array.isArray(list) ? list.slice(0, 6) : [])),
    enabled: !!user?.id && isOwnProfile,
  });

  const { data: activeTables = [] } = useQuery({
    queryKey: ['active-tables', authUserId],
    queryFn: async () => {
      if (!authUserId) return [];
      const tables = await dataService.Table.filter({ status: 'open' });
      return tables.filter((t) =>
        t.host_user_id === authUserId ||
        (Array.isArray(t.members) &&
          t.members.some((m) => {
            const uid = typeof m === 'object' && m ? m.user_id || m.userId : m;
            return uid === authUserId;
          }))
      );
    },
    enabled: !!authUserId && isOwnProfile,
  });

  const { data: interestedEvents = [] } = useQuery({
    queryKey: ['interested-events', displayProfile?.interested_events],
    queryFn: async () => {
      if (!displayProfile?.interested_events?.length) return [];
      const events = await Promise.all(
        displayProfile.interested_events.slice(0, 3).map(id =>
          dataService.Event.filter({ id })
        )
      );
      return events.flat();
    },
    enabled: !!displayProfile?.interested_events?.length,
  });

  /** Viewer-relative data from GET /api/users/:targetUserId/profile (includes mutualFriendsCount). */
  const { data: viewedUserViewerContext } = useQuery({
    queryKey: ['user-profile-viewer', viewedProfile?.user_id],
    queryFn: () => apiGet(`/api/users/${viewedProfile.user_id}/profile`),
    enabled: Boolean(user?.id && !isOwnProfile && viewedProfile?.user_id),
  });

  const mutualFriendsCount = viewedUserViewerContext?.mutualFriendsCount ?? 0;

  /** Same query key as Friends.jsx so incoming requests stay in sync. */
  const { data: incomingFriendRequests = [] } = useQuery({
    queryKey: ['friends-incoming'],
    queryFn: () => apiGet('/api/friends/requests/incoming'),
    enabled: !!user?.id && isOwnProfile,
  });

  const { data: userRoles = { host: false, business: false } } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return { host: false, business: false };
      let hasBusiness = user?.role === 'VENUE';
      let hasHost = false;
      if (!hasBusiness) {
        try {
          const venues = await dataService.Venue.mine();
          hasBusiness = Array.isArray(venues) && venues.length > 0;
        } catch {}
      }
      try {
        const tables = await dataService.Table.filter({ host_user_id: user.id });
        hasHost = tables.length > 0;
      } catch {}
      return { host: hasHost, business: hasBusiness };
    },
    enabled: !!user?.id && isOwnProfile,
  });

  const sendFriendRequestMutation = useMutation({
    mutationFn: async () => {
      const rid = viewedProfile?.user_id;
      if (!rid) throw new Error('Missing user');
      await apiPost('/api/friends/request', { receiverId: rid });
    },
    onSuccess: () => {
      toast.success('Friend request sent!');
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] });
      queryClient.invalidateQueries({ queryKey: ['friend-connection', user?.id, viewedProfile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['profile-social'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile-viewer'] });
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not send request');
    },
  });

  const { data: friendConnection } = useQuery({
    queryKey: ['friend-connection', user?.id, viewedProfile?.user_id],
    queryFn: async () => {
      if (!user?.id || !viewedProfile?.user_id || isOwnProfile) {
        return { isFriend: false, outgoingPending: false, incomingPending: false };
      }
      const targetUserId = viewedProfile.user_id;
      const [acceptedFriends, sent, incoming] = await Promise.all([
        apiGet('/api/friends'),
        apiGet('/api/friends/requests/sent'),
        apiGet('/api/friends/requests/incoming'),
      ]);
      const list = Array.isArray(acceptedFriends) ? acceptedFriends : [];
      const isFriend = list.some((f) => f.id === targetUserId);
      const outgoingPending = (Array.isArray(sent) ? sent : []).some((r) => r.user?.id === targetUserId);
      const incomingPending = (Array.isArray(incoming) ? incoming : []).some((r) => r.user?.id === targetUserId);
      return { isFriend, outgoingPending, incomingPending };
    },
    enabled: !!user?.id && !!viewedProfile?.user_id && !isOwnProfile,
  });

  const openDirectMessageMutation = useMutation({
    mutationFn: async () => apiPost(`/api/chats/direct/${viewedProfile.id}`, {}),
    onSuccess: (chat) => {
      if (chat?.id) navigate(createPageUrl(`ChatRoom?id=${chat.id}`));
    },
    onError: (err) => {
      toast.error(err?.data?.error || 'You can only message accepted friends.');
    },
  });

  const isFriend = !!friendConnection?.isFriend;
  const hasPendingRequest = !!friendConnection?.outgoingPending;
  const isVerifiedPromoter = !!viewedProfile?.is_verified_promoter;

  const { data: promoterFollowStatus } = useQuery({
    queryKey: ['promoter-follow-status', viewedProfile?.user_id],
    queryFn: () => dataService.Promoters.followingStatus(viewedProfile.user_id),
    enabled: !!viewedProfile?.user_id && !isOwnProfile && isVerifiedPromoter,
  });

  const togglePromoterFollow = useMutation({
    mutationFn: async () => {
      if (!viewedProfile?.user_id) return null;
      const following = !!promoterFollowStatus?.following;
      if (following) return dataService.Promoters.unfollow(viewedProfile.user_id);
      return dataService.Promoters.follow(viewedProfile.user_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promoter-follow-status', viewedProfile?.user_id] });
      toast.success(promoterFollowStatus?.following ? 'Unfollowed promoter' : 'Following promoter');
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not update follow');
    },
  });

  const statDisplay = (value, fallback = 0) => {
    if (socialStatsLoading) return '—';
    if (socialStatsError) return fallback;
    return value;
  };

  const hostedCount = statDisplay(socialStats?.tablesHosted ?? 0);
  const tablesJoinedCount = statDisplay(socialStats?.tablesJoined ?? 0);
  const friendsCount = statDisplay(
    socialStats?.friendCount ?? friendsPreview.length,
    friendsPreview.length
  );
  const genderLabel =
    displayProfile?.gender === 'male'
      ? 'Male'
      : displayProfile?.gender === 'female'
        ? 'Female'
        : displayProfile?.gender === 'other'
          ? 'Other'
          : null;

  const vs = displayProfile?.verification_status;
  const showAgeVerifiedBadge =
    vs === 'verified' ||
    vs === 'approved' ||
    displayProfile?.age_verified === true ||
    (isOwnProfile && user?.identity_verified);

  if (!user || !displayProfile) {
    return <SecLoadingScreen />;
  }

  return (
    <div className="min-h-screen pb-6 lg:pb-10" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      {isMobile && isOwnProfile ? (
        <PageBackHeader title="Profile" pageName="Profile" />
      ) : null}
      <div style={{ position: 'relative', height: 160, backgroundColor: 'var(--sec-bg-elevated)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--sec-bg-base), transparent)' }} />
        
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          {!isOwnProfile && (
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          
          {isOwnProfile && (
            <div className="ml-auto flex gap-2">
              <Link
                to={createPageUrl('ProfileSetup?edit=1')}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center"
                title="Edit profile setup"
              >
                <UserPlus className="w-5 h-5" />
              </Link>
              <Link
                to={createPageUrl('EditProfile')}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center"
              >
                <Edit3 className="w-5 h-5" />
              </Link>
              <Link
                to={createPageUrl('Settings')}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center"
              >
                <Settings className="w-5 h-5" />
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-8 -mt-20 relative">
        {/* Profile Card */}
        <div className="sec-card" style={{ borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div className="flex flex-col items-center text-center mb-6">
            {/* Avatar */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <div style={{ width: 96, height: 96, borderRadius: '50%', padding: 2, backgroundColor: '#000', border: '2px solid var(--sec-accent)' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', backgroundColor: displayProfile.avatar_url ? 'var(--sec-bg-card)' : '#000' }}>
                  {displayProfile.avatar_url ? (
                    <img src={displayProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold" style={{ color: 'var(--sec-accent)' }}>
                      {(displayProfile.full_name || displayProfile.username || user?.full_name)?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              </div>
              {displayProfile.is_verified_promoter && (
                <div style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', backgroundColor: 'var(--sec-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BadgeCheck size={16} strokeWidth={2} style={{ color: 'var(--sec-bg-base)' }} />
                </div>
              )}
            </div>

            <h1 className="text-2xl font-bold">{displayProfile.username || displayProfile.full_name}</h1>
            {displayProfile.username && (
              <p className="text-gray-500 text-sm">@{displayProfile.username}</p>
            )}

            {/* Badges */}
            <div className="flex gap-2 mt-3">
              {displayProfile.is_verified_promoter && (
                <span className="sec-badge sec-badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Award size={12} strokeWidth={1.5} />
                  Verified Promoter
                </span>
              )}
              {showAgeVerifiedBadge && (
                <span className="sec-badge sec-badge-success">Age Verified</span>
              )}
            </div>

            {/* Action Buttons for Other Users */}
            {!isOwnProfile && (
              <div className="flex gap-2 mt-4">
                {isFriend ? (
                  <Button className="sec-btn sec-btn-primary flex-1">
                    <UserCheck className="w-4 h-4 mr-2" />
                    Friends
                  </Button>
                ) : hasPendingRequest ? (
                  <Button variant="outline" className="flex-1 border-[#262629]" disabled>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Request Sent
                  </Button>
                ) : (
                  <Button
                    onClick={() => sendFriendRequestMutation.mutate()}
                    className="sec-btn sec-btn-primary flex-1"
                    disabled={!viewedProfile?.user_id || sendFriendRequestMutation.isPending}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Friend
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-[#262629]"
                  disabled={!isFriend || openDirectMessageMutation.isPending}
                  onClick={() => openDirectMessageMutation.mutate()}
                  title={isFriend ? 'Message' : 'Accept friend request first'}
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
                {isVerifiedPromoter && (
                  <Button
                    variant="outline"
                    className="border-[#262629]"
                    disabled={togglePromoterFollow.isPending}
                    onClick={() => togglePromoterFollow.mutate()}
                  >
                    {promoterFollowStatus?.following ? 'Unfollow' : 'Follow'}
                  </Button>
                )}
              </div>
            )}

            {/* Location & Drink */}
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
              {displayProfile.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {displayProfile.city}
                </span>
              )}
              {genderLabel && (
                <span className="flex items-center gap-1">
                  <UserPlus className="w-4 h-4" />
                  {genderLabel}
                </span>
              )}
              {displayProfile.favorite_drink && (
                <span className="flex items-center gap-1">
                  <Wine className="w-4 h-4" />
                  {displayProfile.favorite_drink}
                </span>
              )}
            </div>

            {displayProfile.bio && (
              <p className="mt-4 text-gray-400 text-sm max-w-xs">{displayProfile.bio}</p>
            )}

            {/* Mutual friends (Friendship graph via viewer profile API) */}
            {!isOwnProfile && mutualFriendsCount > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-400">
                <Users className="w-4 h-4" />
                <span>
                  {mutualFriendsCount} mutual friend{mutualFriendsCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'center', padding: '16px 0', borderTop: '1px solid var(--sec-border)', borderBottom: '1px solid var(--sec-border)' }}>
            <div>
              <p className="text-2xl font-bold">{hostedCount}</p>
              <p className="text-xs text-gray-500">Tables Hosted</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{tablesJoinedCount}</p>
              <p className="text-xs text-gray-500">Tables Joined</p>
            </div>
            <Link to={createPageUrl('Friends')} className="cursor-pointer hover:opacity-80 transition-opacity">
              <p className="text-2xl font-bold">{friendsCount}</p>
              <p className="text-xs text-gray-500">Friends</p>
            </Link>
          </div>

          {/* Edit profile setup - only on own profile */}
          {isOwnProfile && (
            <div className="pt-4 border-t border-[#262629]">
              <Link
                to={createPageUrl('ProfileSetup?edit=1')}
                className="flex items-center gap-4 p-4 rounded-xl border transition-all"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sec-accent-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sec-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-elevated)'; }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                  <UserPlus className="w-6 h-6" style={{ color: 'var(--sec-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">Edit profile setup</p>
                  <p className="text-xs text-gray-500">Update onboarding details, verification, and payout info.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
              </Link>
            </div>
          )}

          {isOwnProfile ? (
            <RoleAccessPanel
              canAdminDashboard={canAdminDashboard}
              hasStaffAssignments={staffAssignments.length > 0}
              canReviewCompliance={!!complianceAccess?.canReview}
            />
          ) : null}

          {/* Job applications - only on own profile */}
          {isOwnProfile && (
            <div className="pt-4 border-t border-[#262629]">
              <Link
                to={createPageUrl('MyJobApplications')}
                className="flex items-center gap-4 p-4 rounded-xl border transition-all"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sec-accent-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sec-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-elevated)'; }}
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                  <Briefcase className="w-6 h-6" style={{ color: 'var(--sec-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">My Job Applications</p>
                  <p className="text-xs text-gray-500">Track your job application status (pending, accepted, rejected).</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
              </Link>
            </div>
          )}

          {/* Create additional roles - only on own profile */}
          {isOwnProfile && !userRoles.business && (
            <div className="pt-4 border-t border-[#262629]">
              <h3 className="font-semibold mb-3 text-sm text-gray-400">Account Types</h3>
              <p className="text-xs text-gray-500 mb-3">Create additional account types to unlock more features.</p>
              <div className="flex flex-col gap-3">
                <Link
                  to={createPageUrl('VenueOnboarding')}
                  className="flex items-center gap-4 p-4 rounded-xl border transition-all"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sec-accent-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sec-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-elevated)'; }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                    <Building2 className="w-6 h-6" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">Create Business Account</p>
                    <p className="text-xs text-gray-500">Manage venues, promote events, post jobs, and handle bookings.</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                </Link>
              </div>
            </div>
          )}

          {/* Interests */}
          {displayProfile.interests?.length > 0 && (
            <div className="pt-4 border-t border-[#262629]">
              <h3 className="font-semibold mb-3 text-sm text-gray-400">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {displayProfile.interests.map((interest, idx) => (
                  <span key={idx} className="px-3 py-1.5 rounded-full bg-[#0A0A0B] text-xs border border-[#262629]">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Music Preferences */}
          {displayProfile.music_preferences?.length > 0 && (
            <div className="pt-4 border-t border-[#262629]">
              <h3 className="font-semibold mb-3 text-sm text-gray-400">Music Preferences</h3>
              <div className="flex flex-wrap gap-2">
                  {displayProfile.music_preferences.map((genre, idx) => (
                  <span key={idx} className="sec-badge sec-badge-gold">
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Friends Preview */}
          {friendsPreview.length > 0 && (
            <div className="pt-4 border-t border-[#262629]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Friends</h3>
                <Link to={createPageUrl('Friends')} className="sec-link" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  See all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="flex -space-x-2">
                {friendsPreview.map((friend) => (
                  <Link
                    key={friend.id}
                    to={createPageUrl(`Profile?id=${friend.id}`)}
                    className="w-10 h-10 rounded-full border-2 border-[#141416] overflow-hidden hover:z-10 transition-transform hover:scale-110"
                  >
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'var(--sec-bg-base)', border: '1px solid var(--sec-accent)', color: 'var(--sec-accent)' }}>
                        {(friend.fullName || friend.username)?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile Content Tabs - Only for own profile */}
        {isOwnProfile && (
          <div className="glass-card rounded-2xl p-4 mb-6">
            <button
              type="button"
              onClick={() => setProfileTab('wallet')}
              className="w-full mb-4 flex items-center justify-between gap-3 p-3 rounded-xl border border-[#262629] bg-[#0A0A0B] hover:border-[var(--sec-accent-border)] transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--sec-accent-muted)' }}>
                  <Wallet className="w-5 h-5" style={{ color: 'var(--sec-accent-bright)' }} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Sec Wallet</p>
                  <p className="text-xs text-gray-500 truncate">Payouts, earnings & wallet ID</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-600 shrink-0" />
            </button>
            <Tabs value={activeProfileTab} onValueChange={setProfileTab} className="w-full">
              <SecScrollTabs
                listClassName="bg-[#0A0A0B] border border-[#262629] rounded-lg p-1"
                triggerClassName="rounded-md text-xs sm:text-[13px] data-[state=active]:bg-[#141416]"
                tabs={[
                  { value: 'activity', label: 'Activity' },
                  { value: 'tickets', label: 'Tickets' },
                  { value: 'reviews', label: 'Reviews' },
                  { value: 'interests', label: 'Interests' },
                  { value: 'wallet', label: 'Wallet' },
                  ...(hasPromotionsTab ? [{ value: 'promotions', label: 'Promotions' }] : []),
                ]}
              />

              <TabsContent value="activity" className="mt-4 space-y-4">
                {/* Active Tables */}
                {activeTables.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Users className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                      Active Tables
                    </h3>
                    <div className="space-y-3">
                      {activeTables.map((table) => (
                        <Link
                          key={table.id}
                          to={createPageUrl(`TableDetails?id=${table.id}`)}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                            <Users className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{table.name}</p>
                            <p className="text-xs text-gray-500">{table.current_guests}/{table.max_guests} guests</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-600" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interested Events */}
                {interestedEvents.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Star className="w-5 h-5" style={{ color: 'var(--sec-warning)' }} />
                      Interested Events
                    </h3>
                    <div className="space-y-3">
                      {interestedEvents.map((event) => (
                        <Link
                          key={event.id}
                          to={createPageUrl(`EventDetails?id=${event.id}`)}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                        >
                            <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                            {event.cover_image_url ? (
                              <img src={event.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{event.title}</p>
                            <p className="text-xs text-gray-500">{event.date && format(parseISO(event.date), 'MMM d')}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-600" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <TableHistorySection userId={historyUserId} isOwn limit={8} />
              </TabsContent>

              <TabsContent value="tickets" className="mt-4">
                <MyTickets userId={authUserId} />
              </TabsContent>

              <TabsContent value="reviews" className="mt-4">
                <MyReviews userId={authUserId} username={userProfile?.username} />
              </TabsContent>

              <TabsContent value="interests" className="mt-4">
                <InterestsEditor userProfile={userProfile} onProfileUpdated={mergeSelfProfileFromApi} />
              </TabsContent>

              <TabsContent value="wallet" className="mt-4">
                <UserSecWallet userProfile={userProfile} onProfileUpdated={mergeSelfProfileFromApi} />
              </TabsContent>

              {hasPromotionsTab ? (
                <TabsContent value="promotions" className="mt-4 space-y-4">
                  <PromoterPromotionsPanel
                    current={promoterHub?.active || []}
                    past={promoterHub?.past || []}
                    stats={promoterHub?.stats}
                    isOwn
                    onDismiss={(assignmentId) => dismissPromotionMutation.mutate(assignmentId)}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        )}

        {/* For other user's profiles, show activity only */}
        {!isOwnProfile && (
          <>
            {activeTables.length > 0 && (
              <div className="glass-card rounded-2xl p-4 mb-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                  Active Tables
                </h3>
                <div className="space-y-3">
                  {activeTables.map((table) => (
                    <Link
                      key={table.id}
                      to={createPageUrl(`TableDetails?id=${table.id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{table.name}</p>
                        <p className="text-xs text-gray-500">{table.current_guests}/{table.max_guests} guests</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {hasPromotionsTab ? (
              <div className="glass-card rounded-2xl p-4 mb-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                  Promotions
                </h3>
                <PromoterPromotionsPanel
                  current={profilePromotions?.current || []}
                  past={profilePromotions?.past || []}
                />
              </div>
            ) : null}

            {interestedEvents.length > 0 && (
              <div className="glass-card rounded-2xl p-4 mb-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5" style={{ color: 'var(--sec-warning)' }} />
                  Interested Events
                </h3>
                <div className="space-y-3">
                  {interestedEvents.map((event) => (
                    <Link
                      key={event.id}
                      to={createPageUrl(`EventDetails?id=${event.id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                    >
                            <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                            {event.cover_image_url ? (
                              <img src={event.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{event.title}</p>
                        <p className="text-xs text-gray-500">{event.date && format(parseISO(event.date), 'MMM d')}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Friend Requests (Own Profile Only) */}
        {isOwnProfile && incomingFriendRequests.length > 0 && (
          <div className="glass-card rounded-2xl p-4 mt-6">
            <h3 className="font-semibold mb-4 flex items-center justify-between">
              Friend Requests
              <span className="text-sm text-gray-500">({incomingFriendRequests.length})</span>
            </h3>
            <div className="space-y-3">
              {incomingFriendRequests.map((row) => (
                <FriendRequestCard key={row.friendshipId} row={row} />
              ))}
            </div>
          </div>
        )}

        {/* Sign out lives in Home + Settings only (mobile-first) */}
      </div>
    </div>
  );
}