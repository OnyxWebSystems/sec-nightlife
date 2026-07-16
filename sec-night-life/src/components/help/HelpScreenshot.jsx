import React from 'react';

/**
 * @param {{ src: string, alt: string, caption?: string, path?: string, illustrative?: boolean }} props
 */
export default function HelpScreenshot({ src, alt, caption, path, illustrative }) {
  return (
    <figure className="my-4">
      {path ? (
        <p
          className="text-[10px] uppercase tracking-[0.14em] font-medium mb-2 px-0.5"
          style={{ color: 'var(--sec-accent)' }}
        >
          {path}
        </p>
      ) : null}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(192, 192, 192, 0.22)',
          backgroundColor: 'var(--sec-bg-elevated)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-auto block"
          style={{ backgroundColor: '#0a0a0b' }}
        />
      </div>
      {(caption || illustrative) && (
        <figcaption
          className="text-xs mt-2 px-0.5"
          style={{ color: 'var(--sec-text-muted)', lineHeight: 1.45 }}
        >
          {caption}
          {illustrative ? (
            <span className="opacity-80">
              {caption ? ' · ' : ''}
              Illustrative UI
            </span>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}
