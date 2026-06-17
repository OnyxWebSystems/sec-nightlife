import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Trash2, MessageSquareX } from 'lucide-react';
import { dispatchMessagesRefresh } from '@/lib/messagesRefresh';
import { useMessageReply } from '@/hooks/useMessageReply';
import MessageReplyPreview from '@/components/messaging/MessageReplyPreview';
import MessageBubble from '@/components/messaging/MessageBubble';
import { GUEST_REPLY_TEMPLATES } from '@/lib/venueTableMessageTemplates';
import { useIsMobile } from '@/hooks/useIsDesktop';

export default function VenueTableThreadPanel({
  threadId,
  onClose,
  memberStatus = 'APPROVED',
  onDeleted,
  hideHeader = false,
}) {
  const isMobile = useIsMobile();
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const { replyingTo, setReplyingTo, clearReply } = useMessageReply();

  const { data: messages = [], refetch, isSuccess } = useQuery({
    queryKey: ['venue-table-thread-messages', threadId],
    queryFn: () => apiGet(`/api/venue-table-threads/${threadId}/messages`),
    enabled: !!threadId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (isSuccess && threadId) dispatchMessagesRefresh();
  }, [isSuccess, threadId, messages.length]);

  const templates = memberStatus === 'DECLINED' ? GUEST_REPLY_TEMPLATES : [];

  async function deleteChat() {
    if (!window.confirm('Delete this chat? It will be removed from your messages.')) return;
    setDeletingChat(true);
    try {
      await apiDelete(`/api/venue-table-threads/${threadId}`);
      toast.success('Chat deleted');
      if (onDeleted) onDeleted();
      else onClose();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not delete chat');
    } finally {
      setDeletingChat(false);
    }
  }

  async function deleteMessage(messageId) {
    setDeletingId(messageId);
    try {
      await apiDelete(`/api/venue-table-threads/${threadId}/messages/${messageId}`);
      await refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not delete message');
    } finally {
      setDeletingId(null);
    }
  }

  async function sendTemplate(templateKey) {
    setSending(true);
    try {
      await apiPost(`/api/venue-table-threads/${threadId}/messages`, {
        templateKey,
        ...(replyingTo?.id ? { replyToMessageId: replyingTo.id } : {}),
      });
      clearReply();
      await refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  const shellClass = isMobile
    ? 'flex flex-col fixed inset-0 z-30 bg-[var(--sec-bg-base)] lg:static lg:z-auto lg:rounded-xl lg:border lg:border-[var(--sec-border)] lg:min-h-[70vh]'
    : 'flex flex-col h-full min-h-0 bg-[var(--sec-bg-base)]';

  return (
    <div className={shellClass}>
      {!hideHeader ? (
        <header
          className="flex items-center gap-3 px-4 py-3 border-b border-[var(--sec-border)] shrink-0"
          style={{ paddingTop: isMobile ? 'max(12px, env(safe-area-inset-top))' : undefined }}
        >
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--sec-bg-elevated)' }}
            aria-label="Go back"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-semibold text-sm flex-1">Table messages</h2>
          <button
            type="button"
            onClick={deleteChat}
            disabled={deletingChat}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--sec-text-muted)] hover:text-red-400"
            title="Delete chat"
          >
            <MessageSquareX size={16} />
          </button>
        </header>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--sec-text-muted)]">
            {memberStatus === 'DECLINED'
              ? 'Your request was declined. Tap a quick reply below.'
              : 'No messages yet.'}
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex w-full min-w-0 ${m.isMine ? 'justify-end' : 'justify-start'}`}>
              <MessageBubble
                message={m}
                onReply={setReplyingTo}
                className="text-sm p-3 rounded-xl max-w-[min(90%,calc(100vw-3rem))] min-w-0"
                style={{
                  marginLeft: m.isMine ? 'auto' : 0,
                  background: m.isMine ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[var(--sec-text-muted)]">{m.senderLabel}</span>
                  {m.isMine ? (
                    <button
                      type="button"
                      className="text-[var(--sec-text-muted)] hover:text-red-400 p-1"
                      disabled={deletingId === m.id}
                      onClick={() => deleteMessage(m.id)}
                      title="Delete message"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
                <div className="break-words [overflow-wrap:anywhere]">{m.label}</div>
              </MessageBubble>
            </div>
          ))
        )}
      </div>

      {templates.length > 0 ? (
        <div
          className="p-4 border-t border-[var(--sec-border)] shrink-0"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <MessageReplyPreview replyingTo={replyingTo} onClear={clearReply} labelKey="label" />
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button key={t.key} size="sm" variant="outline" disabled={sending} onClick={() => sendTemplate(t.key)}>
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      ) : memberStatus !== 'DECLINED' ? (
        <div
          className="p-4 border-t border-[var(--sec-border)] shrink-0"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <p className="text-xs text-[var(--sec-text-muted)]">
            Quick replies are available after your request is approved.
          </p>
        </div>
      ) : null}
    </div>
  );
}
