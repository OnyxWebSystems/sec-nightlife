import React from 'react';

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]"'])/gi;

export function linkifyMessageBody(text) {
  if (!text) return null;
  const parts = String(text).split(URL_RE);
  return parts.map((part, i) => {
    if (URL_RE.test(part)) {
      URL_RE.lastIndex = 0;
      return (
        <a
          key={`${part}-${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
          style={{ color: 'var(--sec-accent)' }}
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
