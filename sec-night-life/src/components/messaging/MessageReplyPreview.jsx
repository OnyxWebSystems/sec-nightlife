import React from 'react';
import { X } from 'lucide-react';

export default function MessageReplyPreview({ replyingTo, onClear, labelKey = 'body' }) {
  if (!replyingTo) return null;
  const preview =
    replyingTo[labelKey] ||
    replyingTo.body ||
    replyingTo.label ||
    replyingTo.displayLabel ||
    'Message';
  return (
    <div
      className="flex items-start gap-2 px-3 py-2 mb-2 rounded-lg text-xs"
      style={{ background: 'var(--sec-bg-elevated)', borderLeft: '3px solid var(--sec-accent)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold mb-0.5" style={{ color: 'var(--sec-accent)' }}>
          Replying to
        </p>
        <p className="truncate" style={{ color: 'var(--sec-text-muted)' }}>
          {preview}
        </p>
      </div>
      <button type="button" onClick={onClear} className="p-1" aria-label="Cancel reply">
        <X size={14} />
      </button>
    </div>
  );
}
