import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Send, Users, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost, apiDelete } from '@/api/client';
import { format } from 'date-fns';
import * as authService from '@/services/authService';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';

export default function GroupThread({ groupChatId, chatKind = 'EVENT', onBack }) {
  const [me, setMe] = useState(null);
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const lastPollRef = useRef(null);

  const apiBase =
    chatKind === 'HOSTED_TABLE'
      ? `/api/group-chats/hosted-table/${groupChatId}`
      : `/api/group-chats/${groupChatId}`;

  useEffect(() => {
    authService.getCurrentUser().then(setMe).catch(() => {});
  }, []);

  const loadDetail = async () => {
    const d = await apiGet(apiBase);
    setDetail(d);
  };

  const loadMessages = async () => {
    const rows = await apiGet(`${apiBase}/messages`);
    setMessages(rows || []);
    if (rows?.length) lastPollRef.current = rows[rows.length - 1]?.sentAt;
  };

  useEffect(() => {
    loadDetail();
    loadMessages();
    const id = setInterval(async () => {
      try {
        const rows = await apiGet(`${apiBase}/messages`);
        if (!rows?.length) return;
        const last = rows[rows.length - 1];
        if (lastPollRef.current && new Date(last.sentAt) <= new Date(lastPollRef.current)) return;
        const el = containerRef.current;
        const nearBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (!nearBottom && rows.length > messages.length) setShowNew(true);
        setMessages(rows);
        lastPollRef.current = last.sentAt;
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [groupChatId, chatKind]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const t = body.trim();
    if (!t) return;
    await apiPost(`${apiBase}/messages`, { body: t });
    setBody('');
    setShowNew(false);
    await loadMessages();
  };

  const deleteHostedChat = async () => {
    if (chatKind !== 'HOSTED_TABLE' || !detail?.isHost) return;
    if (!window.confirm('Delete this table group chat?')) return;
    setDeleting(true);
    try {
      await apiDelete(apiBase);
      toast.success('Group chat deleted');
      onBack();
    } catch (e) {
      toast.error(e?.message || 'Could not delete');
    } finally {
      setDeleting(false);
    }
  };

  const scrollBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNew(false);
  };

  const title =
    detail?.chatKind === 'HOSTED_TABLE'
      ? detail?.name || detail?.hostedTable?.tableName
      : detail?.eventName || detail?.name || 'Group';

  return (
    <div className="flex flex-col min-h-[70vh] max-w-app md:max-w-app-md mx-auto border border-[#262629] rounded-xl overflow-hidden bg-[#0A0A0B]">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-[#262629]">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" className="min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={onBack}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <p className="font-semibold truncate">{title}</p>
            <p className="text-xs text-gray-500">{detail?.memberCount || 0} members</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {chatKind === 'HOSTED_TABLE' && detail?.isHost && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] text-red-400 border-red-900"
              disabled={deleting}
              onClick={deleteHostedChat}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[44px]">
                <Users className="w-4 h-4 mr-1" />
                Members
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[70vh]">
              <SheetHeader>
                <SheetTitle>Members</SheetTitle>
              </SheetHeader>
              <ul className="mt-4 space-y-2 overflow-y-auto">
                {(detail?.members || []).map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#262629] overflow-hidden">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex items-center justify-center h-full text-xs">{(m.username || '?')[0]}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">@{m.username}</p>
                      <p className="text-xs text-gray-500">{m.fullName}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[55vh] relative">
        {showNew && (
          <button
            type="button"
            className="sticky top-1 left-1/2 -translate-x-1/2 z-10 bg-[var(--sec-accent)] text-black text-xs px-3 py-1 rounded-full"
            onClick={scrollBottom}
          >
            New messages ↓
          </button>
        )}
        {messages.map((m) => {
          const own = m.senderUserId === me?.id;
          return (
            <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start gap-2'}`}>
              {!own && (
                <div className="w-8 h-8 rounded-full bg-[#262629] overflow-hidden flex-shrink-0">
                  {m.sender?.avatarUrl ? (
                    <img src={m.sender.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] flex items-center justify-center h-full">
                      {(m.sender?.username || '?')[0]}
                    </span>
                  )}
                </div>
              )}
              <div className={`max-w-[80%] flex flex-col ${own ? 'items-end' : 'items-start'}`}>
                {!own && <span className="text-[10px] text-gray-500 mb-0.5">@{m.sender?.username}</span>}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    own ? 'bg-[var(--sec-accent)] text-black' : 'bg-[#141416]'
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-[10px] text-gray-600 mt-0.5">{format(new Date(m.sentAt), 'HH:mm')}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-[#262629] flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          className="min-h-[44px]"
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <Button className="min-h-[44px] min-w-[44px]" disabled={!body.trim()} onClick={send}>
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
