import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { 
  ChevronLeft,
  Users,
  TrendingUp,
  DollarSign,
  Star,
  MapPin,
  Wine,
  BadgeCheck,
  Award,
  UserCheck,
  UserPlus,
  MessageCircle,
  Calendar
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

export default function UserProfile() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);

  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('id');

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
      const profiles = await dataService.User.filter({ created_by: user.email });
      if (profiles.length > 0) {
        setCurrentUserProfile(profiles[0]);
      }
    } catch (e) {
      console.log('Not logged in');
    }
  };

  const { data: viewedProfile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const profiles = await dataService.User.filter({ id: userId });
      return profiles[0];
    },
    enabled: !!userId,
  });

  const { data: tableHistory = [] } = useQuery({
    queryKey: ['user-table-history', userId],
    queryFn: () => dataService.TableHistory.filter({ user_id: userId }, '-date', 50),
    enabled: !!userId,
  });

  const { data: activeTables = [] } = useQuery({
    queryKey: ['user-active-tables', userId],
    queryFn: async () => {
      const tables = await dataService.Table.filter({ status: 'open' });
      return tables.filter(t => 
        t.host_user_id === userId || t.members?.some(m => m.user_id === userId)
      );
    },
    enabled: !!userId,
  });

  const isOwnProfile = currentUserProfile?.id === userId;
  const isFriend = currentUserProfile?.friends?.includes(userId);

  const hostedTables = tableHistory.filter(t => t.role === 'host');
  const attendedTables = tableHistory.filter(t => t.role === 'attendee');
  const totalContributions = tableHistory.reduce((sum, t) => sum + (t.contribution || 0), 0);
  const averageContribution = attendedTables.length > 0 ? totalContributions / attendedTables.length : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-[#00D4AA] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!viewedProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">User not found</h2>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="relative h-48 bg-gradient-to-br from-[#FF3366]/30 to-[#7C3AED]/30">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] to-transparent" />
        <div className="absolute top-4 left-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 lg:px-8 -mt-20 relative">
        {/* Profile Card */}
        <div className="glass-card rounded-3xl p-6 mb-6">
          <div className="flex flex-col items-center text-center mb-6">
            {/* Avatar */}
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] p-0.5">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#141416]">
                  {viewedProfile.avatar_url ? (
                    <img src={viewedProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold">
                      {viewedProfile.username?.[0] || 'U'}
                    </div>
                  )}
                </div>
              </div>
              {viewedProfile.is_verified_promoter && (
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#FFD700] flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5 text-black" />
                </div>
              )}
            </div>

            <h1 className="text-2xl font-bold">{viewedProfile.username || 'User'}</h1>
            {viewedProfile.username && (
              <p className="text-gray-500 text-sm">@{viewedProfile.username}</p>
            )}

            {/* Badges */}
            {viewedProfile.is_verified_promoter && (
              <span className="px-3 py-1 rounded-full bg-[#FFD700]/20 text-[#FFD700] text-xs font-medium flex items-center gap-1 mt-3">
                <Award className="w-3 h-3" />
                Verified Promoter
              </span>
            )}

            {/* Action Buttons */}
            {!isOwnProfile && currentUserProfile && (
              <div className="flex gap-2 mt-4">
                <Button className="flex-1 bg-gradient-to-r from-[#FF3366] to-[#7C3AED]">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {isFriend ? 'Friends' : 'Add Friend'}
                </Button>
                <Button variant="outline" className="border-[#262629]">
                  <MessageCircle className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Location & Drink */}
            <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
              {viewedProfile.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {viewedProfile.city}
                </span>
              )}
              {viewedProfile.favorite_drink && (
                <span className="flex items-center gap-1">
                  <Wine className="w-4 h-4" />
                  {viewedProfile.favorite_drink}
                </span>
              )}
            </div>

            {viewedProfile.bio && (
              <p className="mt-4 text-gray-400 text-sm max-w-xs">{viewedProfile.bio}</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 text-center py-4 border-y border-[#262629]">
            <div>
              <p className="text-2xl font-bold text-[#FF3366]">{hostedTables.length}</p>
              <p className="text-xs text-gray-500">Hosted</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#00D4AA]">{attendedTables.length}</p>
              <p className="text-xs text-gray-500">Attended</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#7C3AED]">R{totalContributions.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Total Spent</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#FFD700]">R{Math.round(averageContribution)}</p>
              <p className="text-xs text-gray-500">Avg/Table</p>
            </div>
          </div>
        </div>

        {/* Active Tables */}
        {activeTables.length > 0 && (
          <div className="glass-card rounded-2xl p-4 mb-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#FF3366]" />
              Active Tables
            </h3>
            <div className="space-y-3">
              {activeTables.map((table) => (
                <Link
                  key={table.id}
                  to={createPageUrl(`TableDetails?id=${table.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B] hover:bg-white/5 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF3366]/20 to-[#7C3AED]/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#FF3366]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{table.name}</p>
                    <p className="text-xs text-gray-500">
                      {table.host_user_id === userId ? 'Host' : 'Member'} • {table.current_guests}/{table.max_guests} guests
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Table History */}
        <div className="glass-card rounded-2xl p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#00D4AA]" />
            Table History
          </h3>
          
          {tableHistory.length > 0 ? (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="w-full bg-[#0A0A0B] border border-[#262629] mb-4">
                <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                <TabsTrigger value="hosted" className="flex-1">Hosted</TabsTrigger>
                <TabsTrigger value="attended" className="flex-1">Attended</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-3">
                {tableHistory.slice(0, 10).map((history, index) => (
                  <motion.div
                    key={history.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      history.role === 'host' 
                        ? 'bg-[#FF3366]/20 text-[#FF3366]' 
                        : 'bg-[#00D4AA]/20 text-[#00D4AA]'
                    }`}>
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{history.event_name}</p>
                      <p className="text-xs text-gray-500">
                        {history.venue_name} • {format(parseISO(history.date), 'MMM d, yyyy')}
                      </p>
                      {history.contribution > 0 && (
                        <p className="text-xs text-[#00D4AA] mt-1">
                          Contributed: R{history.contribution.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      history.role === 'host'
                        ? 'bg-[#FF3366]/20 text-[#FF3366]'
                        : 'bg-[#00D4AA]/20 text-[#00D4AA]'
                    }`}>
                      {history.role}
                    </span>
                  </motion.div>
                ))}
              </TabsContent>

              <TabsContent value="hosted" className="space-y-3">
                {hostedTables.slice(0, 10).map((history, index) => (
                  <motion.div
                    key={history.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#FF3366]/20 text-[#FF3366] flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{history.event_name}</p>
                      <p className="text-xs text-gray-500">
                        {history.venue_name} • {format(parseISO(history.date), 'MMM d, yyyy')}
                      </p>
                      {history.table_total_spend > 0 && (
                        <p className="text-xs text-[#FFD700] mt-1">
                          Total Spend: R{history.table_total_spend.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </TabsContent>

              <TabsContent value="attended" className="space-y-3">
                {attendedTables.slice(0, 10).map((history, index) => (
                  <motion.div
                    key={history.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#0A0A0B]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#00D4AA]/20 text-[#00D4AA] flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{history.event_name}</p>
                      <p className="text-xs text-gray-500">
                        {history.venue_name} • {format(parseISO(history.date), 'MMM d, yyyy')}
                      </p>
                      {history.contribution > 0 && (
                        <p className="text-xs text-[#00D4AA] mt-1">
                          Contributed: R{history.contribution.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No table history yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}