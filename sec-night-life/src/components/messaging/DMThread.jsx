import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost } from '@/api/client';
import { format } from 'date-fns';
import * as authService from '@/services/authService';

export default function DMThread({ conversationId, onBack }) {
  const [me, setMe] = useState(null);
  const [messages, setMessages] = useState([]);
  const [other, setOther] = useState(null);
  const [body, setBody] = useState('');
  const [blocked, setBlocked] = useState(false);
  const bottomRef = useRef(null);
  const lastPollRef = useRef(null);

  useEffect(() => {
    authService.getCurrentUser().then(setMe).catch(() => {});
  }, []);

  const load = async () => {
    const rows = await apiGet(`/api/messages/conversations/${conversationId}`);
    setMessages(rows || []);
    if (rows?.length) lastPollRef.current = rows[rows.length - 1]?.sentAt;
  };

  const loadMeta = async () => {
    const convs = await apiGet('/api/messages/conversations');
    const c = (convs || []).find((x) => x.conversationId === conversationId);
    if (c?.participant) setOther(c.participant);
  };

  useEffect(() => {
    loadMeta();
    load();
    const id = setInterval(async () => {
      try {
        const rows = await apiGet(`/api/messages/conversations/${conversationId}`);
        if (!rows?.length) return;
        const last = rows[rows.length - 1];
        if (lastPollRef.current && new Date(last.sentAt) <= new Date(lastPollRef.current)) return;
        setMessages(rows);
        lastPollRef.current = last.sentAt;
      } catch {}
    }, 15000);
    return () => clearInterval(id);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const t = body.trim();
    if (!t) return;
    try {
      setBlocked(false);
      await apiPost(`/api/messages/conversations/${conversationId}`, { body: t });
      setBody('');
      await load();
    } catch (e) {
      if (e?.status === 403) setBlocked(true);
      else console.error(e);
    }
  };

  const lastOwn = [...messages].reverse().find((m) => m.senderUserId === me?.id);

  return (
    <div className="flex flex-col min-h-[70vh] max-w-[480px] mx-auto border border-[#262629] rounded-xl overflow-hidden bg-[#0A0A0B]">
      <div className="flex items-center gap-2 p-3 border-b border-[#262629]">
        <button type="button" className="min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={onBack}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="w-10 h-10 rounded-full bg-[#262629] overflow-hidden flex-shrink-0">
          {other?.avatarUrl ? (
            <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm">
              {(other?.fullName || '?')[0]}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{other?.fullName || 'Chat'}</p>
          <p className="text-xs text-gray-500 truncate">@{other?.username || 'user'}</p>
        </div>
      </div>

      {blocked && (
        <div className="bg-amber-900/40 text-amber-200 text-xs px-3 py-2">
          You are no longer friends. Send a friend request to message again.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[55vh]">
        {messages.map((m) => {
          const own = m.senderUserId === me?.id;
          return (
            <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start gap-2'}`}>
              {!own && (
                <div className="w-8 h-8 rounded-full bg-[#262629] overflow-hidden flex-shrink-0">
                  {other?.avatarUrl ? (
                    <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] flex items-center justify-center h-full">{(other?.username || '?')[0]}</span>
                  )}
                </div>
              )}
              <div className={`max-w-[80%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    own ? 'bg-[var(--sec-accent)] text-black' : 'bg-[#141416] text-white'
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-[10px] text-gray-600 mt-0.5">
                  {format(new Date(m.sentAt), 'HH:mm')}
                </span>
                {own && m.readAt && lastOwn?.id === m.id && (
                  <span className="text-[10px] text-gray-500">Read</span>
                )}
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
        <Button className="min-h-[44px] min-w-[44px] px-3" disabled={!body.trim()} onClick={send}>
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
