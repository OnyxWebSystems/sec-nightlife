import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const TEMPLATES = [
  { key: 'confirm_arrival_time', label: 'Confirm arrival time' },
  { key: 'running_late', label: 'Running late' },
  { key: 'need_guest_count', label: 'Confirm guest count' },
  { key: 'menu_question', label: 'Menu question' },
  { key: 'see_you_tonight', label: 'See you tonight' },
];

export default function VenueTableThreadPanel({ threadId, onClose }) {
  const [sending, setSending] = useState(false);

  const { data: messages = [], refetch } = useQuery({
    queryKey: ['venue-table-thread-messages', threadId],
    queryFn: () => apiGet(`/api/venue-table-threads/${threadId}/messages`),
    enabled: !!threadId,
    refetchInterval: 15000,
  });

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
          <p className="text-sm text-[var(--sec-text-muted)]">No messages yet. Tap a quick reply below.</p>
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
      <div className="p-4 border-t border-[var(--sec-border)] flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <Button key={t.key} size="sm" variant="outline" disabled={sending} onClick={() => sendTemplate(t.key)}>
            {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
