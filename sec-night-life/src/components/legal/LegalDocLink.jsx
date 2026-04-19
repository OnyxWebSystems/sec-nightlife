import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * Inline link to an in-app page or external PDF.
 * @param {'route' | 'pdf'} props.variant
 */
export default function LegalDocLink({
  variant = 'route',
  pageName,
  href,
  children,
  className = '',
  icon = true,
}) {
  const style = {
    color: 'var(--sec-accent)',
    textDecoration: 'underline',
    fontWeight: 500,
    ...(!className ? {} : {}),
  };

  if (variant === 'pdf' && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={className ? undefined : style}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {icon ? <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" /> : null}
        </span>
      </a>
    );
  }

  if (pageName) {
    return (
      <Link to={createPageUrl(pageName)} className={className} style={className ? undefined : style}>
        {children}
      </Link>
    );
  }

  return null;
}
