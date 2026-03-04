import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
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
            onClick={() => window.location.reload()}
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
