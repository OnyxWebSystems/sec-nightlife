import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/api/client';
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
  TrendingUp,
  UserPlus,
  UserCheck,
  ChevronLeft,
  MessageCircle,
  Crown,
  Building2,
  Briefcase
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { toast } from "sonner";

import FriendRequestCard from '@/components/profile/FriendRequestCard';
import MyTickets from '@/components/profile/MyTickets';
import MyReviews from '@/components/profile/MyReviews';
import InterestsEditor from '@/components/profile/InterestsEditor';

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
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
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        setUserProfile(profiles[0]);
      } else {
        navigate(createPageUrl('ProfileSetup'));
      }
    } catch (e) {
      authService.redirectToLogin(createPageUrl('Profile'));
    }
  };

  /** Merge PATCH /api/users/profile response into local state (Profile does not use React Query for own profile). */
  const mergeSelfProfileFromApi = (patch) => {
    setUserProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const isOwnProfile = !viewingUserId || viewingUserId === userProfile?.id;

  const { data: viewedProfile } = useQuery({
    queryKey: ['viewed-profile', viewingUserId],
    queryFn: async () => {
      const profiles = await dataService.User.filter({ id: viewingUserId });
      return profiles[0];
    },
    enabled: !!viewingUserId && !isOwnProfile,
  });

  const displayProfile = isOwnProfile ? userProfile : viewedProfile;

  const { data: tableHistory = [] } = useQuery({
    queryKey: ['table-history', displayProfile?.id],
    queryFn: () => dataService.TableHistory.filter({ user_id: displayProfile?.id }, '-date', 20),
    enabled: !!displayProfile?.id,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['friends', displayProfile?.friends],
    queryFn: async () => {
      if (!displayProfile?.friends?.length) return [];
      const friendProfiles = await Promise.all(
        displayProfile.friends.slice(0, 6).map(id => 
          dataService.User.filter({ id })
        )
      );
      return friendProfiles.flat();
    },
    enabled: !!displayProfile?.friends?.length,
  });

  const { data: activeTables = [] } = useQuery({
    queryKey: ['active-tables', displayProfile?.id],
    queryFn: async () => {
      if (!displayProfile?.id) return [];
      const tables = await dataService.Table.filter({ status: 'open' });
      return tables.filter(t => 
        t.members?.some(m => m.user_id === displayProfile.id)
      );
    },
    enabled: !!displayProfile?.id,
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

  const mutualFriends = React.useMemo(() => {
    if (isOwnProfile || !userProfile?.friends || !viewedProfile?.friends) return [];
    return userProfile.friends.filter(id => viewedProfile.friends.includes(id));
  }, [isOwnProfile, userProfile?.friends, viewedProfile?.friends]);

  const { data: friendRequests = [] } = useQuery({
    queryKey: ['friend-requests', userProfile?.id],
    queryFn: () => dataService.FriendRequest.filter({
      to_user_id: userProfile?.id,
      status: 'pending'
    }),
    enabled: !!userProfile?.id && isOwnProfile,
  });

  const { data: userRoles = { host: false, business: false } } = useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return { host: false, business: false };
      let hasBusiness = user?.role === 'VENUE';
      let hasHost = false;
      if (!hasBusiness) {
        try {
          const venues = await dataService.Venue.filter({ owner_user_id: user.id });
          hasBusiness = venues.length > 0;
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
      await dataService.FriendRequest.create({
        from_user_id: userProfile.id,
        to_user_id: viewedProfile.id,
        status: 'pending'
      });
    },
    onSuccess: () => {
      toast.success('Friend request sent!');
      queryClient.invalidateQueries(['friend-requests']);
      queryClient.invalidateQueries(['friend-connection', userProfile?.id, viewedProfile?.id]);
    },
  });

  const { data: friendConnection } = useQuery({
    queryKey: ['friend-connection', userProfile?.id, viewedProfile?.id],
    queryFn: async () => {
      if (!userProfile?.id || !viewedProfile?.id || isOwnProfile) return { isFriend: false, outgoingPending: false, incomingPending: false };
      const [outgoing, incoming] = await Promise.all([
        dataService.FriendRequest.filter({ from_user_id: userProfile.id }),
        dataService.FriendRequest.filter({ to_user_id: userProfile.id }),
      ]);
      const isFriend = outgoing.some((r) => r.to_user_id === viewedProfile.id && r.status === 'accepted')
        || incoming.some((r) => r.from_user_id === viewedProfile.id && r.status === 'accepted');
      const outgoingPending = outgoing.some((r) => r.to_user_id === viewedProfile.id && r.status === 'pending');
      const incomingPending = incoming.some((r) => r.from_user_id === viewedProfile.id && r.status === 'pending');
      return { isFriend, outgoingPending, incomingPending };
    },
    enabled: !!userProfile?.id && !!viewedProfile?.id && !isOwnProfile,
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

  const hostedCount = tableHistory.filter(t => t.role === 'host').length;
  const attendedCount = tableHistory.filter(t => t.role === 'attendee').length;

  if (!user || !displayProfile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="sec-spinner" style={{ margin: '0 auto 16px', width: 40, height: 40 }} />
          <p style={{ color: 'var(--sec-text-muted)' }}>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 168, backgroundColor: 'var(--sec-bg-base)' }}>
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
              {displayProfile.age_verified && (
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
                  <Button onClick={() => sendFriendRequestMutation.mutate()} className="sec-btn sec-btn-primary flex-1">
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

            {/* Mutual Friends */}
            {!isOwnProfile && mutualFriends.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-400">
                <Users className="w-4 h-4" />
                <span>{mutualFriends.length} mutual friend{mutualFriends.length > 1 ? 's' : ''}</span>
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
              <p className="text-2xl font-bold">{attendedCount}</p>
              <p className="text-xs text-gray-500">Tables Joined</p>
            </div>
            <Link to={createPageUrl('Friends')} className="cursor-pointer hover:opacity-80 transition-opacity">
              <p className="text-2xl font-bold">{displayProfile.friends?.length || 0}</p>
              <p className="text-xs text-gray-500">Friends</p>
            </Link>
          </div>

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
          {isOwnProfile && (!userRoles.host || !userRoles.business) && (
            <div className="pt-4 border-t border-[#262629]">
              <h3 className="font-semibold mb-3 text-sm text-gray-400">Account Types</h3>
              <p className="text-xs text-gray-500 mb-3">Create additional account types to unlock more features.</p>
              <div className="flex flex-col gap-3">
                {!userRoles.host && (
                  <Link
                    to={createPageUrl('CreateTable')}
                    className="flex items-center gap-4 p-4 rounded-xl border transition-all"
                    style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--sec-accent-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--sec-border)'; e.currentTarget.style.backgroundColor = 'var(--sec-bg-elevated)'; }}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                      <Crown className="w-6 h-6" style={{ color: 'var(--sec-accent)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">Create Host Account</p>
                      <p className="text-xs text-gray-500">Host events and manage tables. Create and manage your own events.</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  </Link>
                )}
                {!userRoles.business && (
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
                )}
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
          {friends.length > 0 && (
            <div className="pt-4 border-t border-[#262629]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Friends</h3>
                <Link to={createPageUrl('Friends')} className="sec-link" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  See all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="flex -space-x-2">
                {friends.map((friend) => (
                  <Link
                    key={friend.id}
                    to={createPageUrl(`Profile?id=${friend.id}`)}
                    className="w-10 h-10 rounded-full border-2 border-[#141416] overflow-hidden hover:z-10 transition-transform hover:scale-110"
                  >
                    {friend.avatar_url ? (
                      <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'var(--sec-bg-base)', border: '1px solid var(--sec-accent)', color: 'var(--sec-accent)' }}>
                        {(friend.full_name || friend.username)?.[0]?.toUpperCase() || 'U'}
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
            <Tabs defaultValue="activity" className="w-full">
              <TabsList className="w-full bg-[#0A0A0B] border border-[#262629]">
                <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
                <TabsTrigger value="tickets" className="flex-1">Tickets</TabsTrigger>
                <TabsTrigger value="reviews" className="flex-1">Reviews</TabsTrigger>
                <TabsTrigger value="interests" className="flex-1">Interests</TabsTrigger>
              </TabsList>

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

                {/* Table History */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
                    Table History
                  </h3>
                  {tableHistory.length > 0 ? (
                    <div className="space-y-3">
                      {tableHistory.slice(0, 5).map((history, index) => (
                        <motion.div
                          key={history.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]"
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            history.role === 'host' 
                              ? 'bg-[var(--sec-accent-muted)] text-[var(--sec-accent)]' 
                              : 'bg-[var(--sec-success-muted)] text-[var(--sec-success)]'
                          }`}>
                            <Users className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{history.event_name}</p>
                            <p className="text-xs text-gray-500">
                              {history.venue_name} • {history.date && format(parseISO(history.date), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            history.role === 'host'
                              ? 'bg-[var(--sec-accent-muted)] text-[var(--sec-accent)]'
                              : 'bg-[var(--sec-success-muted)] text-[var(--sec-success)]'
                          }`}>
                            {history.role}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No table history yet</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="tickets" className="mt-4">
                <MyTickets userId={userProfile?.id} />
              </TabsContent>

              <TabsContent value="reviews" className="mt-4">
                <MyReviews userId={userProfile?.id} />
              </TabsContent>

              <TabsContent value="interests" className="mt-4">
                <InterestsEditor userProfile={userProfile} onProfileUpdated={mergeSelfProfileFromApi} />
              </TabsContent>
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
        {isOwnProfile && friendRequests.length > 0 && (
          <div className="glass-card rounded-2xl p-4 mt-6">
            <h3 className="font-semibold mb-4 flex items-center justify-between">
              Friend Requests
              <span className="text-sm text-gray-500">({friendRequests.length})</span>
            </h3>
            <div className="space-y-3">
              {friendRequests.map((request) => (
                <FriendRequestCard key={request.id} request={request} />
              ))}
            </div>
          </div>
        )}

        {/* Sign out lives in Home + Settings only (mobile-first) */}
      </div>
    </div>
  );
}