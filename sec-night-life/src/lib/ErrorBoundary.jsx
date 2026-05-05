import React from 'react';
import { isStaleChunkLoadError, scheduleChunkReloadOnce } from '@/lib/chunkLoadRecovery';

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App error:', error, errorInfo);
    if (isStaleChunkLoadError(error) && scheduleChunkReloadOnce()) return;
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      const staleChunk = isStaleChunkLoadError(err);
      return (
        <div style={{
          minHeight: '100vh',
          padding: 24,
          backgroundColor: '#0a0a0a',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <h1 style={{ fontSize: 20, color: '#f87171' }}>Something went wrong</h1>
          {staleChunk && (
            <p style={{ maxWidth: 520, textAlign: 'center', color: '#a3a3a3', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              The app was updated while this tab was open. Use Reload to fetch the latest version.
            </p>
          )}
          <pre style={{
            padding: 16,
            background: '#1a1a1a',
            borderRadius: 8,
            overflow: 'auto',
            maxWidth: '100%',
            fontSize: 13,
            color: '#fbbf24',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('_reload', String(Date.now()));
              window.location.replace(url.toString());
            }}
            style={{
              padding: '10px 20px',
              background: '#C9A962',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
