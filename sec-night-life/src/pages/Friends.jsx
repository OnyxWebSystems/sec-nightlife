import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { 
  ChevronLeft,
  Search,
  Users,
  UserPlus,
  Calendar,
  MapPin,
  Sparkles
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from 'framer-motion';

import FriendRequestCard from '@/components/profile/FriendRequestCard';

export default function Friends() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        setUserProfile(profiles[0]);
      }
    } catch (e) {
      authService.redirectToLogin();
    }
  };

  const { data: friends = [] } = useQuery({
    queryKey: ['all-friends', userProfile?.friends],
    queryFn: async () => {
      if (!userProfile?.friends?.length) return [];
      const friendProfiles = await Promise.all(
        userProfile.friends.map(id => dataService.User.filter({ id }))
      );
      return friendProfiles.flat();
    },
    enabled: !!userProfile?.friends?.length,
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ['friend-requests', userProfile?.id],
    queryFn: () => dataService.FriendRequest.filter({ 
      to_user_id: userProfile?.id, 
      status: 'pending' 
    }),
    enabled: !!userProfile?.id,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => dataService.Table.filter({ status: 'open' }),
  });

  const filteredFriends = friends.filter(friend =>
    friend.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get friends' event activity
  const friendsActivity = friends.map(friend => {
    const friendTables = tables.filter(table => 
      table.members?.some(m => m.user_id === friend.id)
    );
    const friendEvents = events.filter(event => 
      friend.interested_events?.includes(event.id) ||
      friendTables.some(t => t.event_id === event.id)
    );
    return { friend, events: friendEvents, tables: friendTables };
  }).filter(a => a.events.length > 0);

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 py-4 flex items-center gap-4">
          <button 
            onClick={() => navigate(createPageUrl('Home'))}
            className="w-10 h-10 rounded-full bg-[#141416] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Friends</h1>
            <p className="text-sm text-gray-500">{friends.length} friends</p>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <Input
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 h-12 bg-[#141416] border-[#262629] rounded-xl"
            />
          </div>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-6">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[#141416] mb-6">
            <TabsTrigger value="all">All Friends</TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              {friendRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-[#FF3366] text-xs">
                  {friendRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* All Friends */}
          <TabsContent value="all" className="space-y-3">
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend, index) => (
                <motion.div
                  key={friend.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <FriendCard friend={friend} />
                </motion.div>
              ))
            ) : (
              <div className="text-center py-20">
                <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? 'No friends found' : 'No friends yet'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery ? 'Try a different search' : 'Add friends to see them here'}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Friend Requests */}
          <TabsContent value="requests" className="space-y-3">
            {friendRequests.length > 0 ? (
              friendRequests.map((request) => (
                <FriendRequestCard key={request.id} request={request} />
              ))
            ) : (
              <div className="text-center py-20">
                <UserPlus className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No pending requests</h3>
                <p className="text-gray-500 text-sm">Friend requests will appear here</p>
              </div>
            )}
          </TabsContent>

          {/* Friends Activity */}
          <TabsContent value="activity" className="space-y-4">
            {friendsActivity.length > 0 ? (
              friendsActivity.map((activity) => (
                <div key={activity.friend.id} className="glass-card rounded-2xl p-4">
                  <Link to={createPageUrl(`Profile?id=${activity.friend.id}`)} className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] overflow-hidden">
                      {activity.friend.avatar_url ? (
                        <img src={activity.friend.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {activity.friend.username?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{activity.friend.username || activity.friend.full_name}</p>
                      <p className="text-sm text-gray-500">{activity.events.length} upcoming events</p>
                    </div>
                  </Link>

                  <div className="space-y-2">
                    {activity.events.slice(0, 3).map((event) => (
                      <Link
                        key={event.id}
                        to={createPageUrl(`EventDetails?id=${event.id}`)}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-[#FF3366]/20 to-[#7C3AED]/20 flex-shrink-0">
                          {event.cover_image_url ? (
                            <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Calendar className="w-5 h-5 text-[#FF3366]" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{event.title}</p>
                          <p className="text-xs text-gray-500">{event.city}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-20">
                <Sparkles className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
                <p className="text-gray-500 text-sm">Your friends' event activity will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FriendCard({ friend }) {
  return (
    <Link
      to={createPageUrl(`Profile?id=${friend.id}`)}
      className="flex items-center gap-4 p-4 glass-card rounded-2xl hover:bg-white/5 transition-colors"
    >
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] overflow-hidden flex-shrink-0">
        {friend.avatar_url ? (
          <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold">
            {friend.username?.[0] || 'U'}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{friend.username || friend.full_name}</p>
        {friend.city && (
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {friend.city}
          </p>
        )}
      </div>
    </Link>
  );
}