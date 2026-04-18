import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { integrations } from '@/services/integrationService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ChevronLeft,
  Send,
  Info,
  Paperclip
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function ChatRoom() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState(null);
  
  const [searchParams] = useSearchParams();
  const chatId = searchParams.get('id');
  const tableId = searchParams.get('table');

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Get or create chat for table
  const { data: chat, isLoading: chatLoading, isError: chatError } = useQuery({
    queryKey: ['chat', chatId, tableId],
    queryFn: async () => {
      if (chatId) {
        const chats = await dataService.Chat.filter({ id: chatId });
        return chats[0];
      }
      
      if (tableId) {
        // Check if chat exists for this table
        const existingChats = await dataService.Chat.filter({ related_table_id: tableId });
        if (existingChats.length > 0) {
          return existingChats[0];
        }
        
        // Create new table chat
        const tables = await dataService.Table.filter({ id: tableId });
        const table = tables[0];
        
        if (!table) return null;
        
        const memberIds = table.members?.map(m => m.user_id) || [];
        const participants = [table.host_user_id, ...memberIds].filter(Boolean);
        
        const newChat = await dataService.Chat.create({
          type: 'table',
          name: `${table.name} Chat`,
          participants: [...new Set(participants)],
          admins: [table.host_user_id],
          related_table_id: tableId,
        });
        
        return newChat;
      }
      
      return null;
    },
    enabled: !!user && (!!chatId || !!tableId),
  });

  const { data: messages = [], isError: messagesError } = useQuery({
    queryKey: ['messages', chat?.id],
    queryFn: () => dataService.Message.filter({ chat_id: chat.id }, 'created_date', 500),
    enabled: !!chat?.id,
    refetchInterval: 8000,
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const { data: participants = [] } = useQuery({
    queryKey: ['chat-participants', chat?.id, chat?.participants, chat?.related_table_id, chat?.relatedTableId],
    queryFn: async () => {
      const participantIds = new Set(chat?.participants || []);
      const tableRef = chat?.related_table_id || chat?.relatedTableId;
      if (participantIds.size === 0 && chat?.type === 'table' && tableRef) {
        const tables = await dataService.Table.filter({ id: tableRef });
        const table = tables?.[0];
        if (table?.host_user_id) participantIds.add(table.host_user_id);
        (table?.members || []).forEach((m) => {
          if (m?.user_id) participantIds.add(m.user_id);
        });
      }
      if (participantIds.size === 0) return [];
      const profiles = await Promise.all(
        [...participantIds].map(id => dataService.User.filter({ id }))
      );
      return profiles.flat();
    },
    enabled: !!chat?.id,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, type = 'text', mediaUrl = null }) => {
      const newMessage = await dataService.Message.create({
        chat_id: chat.id,
        sender_id: user.id,
        content,
        message_type: type,
        media_url: mediaUrl,
        read_by: [user.id],
      });

      await dataService.Chat.update(chat.id, {
        last_message: type === 'image' ? '📷 Image' : content,
        last_message_at: new Date().toISOString(),
        last_message_by: user.id,
      });

      return newMessage;
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['messages', chat?.id] });
      setTimeout(scrollToBottom, 100);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to send message');
    },
  });

  const reactToMessageMutation = useMutation({
    mutationFn: async ({ messageId, reaction }) => {
      const msg = messages.find(m => m.id === messageId);
      if (!msg) return;
      const reactions = msg.reactions || {};
      const userReactions = reactions[user.id] || [];
      
      const updatedReactions = userReactions.includes(reaction)
        ? userReactions.filter(r => r !== reaction)
        : [...userReactions, reaction];
      
      await dataService.Message.update(messageId, {
        reactions: {
          ...reactions,
          [user.id]: updatedReactions
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chat?.id] });
      setSelectedReaction(null);
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to react to message');
    },
  });

  const handleSend = (e) => {
    e.preventDefault();
    if (message.trim() && !sendMessageMutation.isPending) {
      const mentions = extractMentions(message);
      sendMessageMutation.mutate({ content: message.trim(), mentions });
    }
  };

  const handleMediaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      await sendMessageMutation.mutateAsync({ 
        content: file.name, 
        type: 'image',
        mediaUrl: file_url 
      });
    } catch (error) {
      toast.error(error?.message || 'Media upload failed');
    } finally {
      setUploadingMedia(false);
    }
  };

  const extractMentions = (text) => {
    const mentionRegex = /@(\w+)/g;
    const matches = text.match(mentionRegex);
    return matches ? matches.map(m => m.substring(1)) : [];
  };

  const renderMessageContent = (content) => {
    return content.split(/(@\w+)/g).map((part, idx) => {
      if (part.startsWith('@')) {
        const username = part.substring(1);
        const mentioned = participants.find(p => p.username === username);
        return (
          <Link
            key={idx}
            to={createPageUrl(`Profile?id=${mentioned?.id}`)}
            className="text-[var(--sec-success)] font-semibold hover:underline"
          >
            {part}
          </Link>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  if (chatLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-[var(--sec-success)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (chatError || messagesError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Unable to load chat</h2>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Chat not found</h2>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0B]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/95 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-[#141416] flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-semibold">{chat.name || 'Chat'}</h1>
              <p className="text-xs text-gray-500">
                {chat.participants?.length || 0} members
              </p>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-[#141416] flex items-center justify-center">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, index) => {
          const isOwn = msg.sender_id === user?.id;
          const sender = participants.find(p => p.id === msg.sender_id);
          const showAvatar = !isOwn && (index === 0 || messages[index - 1]?.sender_id !== msg.sender_id);
          const allReactions = msg.reactions || {};
          const reactionCounts = {};
          Object.values(allReactions).forEach(userReacts => {
            userReacts.forEach(r => {
              reactionCounts[r] = (reactionCounts[r] || 0) + 1;
            });
          });
          
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {showAvatar && !isOwn ? (
                <Link to={createPageUrl(`Profile?id=${sender?.id}`)} className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--sec-accent)] to-[var(--sec-accent)] overflow-hidden">
                    {sender?.avatar_url ? (
                      <img src={sender.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold">
                        {sender?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                </Link>
              ) : !isOwn && <div className="w-8" />}
              
              <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                {showAvatar && !isOwn && sender?.username && (
                  <span className="text-xs text-gray-500 px-2 mb-1">@{sender.username}</span>
                )}
                <div className="relative group">
                  <div
                    onClick={() => setSelectedReaction(selectedReaction === msg.id ? null : msg.id)}
                    className={`px-4 py-2 rounded-2xl cursor-pointer ${
                      isOwn
                        ? 'bg-gradient-to-r from-[var(--sec-success)] to-[var(--sec-success)]/80 text-white rounded-br-sm'
                        : 'bg-[#141416] text-white rounded-bl-sm'
                    }`}
                  >
                    {msg.message_type === 'image' ? (
                      <img src={msg.media_url} alt="" className="max-w-full rounded-lg" />
                    ) : (
                      <p className="text-sm">{renderMessageContent(msg.content)}</p>
                    )}
                  </div>
                  
                  {/* Reactions */}
                  {Object.keys(reactionCounts).length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {Object.entries(reactionCounts).map(([emoji, count]) => (
                        <span key={emoji} className="px-2 py-0.5 rounded-full bg-[#141416] text-xs flex items-center gap-1">
                          {emoji} {count}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Reaction Picker */}
                  <AnimatePresence>
                    {selectedReaction === msg.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute bottom-full mb-2 bg-[#141416] border border-[#262629] rounded-xl p-2 flex gap-2 shadow-lg"
                      >
                        {['❤️', '👍', '😂', '😮', '😢', '🔥'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => reactToMessageMutation.mutate({ messageId: msg.id, reaction: emoji })}
                            className="text-xl hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <span className="text-xs text-gray-500 mt-1 px-2">
                  {msg.created_date && format(parseISO(msg.created_date), 'HH:mm')}
                </span>
              </div>
            </motion.div>
          );
        })}
        
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex gap-2 items-center text-gray-500 text-sm px-4">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{typingUsers[0]} is typing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#262629] p-4 bg-[#0A0A0B]">
        <form onSubmit={handleSend} className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleMediaUpload}
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              variant="outline"
              className="h-12 w-12 p-0 border-[#262629]"
            >
              {uploadingMedia ? (
                <div className="w-5 h-5 rounded-full border-2 border-[var(--sec-success)] border-t-transparent animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </Button>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message... (@mention users)"
              className="flex-1 h-12 bg-[#141416] border-[#262629] rounded-xl"
            />
            <Button
              type="submit"
              disabled={!message.trim() || sendMessageMutation.isPending}
              className="h-12 w-12 p-0 rounded-xl bg-gradient-to-r from-[var(--sec-success)] to-[var(--sec-success)]/80"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}