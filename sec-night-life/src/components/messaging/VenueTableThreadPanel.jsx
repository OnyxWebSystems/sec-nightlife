import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { dispatchMessagesRefresh } from '@/lib/messagesRefresh';
import {
  GUEST_REPLY_TEMPLATES,
} from '@/lib/venueTableMessageTemplates';

export default function VenueTableThreadPanel({ threadId, onClose, memberStatus = 'APPROVED' }) {
  const [sending, setSending] = useState(false);

  const { data: messages = [], refetch, isSuccess } = useQuery({
    queryKey: ['venue-table-thread-messages', threadId],
    queryFn: () => apiGet(`/api/venue-table-threads/${threadId}/messages`),
    enabled: !!threadId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (isSuccess && threadId) dispatchMessagesRefresh();
  }, [isSuccess, threadId, messages.length]);

  const templates =
    memberStatus === 'DECLINED' ? GUEST_REPLY_TEMPLATES : [];

  async function sendTemplate(templateKey) {
    setSending(true);
    try {
      await apiPost(`/api/venue-table-threads/${threadId}/messages`, { templateKey });
      await refetch();
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--sec-bg-base)]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--sec-border)]">
        <button type="button" onClick={onClose} className="sec-btn sec-btn-ghost sec-btn-sm">
          Back
        </button>
        <h2 className="font-semibold text-sm">Table messages</h2>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--sec-text-muted)]">
            {memberStatus === 'DECLINED'
              ? 'Your request was declined. Tap a quick reply below.'
              : 'No messages yet.'}
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="text-sm p-3 rounded-xl max-w-[90%]"
              style={{
                marginLeft: m.isMine ? 'auto' : 0,
                background: m.isMine ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
              }}
            >
              <div className="text-[10px] text-[var(--sec-text-muted)]">{m.senderLabel}</div>
              <div>{m.label}</div>
            </div>
          ))
        )}
      </div>
      {templates.length > 0 ? (
        <div className="p-4 border-t border-[var(--sec-border)] flex flex-wrap gap-2">
          {templates.map((t) => (
            <Button key={t.key} size="sm" variant="outline" disabled={sending} onClick={() => sendTemplate(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      ) : memberStatus !== 'DECLINED' ? (
        <div className="p-4 border-t border-[var(--sec-border)]">
          <p className="text-xs text-[var(--sec-text-muted)]">Quick replies are available after your request is approved.</p>
        </div>
      ) : null}
    </div>
  );
}
