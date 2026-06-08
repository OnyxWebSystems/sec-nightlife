import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Megaphone, Sparkles, ChevronRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

function resolveCtaHref(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return createPageUrl(url.replace(/^\//, ''));
  return url;
}

export default function PlatformAnnouncementBanner({ announcements = [] }) {
  if (!announcements.length) return null;

  return (
    <section style={{ marginBottom: 32 }} aria-label="Official announcements">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {announcements.map((item, index) => {
          const ctaHref = resolveCtaHref(item.ctaUrl);
          const isExternal = ctaHref && /^https?:\/\//i.test(ctaHref);
          return (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'relative',
                borderRadius: 18,
                padding: '1px',
                background: 'var(--sec-gradient-silver)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(192,192,192,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  borderRadius: 17,
                  padding: '20px 22px',
                  background: 'linear-gradient(145deg, #121214 0%, #0A0A0B 55%, #050506 100%)',
                  position: 'relative',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: -40,
                    right: -20,
                    width: 160,
                    height: 160,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(192,192,192,0.14) 0%, transparent 70%)',
                    pointerEvents: 'none',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--sec-accent-muted)',
                      border: '1px solid var(--sec-accent-border)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}
                  >
                    <Megaphone size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent-bright)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: 'var(--sec-accent-bright)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Sparkles size={12} strokeWidth={2} />
                        SEC Official
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--sec-text-muted)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Announcement
                      </span>
                    </div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 600,
                        letterSpacing: '-0.02em',
                        color: 'var(--sec-text-primary)',
                        lineHeight: 1.25,
                      }}
                    >
                      {item.title}
                    </h3>
                    <p
                      style={{
                        margin: '10px 0 0',
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: 'var(--sec-text-secondary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {item.message}
                    </p>
                    {ctaHref && item.ctaLabel ? (
                      <div style={{ marginTop: 16 }}>
                        {isExternal ? (
                          <a
                            href={ctaHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sec-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '10px 18px',
                              borderRadius: 999,
                              textDecoration: 'none',
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#0A0A0B',
                              background: 'var(--sec-gradient-silver)',
                              border: '1px solid var(--sec-accent-border)',
                            }}
                          >
                            {item.ctaLabel}
                            <ChevronRight size={14} />
                          </a>
                        ) : (
                          <Link
                            to={ctaHref}
                            className="sec-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '10px 18px',
                              borderRadius: 999,
                              textDecoration: 'none',
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#0A0A0B',
                              background: 'var(--sec-gradient-silver)',
                              border: '1px solid var(--sec-accent-border)',
                            }}
                          >
                            {item.ctaLabel}
                            <ChevronRight size={14} />
                          </Link>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
