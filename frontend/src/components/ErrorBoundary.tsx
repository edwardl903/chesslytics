import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EEEED5',
            fontFamily: "'League Spartan', sans-serif",
            padding: 40,
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: 600 }}>
            <h1 style={{ fontSize: 32, marginBottom: 16 }}>Something broke.</h1>
            <p style={{ marginBottom: 24, opacity: 0.85 }}>
              The app hit an unexpected error. Try reloading; if it keeps happening, let me know
              what you were doing.
            </p>
            <pre
              style={{
                background: 'rgba(0,0,0,0.3)',
                padding: 16,
                borderRadius: 8,
                textAlign: 'left',
                overflow: 'auto',
                fontSize: 12,
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                marginTop: 24,
                padding: '10px 20px',
                background: '#EEEED5',
                color: '#2D6056',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'League Spartan', sans-serif",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
