import React from 'react';

export default function ChatDaySeparator({ label }) {
  if (!label) return null;
  return (
    <div className="sticky top-2 z-10 flex justify-center py-2">
      <span
        className="text-[11px] font-medium rounded-full px-3 py-1"
        style={{
          color: 'var(--sec-text-muted)',
          background: '#141416',
          border: '1px solid #262629',
        }}
      >
        {label}
      </span>
    </div>
  );
}
