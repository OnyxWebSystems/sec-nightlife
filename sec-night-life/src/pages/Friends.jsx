import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { apiGet, apiPost, apiDelete, apiPatch } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Search,
  UserPlus,
  MessageCircle,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const MAX_W = 'max-w-app md:max-w-app-md mx-auto';

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Friends() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'all';

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounced(searchQuery, 400);
  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends-list'],
    queryFn: () => apiGet('/api/friends'),
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ['friends-suggestions'],
    queryFn: () => apiGet('/api/friends/suggestions'),
  });

  const { data: searchResults = [], isFetching: searchFetching } = useQuery({
    queryKey: ['friends-search', debouncedSearch],
    queryFn: () => apiGet(`/api/friends/search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.trim().length > 0,
  });

  const { data: incoming = [] } = useQuery({
    queryKey: ['friends-incoming'],
    queryFn: () => apiGet('/api/friends/requests/incoming'),
  });

  const { data: sent = [] } = useQuery({
    queryKey: ['friends-sent'],
    queryFn: () => apiGet('/api/friends/requests/sent'),
  });

  const { data: activityPage } = useQuery({
    queryKey: ['friends-activity', 1],
    queryFn: () => apiGet('/api/friends/activity?page=1'),
  });

  const [activityItems, setActivityItems] = useState([]);
  const [activityPageNum, setActivityPageNum] = useState(1);
  const [activityHasMore, setActivityHasMore] = useState(false);

  useEffect(() => {
    if (activityPage?.items) {
      setActivityItems(activityPage.items);
      setActivityHasMore(!!activityPage.hasMore);
    }
  }, [activityPage]);

  const { data: reqBadge } = useQuery({
    queryKey: ['notif-friend-req'],
    queryFn: () => apiGet('/api/notifications/unread-count?type=FRIEND_REQUEST'),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (tab === 'requests') {
      apiPatch('/api/notifications/read-all', { type: 'FRIEND_REQUEST' }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['notif-friend-req'] });
    }
  }, [tab, queryClient]);

  const friendMeta = useMemo(() => {
    const m = {};
    (friends || []).forEach((f) => {
      m[f.id] = f;
    });
    return m;
  }, [friends]);

  const showList = useMemo(
    () => (!debouncedSearch.trim() ? friends : searchResults),
    [debouncedSearch, friends, searchResults],
  );

  const loadMoreActivity = async () => {
    const next = activityPageNum + 1;
    const res = await apiGet(`/api/friends/activity?page=${next}`);
    setActivityItems((prev) => [...prev, ...(res.items || [])]);
    setActivityHasMore(!!res.hasMore);
    setActivityPageNum(next);
  };

  const setTab = (t) => {
    setSearchParams({ tab: t });
  };

  const onAddFriend = async (receiverId) => {
    try {
      await apiPost('/api/friends/request', { receiverId });
      toast.success('Friend request sent');
      queryClient.invalidateQueries({ queryKey: ['friends-search'] });
      queryClient.invalidateQueries({ queryKey: ['friends-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] });
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Failed');
    }
  };

  const onAccept = async (friendshipId) => {
    try {
      await apiPost(`/api/friends/request/${friendshipId}/accept`);
      toast.success('You are now friends');
      queryClient.invalidateQueries({ queryKey: ['friends-incoming'] });
      queryClient.invalidateQueries({ queryKey: ['friends-list'] });
      queryClient.invalidateQueries({ queryKey: ['profile-social'] });
      queryClient.invalidateQueries({ queryKey: ['friends-preview-own'] });
      queryClient.invalidateQueries({ queryKey: ['user-profile-viewer'] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  const onDecline = async (friendshipId) => {
    try {
      await apiPost(`/api/friends/request/${friendshipId}/decline`);
      queryClient.invalidateQueries({ queryKey: ['friends-incoming'] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  const onCancelRequest = async (friendshipId) => {
    try {
      await apiDelete(`/api/friends/${friendshipId}`);
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] });
    } catch (e) {
      toast.error(e?.data?.error || 'Failed');
    }
  };

  return (
    <div className={`min-h-screen pb-24 ${MAX_W}`}>
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/90 backdrop-blur border-b border-[#262629]">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(createPageUrl('Home'))}
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#141416] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Friends</h1>
            <p className="text-xs text-gray-500">{friends.length} friends</p>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <Input
              placeholder="Search by name or @username"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 min-h-[44px] bg-[#141416] border-[#262629]"
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="px-2">
          <TabsList className="w-full grid grid-cols-3 bg-[#141416]">
            <TabsTrigger value="all" className="min-h-[44px]">
              All
            </TabsTrigger>
            <TabsTrigger value="requests" className="min-h-[44px] relative">
              Requests
              {(reqBadge?.count || 0) > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-600 text-[10px] flex items-center justify-center">
                  {reqBadge.count > 9 ? '9+' : reqBadge.count}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity" className="min-h-[44px]">
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4 px-4 space-y-4">
            {searchFetching && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}

            {!debouncedSearch.trim() && suggestions.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 mb-2">People you may know</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                  {suggestions.map((u) => (
                    <div
                      key={u.id}
                      className="flex-shrink-0 w-36 rounded-xl bg-[#141416] border border-[#262629] p-3"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#262629] mx-auto mb-2 overflow-hidden">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm">
                            {(u.username || u.fullName || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-medium truncate text-center">{u.fullName || u.username}</p>
                      <p className="text-[10px] text-gray-500 truncate text-center">@{u.username || 'user'}</p>
                      <Button
                        size="sm"
                        className="w-full mt-2 min-h-[44px]"
                        onClick={() => onAddFriend(u.id)}
                        disabled={u.friendshipStatus === 'PENDING_SENT'}
                      >
                        {u.friendshipStatus === 'PENDING_SENT' ? 'Sent' : 'Add Friend'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-gray-400 mb-2">
                {debouncedSearch.trim() ? 'Results' : `Your Friends (${friends.length})`}
              </h2>
              {friendsLoading ? (
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              ) : showList.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  You haven&apos;t added any friends yet. Search for people above to get started.
                </p>
              ) : (
                <ul className="space-y-2">
                  {showList.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#141416] border border-[#262629]"
                    >
                      <div className="w-11 h-11 rounded-full bg-[#262629] overflow-hidden flex-shrink-0">
                        {f.avatarUrl ? (
                          <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm">
                            {(f.username || f.fullName || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{f.fullName || f.username}</p>
                        <p className="text-xs text-gray-500 truncate">@{f.username || 'user'}</p>
                        {f.city && <p className="text-xs text-gray-600">{f.city}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        {debouncedSearch.trim() && f.friendshipStatus === 'ACCEPTED' && (f.conversationId || friendMeta[f.id]?.conversationId) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="min-h-[44px]"
                            onClick={() =>
                              navigate(
                                `${createPageUrl('Messages')}?dm=${f.conversationId || friendMeta[f.id]?.conversationId}`,
                              )
                            }
                          >
                            <MessageCircle className="w-4 h-4 mr-1" />
                            Message
                          </Button>
                        )}
                        {debouncedSearch.trim() &&
                          (f.friendshipStatus === 'NONE' || !f.friendshipStatus) && (
                            <Button
                              size="sm"
                              className="min-h-[44px]"
                              onClick={() => onAddFriend(f.id)}
                            >
                              <UserPlus className="w-4 h-4 mr-1" />
                              Add
                            </Button>
                          )}
                        {!debouncedSearch.trim() && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[40px]"
                              onClick={() =>
                                navigate(`${createPageUrl('UserProfile')}?id=${f.id}`)
                              }
                            >
                              Profile
                            </Button>
                            {f.conversationId && (
                              <Button
                                size="sm"
                                className="min-h-[40px]"
                                onClick={() =>
                                  navigate(`${createPageUrl('Messages')}?dm=${f.conversationId}`)
                                }
                              >
                                Message
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-4 px-4 space-y-6">
            <div>
              <h2 className="text-sm font-semibold mb-2">Incoming ({incoming.length})</h2>
              {incoming.length === 0 ? (
                <p className="text-gray-500 text-sm">No incoming requests</p>
              ) : (
                <ul className="space-y-2">
                  {incoming.map((row) => (
                    <li
                      key={row.friendshipId}
                      className="p-3 rounded-xl bg-[#141416] border border-[#262629] flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-[#262629] overflow-hidden">
                          {row.user.avatarUrl ? (
                            <img src={row.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {(row.user.username || '?')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{row.user.fullName}</p>
                          <p className="text-xs text-gray-500">@{row.user.username}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => onAccept(row.friendshipId)}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 min-h-[44px]"
                          onClick={() => onDecline(row.friendshipId)}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                      <Link
                        to={`${createPageUrl('UserProfile')}?id=${row.user.id}`}
                        className="text-xs text-[var(--sec-accent)]"
                      >
                        View profile
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-2">Sent</h2>
              {sent.length === 0 ? (
                <p className="text-gray-500 text-sm">No pending sent requests</p>
              ) : (
                <ul className="space-y-2">
                  {sent.map((row) => (
                    <li
                      key={row.friendshipId}
                      className="p-3 rounded-xl bg-[#141416] border border-[#262629] flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="font-medium">{row.user.fullName}</p>
                        <p className="text-xs text-gray-500">@{row.user.username}</p>
                      </div>
                      <Button variant="outline" className="min-h-[44px]" onClick={() => onCancelRequest(row.friendshipId)}>
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-4 px-4">
            {activityItems.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                Your friends&apos; activity will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {activityItems.map((a) => (
                  <li key={a.id} className="p-3 rounded-xl bg-[#141416] border border-[#262629]">
                    <div className="flex gap-2">
                      <Link to={`${createPageUrl('UserProfile')}?id=${a.user?.id || ''}`} className="w-10 h-10 rounded-full bg-[#262629] overflow-hidden flex-shrink-0">
                        {a.user?.avatarUrl ? (
                          <img src={a.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="flex items-center justify-center w-full h-full text-xs">
                            {(a.user?.username || '?')[0]}
                          </span>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="text-[var(--sec-accent)]">@{a.user?.username}</span>{' '}
                          {a.description}
                        </p>
                        {a.referenceDetails && (
                          <p className="text-xs text-gray-500 mt-1">
                            {a.referenceType === 'EVENT' &&
                              `${a.referenceDetails.title} · ${a.referenceDetails.venueName || ''}`}
                            {a.referenceType === 'TABLE' &&
                              `${a.referenceDetails.tableName} · ${a.referenceDetails.hostName || ''}`}
                            {a.referenceType === 'PROMOTION' &&
                              `${a.referenceDetails.title} · ${a.referenceDetails.venueName || ''}`}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-600 mt-1">
                          {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {activityHasMore && (
              <Button variant="outline" className="w-full mt-4 min-h-[44px]" onClick={loadMoreActivity}>
                Load more
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </header>
    </div>
  );
}
