import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { 
  MessageCircle,
  Search,
  Plus,
  Users,
  User,
  Briefcase
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { formatDistanceToNow, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

export default function Messages() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (e) {
      authService.redirectToLogin();
    }
  };

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['chats', user?.id],
    queryFn: async () => dataService.Chat.list('-last_message_at', 100),
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedTab === 'direct') return matchesSearch && chat.type === 'direct';
    if (selectedTab === 'groups') return matchesSearch && chat.type === 'table';
    return matchesSearch;
  });

  const showEmptyChatState =
    filteredChats.length === 0 &&
    !isLoading;

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'direct', label: 'Direct' },
    { value: 'groups', label: 'Groups' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div className="px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Messages</h1>
            <Link 
              to={createPageUrl('Friends')}
              style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            >
              <Plus className="w-5 h-5" />
            </Link>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search size={20} strokeWidth={1.5} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sec-input w-full pl-12 h-12"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 lg:px-8 pb-4">
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedTab(tab.value)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  backgroundColor: selectedTab === tab.value ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
                  color: selectedTab === tab.value ? 'var(--sec-bg-base)' : 'var(--sec-text-muted)',
                  border: `1px solid ${selectedTab === tab.value ? 'var(--sec-accent)' : 'var(--sec-border)'}`
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-4">
        {/* Chats List */}
        <div className="space-y-2">
          {filteredChats.map((chat, index) => {
            const unreadCount = chat.unread_counts?.[user?.id] || 0;
            const lastMessageAt = chat.last_message_at || chat.lastMessageAt || null;
            const lastMessagePreview = chat.last_message || chat.lastMessage || 'No messages yet';
            
            return (
              <motion.div
                key={chat.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <Link
                  to={createPageUrl(`ChatRoom?id=${chat.id}`)}
                  className="sec-card flex items-center gap-3 p-3 rounded-xl transition-colors"
                >
                  {/* Avatar */}
                  <div style={{
                    position: 'relative',
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--sec-accent-muted)',
                    border: '1px solid var(--sec-accent-border)'
                  }}>
                    {chat.avatar_url ? (
                      <img src={chat.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : chat.type === 'table' ? (
                      <Users size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                    ) : chat.type === 'group' ? (
                      <Users size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                    ) : chat.type === 'job_negotiation' ? (
                      <Briefcase size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                    ) : (
                      <User size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                    )}
                    
                    {/* Online indicator */}
                    {chat.type === 'direct' && (
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', backgroundColor: 'var(--sec-success)', border: '2px solid var(--sec-bg-card)' }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold truncate">{chat.name || 'Chat'}</h3>
                      {lastMessageAt && (
                        <span style={{ fontSize: 11, color: 'var(--sec-text-muted)', flexShrink: 0 }}>
                          {formatDistanceToNow(parseISO(lastMessageAt), { addSuffix: false })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-sm text-gray-500 truncate pr-4">
                        {lastMessagePreview}
                      </p>
                      {unreadCount > 0 && (
                        <span style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Empty State */}
        {showEmptyChatState && (
          <div className="text-center py-20">
            <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <MessageCircle size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No conversations yet</h3>
            <p style={{ color: 'var(--sec-text-muted)' }}>Start chatting by joining a table or messaging someone</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="sec-card flex items-center gap-3 p-3 rounded-xl animate-pulse">
                <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--sec-border)' }} />
                <div className="flex-1">
<div style={{ height: 16, width: 96, borderRadius: 4, backgroundColor: 'var(--sec-border)', marginBottom: 8 }} />
                <div style={{ height: 12, width: 160, borderRadius: 4, backgroundColor: 'var(--sec-border)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}