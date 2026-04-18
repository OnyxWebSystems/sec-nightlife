import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet } from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Users, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import DMThread from '@/components/messaging/DMThread';
import GroupThread from '@/components/messaging/GroupThread';

export default function Messages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dm = searchParams.get('dm');
  const group = searchParams.get('group');
  const groupKind = searchParams.get('gk') || 'EVENT';
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');

  useEffect(() => {
    authService.getCurrentUser().then(setUser).catch(() => authService.redirectToLogin());
  }, []);

  const { data: dms = [], isLoading: dmLoading } = useQuery({
    queryKey: ['dm-conversations'],
    queryFn: () => apiGet('/api/messages/conversations'),
    enabled: !!user?.id,
    refetchInterval: 20000,
  });

  const { data: groups = [], isLoading: gLoading } = useQuery({
    queryKey: ['group-chats-mine'],
    queryFn: () => apiGet('/api/group-chats/my-chats'),
    enabled: !!user?.id,
    refetchInterval: 20000,
  });

  const combined = useMemo(() => {
    const a = (dms || []).map((c) => ({
      kind: 'dm',
      id: c.conversationId,
      name: c.participant?.fullName || c.participant?.username,
      sub: `@${c.participant?.username || 'user'}`,
      preview: c.lastMessage?.body || '',
      at: c.lastMessage?.sentAt ? new Date(c.lastMessage.sentAt) : null,
      unread: c.unreadCount || 0,
      avatarUrl: c.participant?.avatarUrl,
    }));
    const b = (groups || []).map((g) => ({
      kind: 'group',
      id: g.groupChatId,
      chatKind: g.chatKind || 'EVENT',
      name: g.eventName || 'Event',
      sub: `${g.memberCount || 0} members${g.chatKind === 'HOSTED_TABLE' ? ' · Table' : ''}`,
      preview: g.lastMessage?.body || '',
      at: g.lastMessage?.sentAt ? new Date(g.lastMessage.sentAt) : null,
      unread: g.unreadCount || 0,
      imageUrl: g.eventImageUrl,
    }));
    return [...a, ...b].sort((x, y) => (y.at?.getTime() || 0) - (x.at?.getTime() || 0));
  }, [dms, groups]);

  const filtered = combined.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matches = !q || (c.name ?? '').toLowerCase().includes(q) || (c.sub ?? '').toLowerCase().includes(q);
    if (selectedTab === 'direct') return matches && c.kind === 'dm';
    if (selectedTab === 'groups') return matches && c.kind === 'group';
    return matches;
  });

  const openChat = (c) => {
    if (c.kind === 'dm') setSearchParams({ dm: c.id });
    else setSearchParams({ group: c.id, gk: c.chatKind || 'EVENT' });
  };

  const closeThread = () => {
    setSearchParams({});
  };

  if (dm) {
    return (
      <div className="max-w-[480px] mx-auto px-2 py-4">
        <DMThread conversationId={dm} onBack={closeThread} />
      </div>
    );
  }

  if (group) {
    return (
      <div className="max-w-[480px] mx-auto px-2 py-4">
        <GroupThread groupChatId={group} chatKind={groupKind} onBack={closeThread} />
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-[480px] mx-auto pb-24" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      <header className="sticky top-0 z-40 border-b border-[var(--sec-border)] bg-black/90 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">Messages</h1>
          <Link
            to={createPageUrl('Friends')}
            className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--sec-accent)] text-black flex items-center justify-center"
          >
            <Plus className="w-5 h-5" />
          </Link>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 min-h-[44px]"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'direct', 'groups'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedTab(t)}
              className={`min-h-[44px] px-4 rounded-full text-sm font-medium ${
                selectedTab === t ? 'bg-[var(--sec-accent)] text-black' : 'bg-[#141416] text-gray-400'
              }`}
            >
              {t === 'all' ? 'All' : t === 'direct' ? 'Direct' : 'Groups'}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-3 space-y-2">
        {(dmLoading || gLoading) && <p className="text-sm text-gray-500">Loading…</p>}

        {selectedTab === 'direct' && !dmLoading && filtered.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-gray-500 text-sm">Message your friends directly. Go to the Friends page to connect.</p>
            <Link to={createPageUrl('Friends')} className="inline-block min-h-[44px] px-6 rounded-full bg-[var(--sec-accent)] text-black font-medium leading-[44px]">
              Go to Friends
            </Link>
          </div>
        )}

        {selectedTab === 'groups' && !gLoading && filtered.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-12">
            Group chats appear here when your join request to an event is accepted.
          </p>
        )}

        {filtered.map((c) => (
          <button
            key={`${c.kind}-${c.id}`}
            type="button"
            onClick={() => openChat(c)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#141416] border border-[#262629] text-left min-h-[56px]"
          >
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#262629] flex items-center justify-center flex-shrink-0">
              {c.kind === 'dm' ? (
                c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-gray-400" />
                )
              ) : c.imageUrl ? (
                <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{c.name}</p>
              <p className="text-xs text-gray-500 truncate">{c.sub}</p>
              <p className="text-xs text-gray-400 truncate">{(c.preview || '').slice(0, 40)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {c.at && (
                <span className="text-[10px] text-gray-600">{formatDistanceToNow(c.at, { addSuffix: true })}</span>
              )}
              {c.unread > 0 && (
                <span className="min-w-[22px] h-[22px] rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
                  {c.unread > 9 ? '9+' : c.unread}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
