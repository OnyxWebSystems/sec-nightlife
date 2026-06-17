import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]"'])/gi;

function stripTrailingPunctuation(url) {
  let u = url;
  while (u.length && /[.,;:!?)\]'"]$/.test(u)) u = u.slice(0, -1);
  return u;
}

function venueIdFromShareUrl(href) {
  const clean = stripTrailingPunctuation(href.trim());
  try {
    const u = new URL(clean);
    const lastSeg = u.pathname.split('/').filter(Boolean).pop() || '';
    if (lastSeg === 'VenueProfile' || u.pathname.endsWith('/VenueProfile')) {
      return u.searchParams.get('id') || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Render message body with linkified URLs and optional venue profile links.
 * @param {string} text
 * @param {{ isOwn?: boolean, linkClassName?: string }} opts
 */
export function linkifyMessageBody(text, { isOwn = false, linkClassName = '' } = {}) {
  if (!text) return null;
  const defaultLinkClass = isOwn
    ? 'underline break-all text-black/90 hover:text-black font-medium'
    : 'underline break-all text-[var(--sec-accent)] hover:opacity-90 font-medium';
  const linkClass = linkClassName || defaultLinkClass;

  const parts = String(text).split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part)) {
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }
        const cleanHref = stripTrailingPunctuation(part.trim());
        const venueId = venueIdFromShareUrl(part);
        if (venueId) {
          return (
            <Link key={i} to={createPageUrl(`VenueProfile?id=${venueId}`)} className={linkClass}>
              {part}
            </Link>
          );
        }
        return (
          <a key={i} href={cleanHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {part}
          </a>
        );
      })}
    </span>
  );
}
