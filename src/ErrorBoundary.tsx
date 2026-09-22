import React from 'react';

// Shows the error instead of a white page if something crashes while rendering.
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#0f0c29', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>Qualcosa è andato storto</h1>
          <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16, wordBreak: 'break-word' }}>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#6366f1', color: '#fff' }}>
            Ricarica
          </button>
        </div>
      </div>
    );
  }
}
