import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/api/client';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MessageSquareX, Megaphone } from 'lucide-react';
import { dispatchMessagesRefresh } from '@/lib/messagesRefresh';

export default function PromoterVenueThreadPanel({ threadId, onClose, onDeleted, isBusiness = false }) {
  const [sending, setSending] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [messageBody, setMessageBody] = useState('');

  const { data, refetch, isSuccess } = useQuery({
    queryKey: ['promoter-venue-thread', threadId],
    queryFn: () => apiGet(`/api/promoter-venue-threads/${threadId}/messages`),
    enabled: !!threadId,
    refetchInterval: 15000,
  });

  const messages = data?.messages || [];
  const thread = data?.thread;
  const assignments = data?.assignments || [];

  useEffect(() => {
    if (isSuccess && threadId) dispatchMessagesRefresh();
  }, [isSuccess, threadId, messages.length]);

  async function deleteChat() {
    if (!window.confirm('Delete this chat? It will be removed from your messages.')) return;
    setDeletingChat(true);
    try {
      await apiDelete(`/api/promoter-venue-threads/${threadId}`);
      toast.success('Chat deleted');
      if (onDeleted) onDeleted();
      else onClose();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not delete chat');
    } finally {
      setDeletingChat(false);
    }
  }

  async function sendMessage() {
    if (!messageBody.trim()) return;
    setSending(true);
    try {
      await apiPost(`/api/promoter-venue-threads/${threadId}/messages`, { body: messageBody.trim() });
      setMessageBody('');
      await refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  const headerTitle = isBusiness
    ? thread?.promoterUsername || thread?.promoterName || 'Promoter'
    : thread?.venueName || 'Venue';

  return (
    <div className="flex flex-col h-full bg-[var(--sec-bg-base)]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--sec-border)]">
        <button type="button" onClick={onClose} className="sec-btn sec-btn-ghost sec-btn-sm">
          Back
        </button>
        <h2 className="font-semibold text-sm flex-1 truncate">{headerTitle}</h2>
        <button
          type="button"
          onClick={deleteChat}
          disabled={deletingChat}
          className="sec-btn sec-btn-ghost sec-btn-sm text-[var(--sec-text-muted)] hover:text-red-400"
          title="Delete chat"
        >
          <MessageSquareX size={16} />
        </button>
      </header>

      {assignments.length > 0 ? (
        <div className="px-4 py-3 border-b border-[var(--sec-border)] bg-[var(--sec-bg-elevated)]">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1">
            <Megaphone size={12} /> Assigned events
          </p>
          <ul className="space-y-1">
            {assignments.map((a) => (
              <li key={a.eventId}>
                <Link
                  to={createPageUrl(`EventDetails?id=${a.eventId}`)}
                  className="text-xs text-[var(--sec-accent)] underline"
                >
                  {a.title}
                  {a.date ? ` · ${new Date(a.date).toLocaleDateString('en-ZA')}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--sec-text-muted)]">
            {isBusiness
              ? 'Message your promoter here. Event assignments appear automatically.'
              : 'Event assignments and messages from the venue appear here.'}
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="text-sm p-3 rounded-xl max-w-[90%]"
              style={{
                marginLeft: m.isMine ? 'auto' : 0,
                background: m.kind === 'ASSIGNMENT'
                  ? 'rgba(234, 179, 8, 0.12)'
                  : m.isMine
                    ? 'var(--sec-accent-muted)'
                    : 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
              }}
            >
              <div className="text-[10px] text-[var(--sec-text-muted)] mb-1">{m.senderLabel}</div>
              <div>{m.body}</div>
              {m.kind === 'ASSIGNMENT' && m.eventId ? (
                <Link
                  to={createPageUrl(`EventDetails?id=${m.eventId}`)}
                  className="text-xs text-[var(--sec-accent)] underline mt-2 inline-block"
                >
                  Open event
                </Link>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-[var(--sec-border)]">
        <textarea
          className="sec-input w-full min-h-[72px] mb-2"
          value={messageBody}
          onChange={(e) => setMessageBody(e.target.value)}
          placeholder={isBusiness ? 'Message promoter…' : 'Message venue…'}
        />
        <Button className="w-full" disabled={!messageBody.trim() || sending} onClick={sendMessage}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
