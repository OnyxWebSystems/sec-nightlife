import React, { useState, useEffect } from 'react';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiPost } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search,
  UserPlus,
  Check
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InviteFriendsDialog({ open, onOpenChange, table, event }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);

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
    } catch (e) {}
  };

  const { data: friends = [] } = useQuery({
    queryKey: ['friends', userProfile?.friends],
    queryFn: async () => {
      if (!userProfile?.friends?.length) return [];
      const friendProfiles = await Promise.all(
        userProfile.friends.map(id => dataService.User.filter({ id }))
      );
      return friendProfiles.flat();
    },
    enabled: !!userProfile?.friends?.length,
  });

  const filteredFriends = friends.filter(friend => {
    const matchesSearch = friend.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         friend.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const notAlreadyMember = !table?.members?.some(m => m.user_id === friend.id);
    return matchesSearch && notAlreadyMember;
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await apiPost(`/api/tables/${table.id}/invite`, {
        recipient_ids: selectedFriends,
      });
    },
    onSuccess: () => {
      toast.success(`Invited ${selectedFriends.length} friend${selectedFriends.length > 1 ? 's' : ''}!`);
      setSelectedFriends([]);
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not send invites');
    },
  });

  const toggleFriend = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141416] border-[#262629] max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Friends to Table</DialogTitle>
          <DialogDescription>
            Select friends to invite to {table?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#0A0A0B] border-[#262629]"
            />
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2">
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend) => {
                const isSelected = selectedFriends.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriend(friend.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      isSelected
                        ? 'bg-[var(--sec-accent)]/20 border border-[var(--sec-accent)]'
                        : 'bg-[#0A0A0B] hover:bg-white/5'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--sec-accent)] to-[var(--sec-accent)] overflow-hidden flex-shrink-0">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                          {friend.username?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{friend.username || friend.full_name}</p>
                      {friend.city && (
                        <p className="text-xs text-gray-500">{friend.city}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[var(--sec-accent)] flex items-center justify-center">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="text-center py-8">
                <UserPlus className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No friends available to invite</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-[#262629]">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-[#262629]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={selectedFriends.length === 0 || inviteMutation.isPending}
              className="flex-1 bg-gradient-to-r from-[var(--sec-accent)] to-[var(--sec-accent)]"
            >
              {inviteMutation.isPending ? 'Sending...' : `Invite (${selectedFriends.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}