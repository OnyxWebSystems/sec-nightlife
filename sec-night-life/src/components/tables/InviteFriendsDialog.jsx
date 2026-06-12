import React, { useState, useEffect, useMemo } from 'react';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function InviteFriendsDialog({ open, onOpenChange, table, event, source = 'legacy' }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const debouncedSearch = useDebouncedValue(searchQuery, 320);

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
    } catch {
      /* optional auth */
    }
  };

  const memberIds = useMemo(() => {
    const ids = new Set();
    for (const m of table?.members || []) {
      const id = m.user_id || m.userId;
      if (id) ids.add(id);
    }
    return ids;
  }, [table?.members]);

  const { data: friends = [] } = useQuery({
    queryKey: ['friends', userProfile?.friends],
    queryFn: async () => {
      if (!userProfile?.friends?.length) return [];
      const friendProfiles = await Promise.all(
        userProfile.friends.map((id) => dataService.User.filter({ id })),
      );
      return friendProfiles.flat();
    },
    enabled: !!userProfile?.friends?.length,
  });

  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ['invite-user-search', debouncedSearch],
    queryFn: () => apiGet(`/api/host/invite-user-search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: source === 'hosted' && debouncedSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const normalizedFriends = friends.map((f) => ({
    id: f.id,
    username: f.username,
    fullName: f.full_name || f.fullName,
    avatarUrl: f.avatar_url || f.avatarUrl,
    city: f.city,
    gender: f.gender,
    isFriend: true,
  }));

  const normalizedSearch = (Array.isArray(searchResults) ? searchResults : []).map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl,
    isFriend: false,
  }));

  const combinedUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const seen = new Set();
    const out = [];

    const push = (u) => {
      if (!u?.id || seen.has(u.id) || memberIds.has(u.id) || u.id === user?.id) return;
      if (q) {
        const match =
          (u.username || '').toLowerCase().includes(q) ||
          (u.fullName || '').toLowerCase().includes(q);
        if (!match && !u.fromSearch) return;
      }
      seen.add(u.id);
      out.push(u);
    };

    normalizedFriends.forEach((f) => push(f));
    if (source === 'hosted' && debouncedSearch.trim().length >= 2) {
      normalizedSearch.forEach((u) => push({ ...u, fromSearch: true }));
    }

    return out.sort((a, b) => Number(b.isFriend) - Number(a.isFriend));
  }, [normalizedFriends, normalizedSearch, searchQuery, debouncedSearch, memberIds, user?.id, source]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (source === 'hosted') {
        for (const friendId of selectedFriends) {
          await apiPost(`/api/host/tables/${table.id}/invite`, { inviteeUserId: friendId });
        }
        return;
      }
      await apiPost(`/api/tables/${table.id}/invite`, {
        recipient_ids: selectedFriends,
      });
    },
    onSuccess: () => {
      toast.success(`Invited ${selectedFriends.length} friend${selectedFriends.length > 1 ? 's' : ''}!`);
      setSelectedFriends([]);
      queryClient.invalidateQueries({ queryKey: ['hosted-table-detail', table?.id] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not send invites');
    },
  });

  const toggleFriend = (friendId) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId],
    );
  };

  const genderLabel = (value) =>
    value === 'male' ? 'Male' : value === 'female' ? 'Female' : value === 'other' ? 'Other' : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#121214] border border-[rgba(212,175,55,0.18)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Invite to table</DialogTitle>
          <DialogDescription>
            Search users or pick friends for {table?.name || table?.tableName || 'this table'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder={source === 'hosted' ? 'Search by username or name…' : 'Search friends…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#0A0A0B] border-[rgba(212,175,55,0.15)]"
            />
            {searchLoading && source === 'hosted' && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--sec-accent)]" />
            )}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2">
            {combinedUsers.length > 0 ? (
              combinedUsers.map((friend) => {
                const isSelected = selectedFriends.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => toggleFriend(friend.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      isSelected
                        ? 'bg-[var(--sec-accent)]/20 border border-[var(--sec-accent)]'
                        : 'bg-[#0A0A0B] hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--sec-accent)]/40 to-[var(--sec-accent)]/10 overflow-hidden flex-shrink-0 border border-[rgba(212,175,55,0.25)]">
                      {friend.avatarUrl ? (
                        <img src={friend.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-sm text-[var(--sec-accent)]">
                          {friend.username?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm text-white">
                        {friend.username || friend.fullName}
                        {friend.isFriend && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--sec-accent)]">
                            Friend
                          </span>
                        )}
                      </p>
                      {friend.fullName && friend.username && (
                        <p className="text-xs text-gray-500">{friend.fullName}</p>
                      )}
                      {genderLabel(friend.gender) && (
                        <p className="text-xs text-gray-500">{genderLabel(friend.gender)}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[var(--sec-accent)] flex items-center justify-center">
                        <Check className="w-4 h-4 text-black" />
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="text-center py-8">
                <UserPlus className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {source === 'hosted' && searchQuery.trim().length >= 2 && !searchLoading
                    ? 'No users found'
                    : 'No friends available to invite'}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-[rgba(212,175,55,0.12)]">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 border-[#262629]">
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={selectedFriends.length === 0 || inviteMutation.isPending}
              className="flex-1 bg-gradient-to-r from-[#c9a227] to-[#d4af37] text-black font-semibold"
            >
              {inviteMutation.isPending ? 'Sending…' : `Invite (${selectedFriends.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
