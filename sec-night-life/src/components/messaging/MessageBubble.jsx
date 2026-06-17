import React from 'react';
import { linkifyMessageBody } from '@/lib/linkifyMessageBody';
import { useSwipeToReply } from '@/hooks/useSwipeToReply';

export default function MessageBubble({
  message,
  children,
  onReply,
  className = '',
  style = {},
}) {
  const { onTouchStart, onTouchEnd } = useSwipeToReply(onReply);

  function handleContextMenu(e) {
    e.preventDefault();
    onReply?.(message);
  }

  const replyPreview = message?.replyTo;

  return (
    <div
      className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] ${className}`}
      style={style}
      onTouchStart={onReply ? onTouchStart : undefined}
      onTouchEnd={onReply ? (e) => onTouchEnd(e, message) : undefined}
      onContextMenu={onReply ? handleContextMenu : undefined}
    >
      {replyPreview ? (
        <div
          className="text-[10px] mb-1 px-2 py-1 rounded opacity-80 truncate"
          style={{ borderLeft: '2px solid var(--sec-accent)', color: 'var(--sec-text-muted)' }}
        >
          {replyPreview.body || replyPreview.label || 'Message unavailable'}
        </div>
      ) : null}
      {children ?? (message?.body ? linkifyMessageBody(message.body) : null)}
    </div>
  );
}
